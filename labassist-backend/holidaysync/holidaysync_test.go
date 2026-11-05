package holidaysync

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"labassist/database"
	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

const goodFile = `{"source":"DGA","year":2026,"holidays":[
 {"date":"2026-10-23","name_th":"วันปิยมหาราช","name_en":"Chulalongkorn Day","type":"public_holiday","is_substitution":false,"note":null},
 {"date":"2026-12-07","name_th":"วันหยุดชดเชย","type":"substitution_holiday","is_substitution":true}]}`

func TestParse(t *testing.T) {
	got, err := Parse([]byte(goodFile), 2026)
	if err != nil || len(got) != 2 {
		t.Fatalf("Parse = %v, %v", got, err)
	}
	if got[1].Type != "substitution_holiday" || got[0].Date.Format("2006-01-02") != "2026-10-23" || got[0].Name != "วันปิยมหาราช" {
		t.Errorf("parsed %+v", got)
	}

	bad := map[string]string{
		"not json":           `<html>`,
		"wrong year":         `{"year":2025,"holidays":[{"date":"2025-01-01","name_th":"x","type":"public_holiday"}]}`,
		"bad date":           `{"year":2026,"holidays":[{"date":"2026-13-40","name_th":"x","type":"public_holiday"}]}`,
		"date in other year": `{"year":2026,"holidays":[{"date":"2027-01-01","name_th":"x","type":"public_holiday"}]}`,
		"empty name":         `{"year":2026,"holidays":[{"date":"2026-01-01","name_th":"  ","type":"public_holiday"}]}`,
		"long name":          `{"year":2026,"holidays":[{"date":"2026-01-01","name_th":"` + strings.Repeat("ก", 201) + `","type":"public_holiday"}]}`,
		"no type":            `{"year":2026,"holidays":[{"date":"2026-01-01","name_th":"x"}]}`,
		"duplicate date":     `{"year":2026,"holidays":[{"date":"2026-01-01","name_th":"x","type":"a"},{"date":"2026-01-01","name_th":"y","type":"a"}]}`,
		// One bad entry among good ones rejects the whole file.
		"one bad entry": `{"year":2026,"holidays":[{"date":"2026-01-01","name_th":"x","type":"a"},{"date":"oops","name_th":"y","type":"a"}]}`,
	}
	for name, body := range bad {
		if _, err := Parse([]byte(body), 2026); err == nil || errors.Is(err, ErrNoData) {
			t.Errorf("%s: err = %v, want a validation error", name, err)
		}
	}
	for _, body := range []string{`{"year":2026,"holidays":[]}`, `{"year":2026}`, `{}`} {
		if _, err := Parse([]byte(body), 2026); !errors.Is(err, ErrNoData) {
			t.Errorf("%s: err = %v, want ErrNoData", body, err)
		}
	}
}

func TestNewChecksURLTemplate(t *testing.T) {
	for _, u := range []string{"https://x/holidays.json", "https://x/%d/%d.json"} {
		if _, err := New(Config{URLTemplate: u}); err == nil {
			t.Errorf("template %q accepted", u)
		}
	}
	s, err := New(Config{})
	if err != nil || s.Config().URLTemplate != DefaultURLTemplate || s.Config().Interval != 24*time.Hour {
		t.Errorf("defaults not applied: %+v, %v", s, err)
	}
}

func TestYears(t *testing.T) {
	s, _ := New(Config{YearsBack: 1, YearsAhead: 1})
	s.now = func() time.Time { return time.Date(2026, 12, 31, 20, 0, 0, 0, time.UTC) } // already 2027 in Bangkok
	got := s.Years()
	if len(got) != 3 || got[0] != 2026 || got[2] != 2028 {
		t.Errorf("years = %v, want 2026..2028", got)
	}
}

