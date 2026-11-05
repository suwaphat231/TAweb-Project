package database

import (
	"os"
	"testing"
	"time"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// openHolidayTestDB points DB at an empty disposable MySQL database
// (LABASSIST_TEST_MYSQL_DSN) with the holiday tables recreated.
func openHolidayTestDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to an empty disposable MySQL database")
	}
	old := DB
	t.Cleanup(func() { DB = old })
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	DB = db
	tables := []any{&models.CalendarDate{}, &models.CalendarDateExclusion{}, &models.HolidaySyncRun{}}
	if err := DB.Migrator().DropTable(tables...); err != nil {
		t.Fatal(err)
	}
	if err := DB.AutoMigrate(tables...); err != nil {
		t.Fatal(err)
	}
}

func holiday(date, name, typ string) ExternalHoliday {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		panic(err)
	}
	return ExternalHoliday{Date: d, Name: name, Type: typ}
}

func TestUpsertExternalHolidaysCreatesAndIsIdempotent(t *testing.T) {
	openHolidayTestDB(t)
	src := []ExternalHoliday{
		holiday("2026-10-23", "วันปิยมหาราช", "public_holiday"),
		holiday("2026-12-07", "วันหยุดชดเชย", "substitution_holiday"),
	}
	t1 := time.Date(2026, 11, 1, 3, 0, 0, 0, time.UTC)
	res, err := UpsertExternalHolidays(2026, src, t1)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) != 2 || res.Updated != 0 || res.Unchanged != 0 {
		t.Fatalf("first sync = %+v", res)
	}
	rows, _ := ListExternalHolidays(2026)
	if len(rows) != 2 {
		t.Fatalf("stored %d rows", len(rows))
	}
	r := rows[1]
	if r.Scope != models.DateScopeGlobal || r.DateType != models.DateTypePublicHoliday ||
		r.Source != models.DateSourceExternal || r.ExternalType != "substitution_holiday" ||
		r.AffectsWork == nil || !*r.AffectsWork || r.SyncedAt == nil {
		t.Errorf("row not stored as expected: %+v", r)
	}

	// Same data again: no duplicates, only the sync stamp moves.
	t2 := t1.Add(24 * time.Hour)
	res, err = UpsertExternalHolidays(2026, src, t2)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) != 0 || res.Unchanged != 2 || res.Updated != 0 {
		t.Fatalf("second sync = %+v", res)
	}
	var n int64
	DB.Model(&models.CalendarDate{}).Count(&n)
	if n != 2 {
		t.Fatalf("%d rows after repeat sync, want 2", n)
	}
	rows, _ = ListExternalHolidays(2026)
	if rows[0].SyncedAt == nil || !rows[0].SyncedAt.Equal(t2) {
		t.Errorf("synced_at = %v, want %v", rows[0].SyncedAt, t2)
	}
}

func TestUpsertExternalHolidaysUpdatesChangedRow(t *testing.T) {
	openHolidayTestDB(t)
	now := time.Now()
	if _, err := UpsertExternalHolidays(2026, []ExternalHoliday{holiday("2026-12-05", "ชื่อเดิม", "public_holiday")}, now); err != nil {
		t.Fatal(err)
	}
	before, _ := ListExternalHolidays(2026)

	res, err := UpsertExternalHolidays(2026, []ExternalHoliday{holiday("2026-12-05", "ชื่อใหม่", "special_holiday")}, now)
	if err != nil {
		t.Fatal(err)
	}
	if res.Updated != 1 || len(res.Created) != 0 {
		t.Fatalf("result = %+v", res)
	}
	after, _ := ListExternalHolidays(2026)
	if len(after) != 1 || after[0].ID != before[0].ID || after[0].Name != "ชื่อใหม่" || after[0].ExternalType != "special_holiday" {
		t.Errorf("row not updated in place: %+v", after)
	}
}

