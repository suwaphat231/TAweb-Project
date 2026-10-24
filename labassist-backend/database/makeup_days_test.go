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

func TestCheckMakeupTime(t *testing.T) {
	for _, tc := range []struct {
		start, end string
		want       error
	}{
		{"13:00", "16:00", nil},
		{"09:00", "11:30", nil},
		{"13:00", "16:30", ErrMakeupTooLong},
		{"16:00", "13:00", ErrMakeupTime},
		{"13:00", "13:00", ErrMakeupTime},
		{"1300", "16:00", ErrMakeupTime},
	} {
		if got := checkMakeupTime("13:00", "16:00", tc.start, tc.end); !errors.Is(got, tc.want) {
			t.Errorf("checkMakeupTime(%s, %s) = %v, want %v", tc.start, tc.end, got, tc.want)
		}
	}
}

func TestMakeupWindow(t *testing.T) {
	if _, _, ok := makeupWindow(nil); ok {
		t.Error("no planned months must give no window")
	}
	from, to, ok := makeupWindow([]models.ScheduleGroupMonth{{Year: 2026, Month: 9}, {Year: 2026, Month: 12}, {Year: 2026, Month: 8}})
	if !ok || from.Format("2006-01-02") != "2026-08-01" || to.Format("2006-01-02") != "2027-12-31" {
		t.Errorf("window = %s – %s, want 2026-08-01 – 2027-12-31 (12 months past the plan)", from, to)
	}
}

