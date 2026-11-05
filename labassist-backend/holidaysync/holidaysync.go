// Package holidaysync keeps the Thai public holidays in calendar_dates up to
// date from a JSON data source. A scheduled job runs it in the background and
// staff can start it by hand.
//
// The source is one JSON file per calendar year. Each file is validated as a
// whole before anything is saved, and the sync only adds or updates rows it
// imported itself (calendar_dates.source = "external"): rows staff created are
// never changed or deleted, and a failed fetch leaves the stored data as is.
package holidaysync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"labassist/database"
	"labassist/models"
)

const (
	// DefaultURLTemplate has one %d for the calendar year (ค.ศ.).
	DefaultURLTemplate = "https://raw.githubusercontent.com/ppraserts/thailand-open-data/main/data/thai-public-holidays/%d.json"

	TriggerScheduled = "scheduled"
	TriggerManual    = "manual"

	maxBodyBytes = 1 << 20
	maxNameRunes = 200
	maxTypeRunes = 30
)

// ErrNoData means the source has no holidays for the year yet (no file, or
// an empty one). It is not a failure: stored data stays as it is.
var ErrNoData = errors.New("source has no holidays for this year")

// Config controls the sync. Zero values fall back to the defaults.
type Config struct {
	Enabled     bool
	URLTemplate string        // must contain %d
	Interval    time.Duration // between scheduled runs
	YearsBack   int           // calendar years before the current one to sync
	YearsAhead  int           // calendar years after the current one to sync
	Timeout     time.Duration // per request
}

// Service fetches and saves holidays.
type Service struct {
	cfg    Config
	client *http.Client
	now    func() time.Time
}

var bangkok = time.FixedZone("ICT", 7*3600)

// New checks the config and fills in defaults.
func New(cfg Config) (*Service, error) {
	if cfg.URLTemplate == "" {
		cfg.URLTemplate = DefaultURLTemplate
	}
	if strings.Count(cfg.URLTemplate, "%d") != 1 {
		return nil, errors.New("holiday source URL must contain exactly one %d for the year")
	}
	if cfg.Interval <= 0 {
		cfg.Interval = 24 * time.Hour
	}
	if cfg.Interval < time.Minute {
		cfg.Interval = time.Minute
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 15 * time.Second
	}
	if cfg.YearsBack < 0 {
		cfg.YearsBack = 0
	}
	if cfg.YearsAhead < 0 {
		cfg.YearsAhead = 0
	}
	return &Service{cfg: cfg, client: &http.Client{Timeout: cfg.Timeout}, now: time.Now}, nil
}

// Config returns the settings in use.
func (s *Service) Config() Config { return s.cfg }

var shared *Service

// SetShared registers the service the HTTP handlers use.
func SetShared(s *Service) { shared = s }

// Shared returns the registered service, or nil if the sync is not set up.
func Shared() *Service { return shared }

// Years are the calendar years (ค.ศ.) to sync now: the current year plus the
// configured range either side (an academic year spans two calendar years).
func (s *Service) Years() []int {
	y := s.now().In(bangkok).Year()
	var years []int
	for i := y - s.cfg.YearsBack; i <= y+s.cfg.YearsAhead; i++ {
		years = append(years, i)
	}
	return years
}

type sourceFile struct {
	Year     int `json:"year"`
	Holidays []struct {
		Date   string `json:"date"`
		NameTH string `json:"name_th"`
		Type   string `json:"type"`
	} `json:"holidays"`
}

// Parse validates one year's file and returns its holidays. Any bad entry
// rejects the whole file, so a half-broken file never reaches the database.
// A file with no holidays returns ErrNoData.
func Parse(body []byte, year int) ([]database.ExternalHoliday, error) {
	var f sourceFile
	if err := json.Unmarshal(body, &f); err != nil {
		return nil, fmt.Errorf("ข้อมูลไม่ใช่ JSON ที่ถูกต้อง: %w", err)
	}
	if f.Year != 0 && f.Year != year {
		return nil, fmt.Errorf("ไฟล์เป็นข้อมูลปี %d ไม่ตรงกับปีที่ขอ (%d)", f.Year, year)
	}
	if len(f.Holidays) == 0 {
		return nil, ErrNoData
	}
	seen := make(map[string]bool, len(f.Holidays))
	out := make([]database.ExternalHoliday, 0, len(f.Holidays))
	for i, h := range f.Holidays {
		d, err := time.Parse("2006-01-02", h.Date)
		if err != nil {
			return nil, fmt.Errorf("รายการที่ %d: วันที่ไม่ถูกต้อง (%q)", i+1, h.Date)
		}
		if d.Year() != year {
			return nil, fmt.Errorf("รายการที่ %d: วันที่ %s ไม่อยู่ในปี %d", i+1, h.Date, year)
		}
		name := strings.Join(strings.Fields(h.NameTH), " ")
		if name == "" || utf8.RuneCountInString(name) > maxNameRunes {
			return nil, fmt.Errorf("รายการที่ %d: ชื่อวันหยุดว่างหรือยาวเกิน %d ตัวอักษร", i+1, maxNameRunes)
		}
		typ := strings.TrimSpace(h.Type)
		if typ == "" || utf8.RuneCountInString(typ) > maxTypeRunes {
			return nil, fmt.Errorf("รายการที่ %d: ประเภทวันหยุดไม่ถูกต้อง", i+1)
		}
		if seen[h.Date] {
			return nil, fmt.Errorf("รายการที่ %d: วันที่ %s ซ้ำในไฟล์", i+1, h.Date)
		}
		seen[h.Date] = true
		out = append(out, database.ExternalHoliday{Date: d, Name: name, Type: typ})
	}
	return out, nil
}