func TestUpsertExternalHolidaysNeverTouchesManualRows(t *testing.T) {
	openHolidayTestDB(t)
	yes := true
	manual := func(date, name string, scope models.CalendarDateScope, typ models.CalendarDateType) models.CalendarDate {
		d, _ := time.Parse("2006-01-02", date)
		cd := models.CalendarDate{Date: d, Name: name, DateType: typ, Scope: scope, AffectsWork: &yes, CreatedByID: 7}
		if scope == models.DateScopeSemester {
			cd.Semester, cd.AcademicYear = "1", 2569
		}
		return cd
	}
	// Staff's own rows: a global holiday, a same-name term holiday, and an
	// unrelated no-class day on a date the source also lists.
	seed := []models.CalendarDate{
		manual("2026-10-23", "วันปิยมหาราช (เจ้าหน้าที่)", models.DateScopeGlobal, models.DateTypePublicHoliday),
		manual("2026-12-10", "วันรัฐธรรมนูญ", models.DateScopeSemester, models.DateTypePublicHoliday),
		manual("2026-12-31", "งดสอนพิเศษ", models.DateScopeSemester, models.DateTypeNoClass),
	}
	for _, s := range seed {
		if _, err := CreateCalendarDate(s); err != nil {
			t.Fatal(err)
		}
	}
	res, err := UpsertExternalHolidays(2026, []ExternalHoliday{
		holiday("2026-10-23", "วันปิยมหาราช", "public_holiday"),     // global manual on that date: skipped
		holiday("2026-12-10", "  วันรัฐธรรมนูญ ", "public_holiday"), // same name (whitespace differs): skipped
		holiday("2026-12-31", "วันสิ้นปี", "public_holiday"),        // only a no-class day there: imported
	}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if res.SkippedManual != 2 || len(res.Created) != 1 {
		t.Fatalf("result = %+v", res)
	}

	// Manual rows are exactly as staff left them.
	var manuals []models.CalendarDate
	DB.Where("source = ?", models.DateSourceManual).Order("date").Find(&manuals)
	if len(manuals) != 3 || manuals[0].Name != "วันปิยมหาราช (เจ้าหน้าที่)" || manuals[0].ExternalKey != nil || manuals[0].SyncedAt != nil {
		t.Errorf("manual rows changed: %+v", manuals)
	}

	// An empty sync cannot remove them either.
	if _, err := UpsertExternalHolidays(2026, nil, time.Now()); err != nil {
		t.Fatal(err)
	}
	var n int64
	DB.Model(&models.CalendarDate{}).Where("source = ?", models.DateSourceManual).Count(&n)
	if n != 3 {
		t.Errorf("%d manual rows left, want 3", n)
	}
}

func TestUpsertExternalHolidaysRespectsStaffDeletion(t *testing.T) {
	openHolidayTestDB(t)
	src := []ExternalHoliday{holiday("2026-12-31", "วันสิ้นปี", "public_holiday")}
	if _, err := UpsertExternalHolidays(2026, src, time.Now()); err != nil {
		t.Fatal(err)
	}
	rows, _ := ListExternalHolidays(2026)
	if err := RememberDeletedExternalHoliday(rows[0], 9); err != nil {
		t.Fatal(err)
	}
	if err := RememberDeletedExternalHoliday(rows[0], 9); err != nil { // twice is fine
		t.Fatal(err)
	}
	if !DeleteCalendarDate(rows[0].ID) {
		t.Fatal("delete failed")
	}
	res, err := UpsertExternalHolidays(2026, src, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if res.SkippedDeleted != 1 || len(res.Created) != 0 {
		t.Fatalf("result = %+v", res)
	}
	if rows, _ = ListExternalHolidays(2026); len(rows) != 0 {
		t.Error("deleted holiday came back")
	}

	// Deleting a staff-made row records nothing.
	manual, _ := CreateCalendarDate(models.CalendarDate{Date: time.Now(), Name: "x", DateType: models.DateTypeNoClass, Scope: models.DateScopeGlobal, CreatedByID: 1})
	if err := RememberDeletedExternalHoliday(manual, 1); err != nil {
		t.Fatal(err)
	}
	var n int64
	DB.Model(&models.CalendarDateExclusion{}).Count(&n)
	if n != 1 {
		t.Errorf("%d exclusions, want 1", n)
	}
}

func TestUpsertExternalHolidaysKeepsRowsMissingFromSource(t *testing.T) {
	openHolidayTestDB(t)
	if _, err := UpsertExternalHolidays(2026, []ExternalHoliday{
		holiday("2026-10-23", "วันปิยมหาราช", "public_holiday"),
		holiday("2026-12-10", "วันรัฐธรรมนูญ", "public_holiday"),
	}, time.Now()); err != nil {
		t.Fatal(err)
	}
	res, err := UpsertExternalHolidays(2026, []ExternalHoliday{holiday("2026-10-23", "วันปิยมหาราช", "public_holiday")}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if res.Missing != 1 || res.Unchanged != 1 {
		t.Fatalf("result = %+v", res)
	}
	if rows, _ := ListExternalHolidays(2026); len(rows) != 2 {
		t.Errorf("%d rows kept, want 2", len(rows))
	}
}

func TestUpsertExternalHolidaysRollsBackOnError(t *testing.T) {
	openHolidayTestDB(t)
	if _, err := UpsertExternalHolidays(2026, []ExternalHoliday{holiday("2026-10-23", "วันปิยมหาราช", "public_holiday")}, time.Now()); err != nil {
		t.Fatal(err)
	}
	// The second holiday's name is too long for the column, so the whole save fails.
	long := make([]rune, 400)
	for i := range long {
		long[i] = 'ก'
	}
	_, err := UpsertExternalHolidays(2026, []ExternalHoliday{
		holiday("2026-10-23", "ชื่อที่ควรถูกย้อนกลับ", "public_holiday"),
		holiday("2026-12-10", string(long), "public_holiday"),
	}, time.Now())
	if err == nil {
		t.Fatal("expected an error")
	}
	rows, _ := ListExternalHolidays(2026)
	if len(rows) != 1 || rows[0].Name != "วันปิยมหาราช" {
		t.Errorf("stored data changed after a failed save: %+v", rows)
	}
}

func TestListCalendarDatesBySemesterLimitsImportedRowsToTheYear(t *testing.T) {
	openHolidayTestDB(t)
	if _, err := UpsertExternalHolidays(2026, []ExternalHoliday{
		holiday("2026-01-01", "ต้นปี", "public_holiday"),        // academic year 2568
		holiday("2026-10-23", "วันปิยมหาราช", "public_holiday"), // academic year 2569
	}, time.Now()); err != nil {
		t.Fatal(err)
	}
	yes := true
	d, _ := time.Parse("2006-01-02", "2020-05-05")
	if _, err := CreateCalendarDate(models.CalendarDate{Date: d, Name: "global เก่า", DateType: models.DateTypeNoClass,
		Scope: models.DateScopeGlobal, AffectsWork: &yes, CreatedByID: 1}); err != nil {
		t.Fatal(err)
	}
	got, err := ListCalendarDatesBySemester("1", 2569)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, c := range got {
		names[c.Name] = true
	}
	if !names["วันปิยมหาราช"] || names["ต้นปี"] || !names["global เก่า"] {
		t.Errorf("rows = %v; want the 2569 holiday and the staff global row, not the 2568 one", names)
	}
}

func TestHolidaySyncRunsAndLock(t *testing.T) {
	openHolidayTestDB(t)
	t0 := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	for _, r := range []models.HolidaySyncRun{
		{Year: 2026, Status: models.HolidaySyncFailed, Trigger: "scheduled", StartedAt: t0, FinishedAt: t0},
		{Year: 2026, Status: models.HolidaySyncSuccess, Trigger: "manual", StartedAt: t0.Add(time.Hour), FinishedAt: t0.Add(time.Hour)},
		{Year: 2027, Status: models.HolidaySyncNoData, Trigger: "scheduled", StartedAt: t0, FinishedAt: t0},
	} {
		if err := RecordHolidaySyncRun(r); err != nil {
			t.Fatal(err)
		}
	}
	runs, err := LatestHolidaySyncRuns()
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 2 || runs[0].Year != 2027 || runs[1].Year != 2026 || runs[1].Status != models.HolidaySyncSuccess {
		t.Errorf("latest runs = %+v", runs)
	}
	if last, _ := LastSuccessfulHolidaySync(); !last.Equal(t0.Add(time.Hour)) {
		t.Errorf("last success = %v", last)
	}

	// While one sync holds the lock, a second one does not run.
	innerRan := true
	ran, err := WithHolidaySyncLock(func() error {
		// Another connection from the pool is a different MySQL session.
		var innerErr error
		innerRan, innerErr = WithHolidaySyncLock(func() error { return nil })
		return innerErr
	})
	if err != nil || !ran || innerRan {
		t.Errorf("outer ran=%v inner ran=%v err=%v; want true, false, nil", ran, innerRan, err)
	}
	if ran, _ = WithHolidaySyncLock(func() error { return nil }); !ran {
		t.Error("lock was not released")
	}
}
