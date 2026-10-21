package database

import (
	"errors"
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"labassist/models"
)

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestSessionCapPerTerm(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.Course{}, &models.Posting{}, &models.StaffCase{}, &models.ScheduleGroup{},
		&models.ScheduleGroupMonth{}, &models.WorkOccurrence{}, &models.CalendarDate{}); err != nil {
		t.Fatal(err)
	}

	course := models.Course{Code: "CAP" + time.Now().Format("150405"), Title: "Cap", Section: 1, Semester: "1", AcademicYear: 2569}
	if err := DB.Omit(clause.Associations).Create(&course).Error; err != nil {
		t.Fatal(err)
	}
	sc := models.StaffCase{PostingID: course.ID + 800000, CourseID: course.ID, Semester: "1", AcademicYear: 2569, CreatedByID: 1}
	if err := DB.Create(&sc).Error; err != nil {
		t.Fatal(err)
	}
	slots := []models.GroupWeekDaySlot{{Day: "MON", StartTime: "13:00", EndTime: "16:00"}}
	sg := models.ScheduleGroup{StaffCaseID: sc.ID, WeekDay: "MON", StartTime: "13:00", EndTime: "16:00"}
	if err := DB.Create(&sg).Error; err != nil {
		t.Fatal(err)
	}

	// Sep–Dec 2026 hold 17 Mondays; generation must stop at 15 (Dec 14).
	for _, m := range []int{9, 10, 11, 12} {
		month := models.ScheduleGroupMonth{ScheduleGroupID: sg.ID, Year: 2026, Month: m}
		if err := DB.Create(&month).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := RegenerateGroupMonthOccurrences(sc.ID, sg.ID, slots, month, nil); err != nil {
			t.Fatalf("regenerate %d: %v", m, err)
		}
	}
	occs, err := WorkOccurrencesForGroup(sg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(occs) != models.MaxLabSessionsPerTerm {
		t.Fatalf("generated %d sessions, want %d", len(occs), models.MaxLabSessionsPerTerm)
	}
	if last := occs[len(occs)-1].ScheduledDate.Format("2006-01-02"); last != "2026-12-14" {
		t.Errorf("last session = %s, want 2026-12-14", last)
	}

	// A 16th session is refused and nothing is written.
	extra := time.Date(2026, 12, 21, 0, 0, 0, 0, time.UTC)
	if _, err := AddSingleGroupOccurrence(sc.ID, sg.ID, extra, "13:00", "16:00", nil); !errors.Is(err, ErrSessionCap) {
		t.Fatalf("16th session: err = %v, want ErrSessionCap", err)
	}
	if n, _ := countedSessions(DB, sc.ID, &sg.ID); n != models.MaxLabSessionsPerTerm {
		t.Errorf("after refused add: %d sessions, want %d", n, models.MaxLabSessionsPerTerm)
	}

	// Cancelling one frees a slot; reviving it while another fills the slot is refused.
	if _, err := UpdateOccurrenceStatus(occs[0].ID, models.OccurrenceCancelledOther, "", 1); err != nil {
		t.Fatal(err)
	}
	if _, err := AddSingleGroupOccurrence(sc.ID, sg.ID, extra, "13:00", "16:00", nil); err != nil {
		t.Fatalf("add after cancel: %v", err)
	}
	if _, err := UpdateOccurrenceStatus(occs[0].ID, models.OccurrenceScheduled, "", 1); !errors.Is(err, ErrSessionCap) {
		t.Errorf("revive past cap: err = %v, want ErrSessionCap", err)
	}
}