// fetch downloads and validates one year.
func (s *Service) fetch(ctx context.Context, year int) ([]database.ExternalHoliday, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf(s.cfg.URLTemplate, year), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "LabAssist-HolidaySync")
	req.Header.Set("Accept", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ: %w", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return nil, ErrNoData
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("แหล่งข้อมูลตอบกลับ HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("อ่านข้อมูลจากแหล่งข้อมูลไม่สำเร็จ: %w", err)
	}
	if len(body) > maxBodyBytes {
		return nil, errors.New("ไฟล์จากแหล่งข้อมูลใหญ่ผิดปกติ")
	}
	return Parse(body, year)
}

// SyncYear fetches one year and saves it, always recording the outcome. It
// never returns an error: a failure is in the returned run's Status/Message.
func (s *Service) SyncYear(ctx context.Context, year int, trigger string, userID *uint) models.HolidaySyncRun {
	run := models.HolidaySyncRun{Year: year, Trigger: trigger, TriggeredByID: userID, StartedAt: s.now()}
	finish := func() models.HolidaySyncRun {
		run.FinishedAt = s.now()
		if len(run.Message) > 500 {
			run.Message = string([]rune(run.Message)[:500])
		}
		if err := database.RecordHolidaySyncRun(run); err != nil {
			log.Printf("holiday sync %d: record run: %v", year, err)
		}
		return run
	}

	holidays, err := s.fetch(ctx, year)
	switch {
	case errors.Is(err, ErrNoData):
		run.Status = models.HolidaySyncNoData
		run.Message = fmt.Sprintf("แหล่งข้อมูลยังไม่มีวันหยุดของปี %d (ข้อมูลเดิมไม่เปลี่ยนแปลง)", year)
		return finish()
	case err != nil:
		run.Status = models.HolidaySyncFailed
		run.Message = err.Error()
		log.Printf("holiday sync %d failed: %v", year, err)
		return finish()
	}

	res, err := database.UpsertExternalHolidays(year, holidays, s.now())
	if err != nil {
		run.Status = models.HolidaySyncFailed
		run.Message = "บันทึกวันหยุดลงฐานข้อมูลไม่สำเร็จ (ข้อมูลเดิมไม่เปลี่ยนแปลง)"
		log.Printf("holiday sync %d: save: %v", year, err)
		return finish()
	}
	run.Status = models.HolidaySyncSuccess
	run.Total = len(holidays)
	run.Created, run.Updated, run.Unchanged = len(res.Created), res.Updated, res.Unchanged
	run.SkippedManual, run.SkippedDeleted, run.Missing = res.SkippedManual, res.SkippedDeleted, res.Missing
	if res.Missing > 0 {
		run.Message = fmt.Sprintf("มี %d รายการที่เคยนำเข้าแต่ไม่อยู่ในแหล่งข้อมูลแล้ว (เก็บไว้ ไม่ลบ)", res.Missing)
	}
	if err := s.followUp(res.Created); err != nil {
		run.Message = strings.TrimSpace(run.Message + " " + err.Error())
	}
	return finish()
}

// followUp does for new holidays what adding one by hand does: cancel the work
// days that fall on it and ask the affected instructors for makeup days. Only
// holidays from today on are handled; a past holiday is stored for reference
// but must not cancel work that may already have been done.
func (s *Service) followUp(created []models.CalendarDate) error {
	today := s.now().In(bangkok)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	var notifs []models.Notification
	failed := false
	for _, cd := range created {
		if cd.Date.Before(today) {
			continue
		}
		if err := database.CancelOccurrencesForHoliday(cd); err != nil {
			log.Printf("holiday sync: cancel occurrences for %d: %v", cd.ID, err)
			failed = true
			continue
		}
		n, err := database.HolidayClashNotifications(cd)
		if err != nil {
			log.Printf("holiday sync: clash notifications for %d: %v", cd.ID, err)
			continue
		}
		notifs = append(notifs, n...)
	}
	database.CreateNotifications(notifs)
	if failed {
		return errors.New("บันทึกวันหยุดแล้ว แต่ยกเลิกวันทำงานที่ตรงกับวันหยุดบางวันไม่สำเร็จ กรุณาตรวจสอบแผนงาน")
	}
	return nil
}

// SyncAll syncs every configured year. ran is false when another sync is
// already running (nothing is done then).
func (s *Service) SyncAll(ctx context.Context, trigger string, userID *uint) (runs []models.HolidaySyncRun, ran bool, err error) {
	ran, err = database.WithHolidaySyncLock(func() error {
		for _, y := range s.Years() {
			runs = append(runs, s.SyncYear(ctx, y, trigger, userID))
		}
		return nil
	})
	return runs, ran, err
}

// Start runs the scheduled job until ctx ends: once shortly after start-up,
// then every Interval. It does nothing when the sync is disabled.
func (s *Service) Start(ctx context.Context) {
	if !s.cfg.Enabled {
		log.Println("holiday sync: disabled (HOLIDAY_SYNC_ENABLED=false)")
		return
	}
	log.Printf("holiday sync: every %s from %s", s.cfg.Interval, s.cfg.URLTemplate)
	timer := time.NewTimer(30 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		s.runScheduled(ctx)
		timer.Reset(s.cfg.Interval)
	}
}

func (s *Service) runScheduled(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("holiday sync: panic: %v", r)
		}
	}()
	if _, ran, err := s.SyncAll(ctx, TriggerScheduled, nil); err != nil {
		log.Printf("holiday sync: %v", err)
	} else if !ran {
		log.Println("holiday sync: another sync is running, skipped")
	}
}