func TestThaiShortDate(t *testing.T) {
	if got := ThaiShortDate(time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)); got != "12 ส.ค. 2569" {
		t.Errorf("got %q", got)
	}
}

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestMakeupDayLifecycle(t *testing.T) {
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

	day := func(s string) time.Time {
		d, _ := time.Parse("2006-01-02", s)
		return d
	}
	course := models.Course{Code: "MK" + time.Now().Format("150405"), Title: "Makeup", Section: 1, Semester: "1", AcademicYear: 2569}
	if err := DB.Omit(clause.Associations).Create(&course).Error; err != nil {
		t.Fatal(err)
	}
	sc := models.StaffCase{PostingID: course.ID + 900000, CourseID: course.ID, Semester: "1", AcademicYear: 2569, CreatedByID: 1}
	if err := DB.Create(&sc).Error; err != nil {
		t.Fatal(err)
	}
	slots := []models.GroupWeekDaySlot{{Day: "MON", StartTime: "13:00", EndTime: "16:00"}}
	sg := models.ScheduleGroup{StaffCaseID: sc.ID, WeekDay: "MON", StartTime: "13:00", EndTime: "16:00"}
	if err := DB.Create(&sg).Error; err != nil {
		t.Fatal(err)
	}
	aug := models.ScheduleGroupMonth{ScheduleGroupID: sg.ID, Year: 2026, Month: 8}
	if err := DB.Create(&aug).Error; err != nil {
		t.Fatal(err)
	}
	affects := true
	holiday := models.CalendarDate{Date: day("2026-08-10"), Name: "วันหยุดทดสอบ", DateType: models.DateTypeUniversityHoliday,
		Scope: models.DateScopeCase, StaffCaseID: &sc.ID, AffectsWork: &affects, CreatedByID: 1}
	if err := DB.Create(&holiday).Error; err != nil {
		t.Fatal(err)
	}
	cancelled := map[string]uint{"2026-08-10": holiday.ID}
	regenerate := func() {
		t.Helper()
		if _, err := RegenerateGroupMonthOccurrences(sc.ID, sg.ID, slots, aug, cancelled); err != nil {
			t.Fatalf("regenerate: %v", err)
		}
	}
	clashOf := func() models.WorkOccurrence {
		t.Helper()
		var o models.WorkOccurrence
		if err := DB.Where("schedule_group_id = ? AND scheduled_date = ?", sg.ID, "2026-08-10").First(&o).Error; err != nil {
			t.Fatal(err)
		}
		return o
	}
	pending := func() int {
		t.Helper()
		n, err := PendingMakeupCount(sc.ID)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}

	regenerate()
	// A case-level clash without a group can never get a makeup day, so it
	// must not count as pending (it would block every document forever).
	orphan := models.WorkOccurrence{StaffCaseID: sc.ID, ScheduledDate: day("2026-08-12"), StartTime: "13:00", EndTime: "16:00",
		Status: models.OccurrenceCancelledHoliday, CalendarDateID: &holiday.ID}
	if err := DB.Create(&orphan).Error; err != nil {
		t.Fatal(err)
	}
	clash := clashOf()
	if clash.Status != models.OccurrenceCancelledHoliday || pending() != 1 {
		t.Fatalf("clash = %+v, pending = %d; want one pending holiday clash", clash, pending())
	}

	for date, want := range map[string]error{
		"2026-08-10": ErrMakeupHoliday,
		"2026-08-17": ErrMakeupDateTaken,
		"2026-07-20": ErrMakeupOutOfRange, // before the plan starts
		"2027-10-05": ErrMakeupOutOfRange, // past the 12-month cap
	} {
		if _, _, err := ChooseMakeupDay(clash.ID, day(date), "13:00", "16:00", 1); !errors.Is(err, want) {
			t.Errorf("makeup on %s: err = %v, want %v", date, err, want)
		}
	}
	if _, _, err := ChooseMakeupDay(clash.ID, day("2026-08-11"), "13:00", "17:00", 1); !errors.Is(err, ErrMakeupTooLong) {
		t.Errorf("longer makeup: err = %v", err)
	}

	// A makeup day in the month after the plan adds that month.
	_, makeup, err := ChooseMakeupDay(clash.ID, day("2026-09-08"), "13:00", "15:00", 1)
	if err != nil {
		t.Fatal(err)
	}
	if makeup.RescheduledFromOccurrenceID == nil || *makeup.RescheduledFromOccurrenceID != clash.ID || pending() != 0 {
		t.Fatalf("makeup = %+v, pending = %d", makeup, pending())
	}
	var sep int64
	DB.Model(&models.ScheduleGroupMonth{}).Where("schedule_group_id = ? AND year = 2026 AND month = 9", sg.ID).Count(&sep)
	if sep != 1 {
		t.Error("September was not added to the plan")
	}

	// Regenerating the month keeps the decided clash and its makeup day.
	regenerate()
	if got := clashOf(); got.ID != clash.ID {
		t.Errorf("regenerate replaced the decided clash (%d → %d)", clash.ID, got.ID)
	}
	days, err := MakeupDaysForCases([]uint{sc.ID})
	if err != nil || len(days) != 1 || days[0].Status != MakeupChosen || days[0].Makeup.ID != makeup.ID ||
		days[0].HolidayName != "วันหยุดทดสอบ" || days[0].MaxDate != "2027-09-30" {
		t.Fatalf("days = %+v, err = %v", days, err)
	}

	// Choosing again replaces the makeup day; declining removes it.
	if _, _, err := ChooseMakeupDay(clash.ID, day("2026-08-12"), "13:00", "16:00", 1); err != nil {
		t.Fatal(err)
	}
	var gone int64
	DB.Model(&models.WorkOccurrence{}).Where("id = ?", makeup.ID).Count(&gone)
	if gone != 0 {
		t.Error("the earlier makeup day was kept")
	}
	if _, err := DeclineMakeupDay(clash.ID, 1); err != nil {
		t.Fatal(err)
	}
	if days, _ := MakeupDaysForCases([]uint{sc.ID}); len(days) != 1 || days[0].Status != MakeupNone || pending() != 0 {
		t.Fatalf("after decline: %+v", days)
	}
	var children int64
	DB.Model(&models.WorkOccurrence{}).Where("rescheduled_from_occurrence_id = ?", clash.ID).Count(&children)
	if children != 0 {
		t.Error("declining kept the makeup day")
	}

	// Deleting the holiday gives the day back and drops its makeup day.
	if _, _, err := ChooseMakeupDay(clash.ID, day("2026-08-12"), "13:00", "16:00", 1); err != nil {
		t.Fatal(err)
	}
	if err := RestoreOccurrencesForHoliday(holiday.ID); err != nil {
		t.Fatal(err)
	}
	if got := clashOf(); got.Status != models.OccurrenceScheduled || got.NoMakeup {
		t.Errorf("restored day = %+v", got)
	}
	DB.Model(&models.WorkOccurrence{}).Where("rescheduled_from_occurrence_id = ?", clash.ID).Count(&children)
	if children != 0 {
		t.Error("the makeup day survived deleting the holiday")
	}
}