// serve answers every year's request with the given status and body.
func serve(t *testing.T, status int, body string) *Service {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	s, err := New(Config{URLTemplate: srv.URL + "/%d.json", Timeout: 2 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestFetchHandlesSourceProblems(t *testing.T) {
	ctx := context.Background()
	if got, err := serve(t, 200, goodFile).fetch(ctx, 2026); err != nil || len(got) != 2 {
		t.Fatalf("good file: %v, %v", got, err)
	}
	if _, err := serve(t, 404, "Not Found").fetch(ctx, 2027); !errors.Is(err, ErrNoData) {
		t.Errorf("404: err = %v, want ErrNoData", err)
	}
	if _, err := serve(t, 500, "boom").fetch(ctx, 2026); err == nil || errors.Is(err, ErrNoData) {
		t.Errorf("500: err = %v, want a failure", err)
	}
	if _, err := serve(t, 200, "<html>").fetch(ctx, 2026); err == nil || errors.Is(err, ErrNoData) {
		t.Errorf("html: err = %v, want a failure", err)
	}
	if _, err := serve(t, 200, strings.Repeat(" ", maxBodyBytes+10)).fetch(ctx, 2026); err == nil {
		t.Error("oversized body accepted")
	}
	// Unreachable source.
	s, _ := New(Config{URLTemplate: "http://127.0.0.1:1/%d.json", Timeout: time.Second})
	if _, err := s.fetch(ctx, 2026); err == nil || errors.Is(err, ErrNoData) {
		t.Errorf("unreachable: err = %v, want a failure", err)
	}
}

// openDB points database.DB at an empty disposable MySQL database
// (LABASSIST_TEST_MYSQL_DSN) with the tables the sync touches recreated.
func openDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to an empty disposable MySQL database")
	}
	old := database.DB
	t.Cleanup(func() { database.DB = old })
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	database.DB = db
	tables := []any{&models.CalendarDate{}, &models.CalendarDateExclusion{}, &models.HolidaySyncRun{},
		&models.StaffCase{}, &models.WorkOccurrence{}, &models.Notification{}, &models.Course{}}
	if err := db.Migrator().DropTable(tables...); err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(tables...); err != nil {
		t.Fatal(err)
	}
}

func clockAt(s *Service, ts string) {
	d, _ := time.Parse(time.RFC3339, ts)
	s.now = func() time.Time { return d }
}

func lastRun(t *testing.T, year int) models.HolidaySyncRun {
	t.Helper()
	var r models.HolidaySyncRun
	if err := database.DB.Where("year = ?", year).Order("id DESC").First(&r).Error; err != nil {
		t.Fatal(err)
	}
	return r
}

func TestSyncYearImportsThenRepeatsWithoutDuplicates(t *testing.T) {
	openDB(t)
	s := serve(t, 200, goodFile)
	clockAt(s, "2027-01-02T00:00:00+07:00") // after every holiday: no work-day follow-up
	uid := uint(5)

	run := s.SyncYear(context.Background(), 2026, TriggerManual, &uid)
	if run.Status != models.HolidaySyncSuccess || run.Created != 2 || run.Total != 2 || run.TriggeredByID == nil || *run.TriggeredByID != 5 {
		t.Fatalf("first run = %+v", run)
	}
	run = s.SyncYear(context.Background(), 2026, TriggerScheduled, nil)
	if run.Status != models.HolidaySyncSuccess || run.Created != 0 || run.Unchanged != 2 {
		t.Fatalf("second run = %+v", run)
	}
	var n int64
	database.DB.Model(&models.CalendarDate{}).Count(&n)
	if n != 2 {
		t.Errorf("%d holidays stored, want 2", n)
	}
	if got := lastRun(t, 2026); got.Trigger != TriggerScheduled || got.FinishedAt.IsZero() {
		t.Errorf("recorded run = %+v", got)
	}
}

func TestSyncYearKeepsDataWhenSourceFails(t *testing.T) {
	openDB(t)
	good := serve(t, 200, goodFile)
	clockAt(good, "2027-01-02T00:00:00+07:00")
	good.SyncYear(context.Background(), 2026, TriggerScheduled, nil)

	for name, tc := range map[string]struct {
		status int
		body   string
		want   string
	}{
		"server error":     {500, "boom", models.HolidaySyncFailed},
		"invalid json":     {200, "<html>", models.HolidaySyncFailed},
		"invalid holiday":  {200, `{"year":2026,"holidays":[{"date":"bad","name_th":"x","type":"a"}]}`, models.HolidaySyncFailed},
		"year not yet out": {404, "Not Found", models.HolidaySyncNoData},
		"empty year":       {200, `{"year":2026,"holidays":[]}`, models.HolidaySyncNoData},
	} {
		s := serve(t, tc.status, tc.body)
		clockAt(s, "2027-01-02T00:00:00+07:00")
		run := s.SyncYear(context.Background(), 2026, TriggerScheduled, nil)
		if run.Status != tc.want || run.Message == "" {
			t.Errorf("%s: run = %+v, want status %s with a message", name, run, tc.want)
		}
		rows, _ := database.ListExternalHolidays(2026)
		if len(rows) != 2 || rows[0].Name != "วันปิยมหาราช" {
			t.Errorf("%s: stored holidays changed: %+v", name, rows)
		}
		if got := lastRun(t, 2026); got.Status != tc.want {
			t.Errorf("%s: recorded status %q", name, got.Status)
		}
	}
}

func TestSyncAllCoversConfiguredYearsAndSurvivesOneFailing(t *testing.T) {
	openDB(t)
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		switch r.URL.Path {
		case "/2026.json":
			w.Write([]byte(goodFile))
		case "/2025.json":
			w.WriteHeader(500)
		default:
			w.WriteHeader(404) // 2027: not published yet
		}
	}))
	defer srv.Close()
	s, _ := New(Config{URLTemplate: srv.URL + "/%d.json", YearsBack: 1, YearsAhead: 1})
	s.now = func() time.Time { return time.Date(2026, 12, 20, 0, 0, 0, 0, time.UTC) }

	runs, ran, err := s.SyncAll(context.Background(), TriggerManual, nil)
	if err != nil || !ran || len(runs) != 3 || atomic.LoadInt32(&hits) != 3 {
		t.Fatalf("runs=%d ran=%v err=%v hits=%d", len(runs), ran, err, hits)
	}
	got := map[int]string{}
	for _, r := range runs {
		got[r.Year] = r.Status
	}
	if got[2025] != models.HolidaySyncFailed || got[2026] != models.HolidaySyncSuccess || got[2027] != models.HolidaySyncNoData {
		t.Errorf("statuses = %v", got)
	}
}

