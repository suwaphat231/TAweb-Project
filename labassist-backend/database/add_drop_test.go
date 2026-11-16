package database

import (
	"errors"
	"os"
	"testing"
	"time"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestTermScheduleLockedAfterAddDrop(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.TermSchedule{}, &models.AcademicEvent{}); err != nil {
		t.Fatal(err)
	}

	day := func(offset int) time.Time {
		n := time.Now().In(bangkokLoc)
		return time.Date(n.Year(), n.Month(), n.Day()+offset, 0, 0, 0, 0, time.UTC)
	}
	const year = 2999
	userID := uint(time.Now().UnixNano()%1_000_000) + 700_000
	slots := []models.ScheduleSlot{{Day: "MON", StartTime: "09:00", EndTime: "12:00"}}
	t.Cleanup(func() {
		DB.Where("academic_year = ?", year).Delete(&models.AcademicEvent{})
		DB.Where("user_id = ?", userID).Delete(&models.TermSchedule{})
	})

	// No add/drop event in the calendar: never locked.
	if _, err := UpsertTermSchedule(userID, "1", year, slots, models.TermScheduleSet); err != nil {
		t.Fatalf("no event: %v", err)
	}

	ev := func(sem, name string, end time.Time) models.AcademicEvent {
		return models.AcademicEvent{AcademicYear: year, Semester: sem, Name: name,
			Category: models.EventRegistration, StartDate: end.AddDate(0, 0, -14), EndDate: end, CreatedByID: 1}
	}
	if err := DB.Create(&[]models.AcademicEvent{
		ev("1", "วันเพิ่ม–ถอนรายวิชาเรียน", day(-1)), // closed yesterday
		ev("2", "วันเพิ่ม–ถอนรายวิชาเรียน", day(0)),  // last day is today: still open
		ev("1", "วันถอนวิชาเรียนที่กองบริหารงานวิชาการ", day(30)),
	}).Error; err != nil {
		t.Fatal(err)
	}

	// Em dash, filed under the deadline category: still detected.
	if err := DB.Create(&models.AcademicEvent{AcademicYear: year, Semester: "3", Name: "วันสุดท้ายของการเพิ่ม—ถอน",
		Category: models.EventDeadline, StartDate: day(-15), EndDate: day(-1), CreatedByID: 1}).Error; err != nil {
		t.Fatal(err)
	}
	other3 := []models.ScheduleSlot{{Day: "WED", StartTime: "09:00", EndTime: "12:00"}}
	if _, err := UpsertTermSchedule(userID+2, "3", year, slots, models.TermScheduleSet); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { DB.Where("user_id = ?", userID+2).Delete(&models.TermSchedule{}) })
	if _, err := UpsertTermSchedule(userID+2, "3", year, other3, models.TermScheduleSet); !errors.Is(err, ErrAddDropClosed) {
		t.Fatalf("em dash / deadline category: got %v, want ErrAddDropClosed", err)
	}

	other := []models.ScheduleSlot{{Day: "TUE", StartTime: "09:00", EndTime: "12:00"}}
	if _, err := UpsertTermSchedule(userID, "1", year, other, models.TermScheduleSet); !errors.Is(err, ErrAddDropClosed) {
		t.Fatalf("closed term: got %v, want ErrAddDropClosed", err)
	}
	if ts := TermScheduleByUserTerm(userID, "1", year); !ts.AddDropClosed || ts.AddDropEnd == "" {
		t.Fatalf("status not reported closed: %+v", ts)
	}
	if _, err := UpsertTermSchedule(userID, "2", year, slots, models.TermScheduleSet); err != nil {
		t.Fatalf("last day must still be editable: %v", err)
	}

	// A student who never saved a schedule for a closed term must still be able
	// to save once (first save), but not change it afterwards.
	if _, err := UpsertTermSchedule(userID+1, "1", year, slots, models.TermScheduleSet); err != nil {
		t.Fatalf("first save in closed term must be allowed: %v", err)
	}
	t.Cleanup(func() { DB.Where("user_id = ?", userID+1).Delete(&models.TermSchedule{}) })
	if _, err := UpsertTermSchedule(userID+1, "1", year, other, models.TermScheduleSet); !errors.Is(err, ErrAddDropClosed) {
		t.Fatalf("edit after first save in closed term: got %v, want ErrAddDropClosed", err)
	}
}