func TestSyncAllDoesNotOverlap(t *testing.T) {
	openDB(t)
	s := serve(t, 200, goodFile)
	var inner bool
	ran, err := database.WithHolidaySyncLock(func() error {
		var innerErr error
		_, inner, innerErr = s.SyncAll(context.Background(), TriggerManual, nil)
		return innerErr
	})
	if err != nil || !ran || inner {
		t.Errorf("outer ran=%v inner ran=%v err=%v; want true, false, nil", ran, inner, err)
	}
}

func TestFollowUpOnlyCancelsUpcomingHolidays(t *testing.T) {
	openDB(t)
	db := database.DB
	sc := models.StaffCase{PostingID: 1, CourseID: 1, Semester: "1", AcademicYear: 2569, Status: models.StaffCaseOpen, CreatedByID: 1}
	if err := db.Create(&sc).Error; err != nil {
		t.Fatal(err)
	}
	day := func(s string) time.Time { d, _ := time.Parse("2006-01-02", s); return d }
	for _, d := range []string{"2026-10-23", "2026-12-07"} { // one past, one upcoming (today = 2026-11-05)
		if err := db.Create(&models.WorkOccurrence{StaffCaseID: sc.ID, ScheduledDate: day(d), StartTime: "13:00", EndTime: "16:00",
			Status: models.OccurrenceScheduled}).Error; err != nil {
			t.Fatal(err)
		}
	}
	s := serve(t, 200, goodFile)
	clockAt(s, "2026-11-05T09:00:00+07:00")
	if run := s.SyncYear(context.Background(), 2026, TriggerScheduled, nil); run.Status != models.HolidaySyncSuccess || run.Created != 2 {
		t.Fatalf("run = %+v", run)
	}
	status := func(d string) models.OccurrenceStatus {
		var o models.WorkOccurrence
		db.Where("scheduled_date = ?", d).First(&o)
		return o.Status
	}
	if got := status("2026-12-07"); got != models.OccurrenceCancelledHoliday {
		t.Errorf("upcoming holiday: occurrence is %q, want cancelled_holiday", got)
	}
	if got := status("2026-10-23"); got != models.OccurrenceScheduled {
		t.Errorf("past holiday: occurrence is %q, want it left scheduled", got)
	}
}
