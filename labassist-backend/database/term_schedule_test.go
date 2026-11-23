package database

import (
	"os"
	"testing"
	"time"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestUpsertTermScheduleAllowsRepeatedEditsBeforeAddDrop(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.TermSchedule{}); err != nil {
		t.Fatal(err)
	}

	userID := uint(time.Now().UnixNano()%1_000_000) + 800_000
	save := func(day string, status models.TermScheduleStatus) (models.TermSchedule, error) {
		slots := []models.ScheduleSlot{}
		if day != "" {
			slots = append(slots, models.ScheduleSlot{Day: day, StartTime: "09:00", EndTime: "12:00"})
		}
		return UpsertTermSchedule(userID, "1", 2569, slots, status)
	}

	for i, day := range []string{"MON", "TUE", "WED", "THU", "FRI"} {
		ts, err := save(day, models.TermScheduleSet)
		if err != nil {
			t.Fatalf("save %d: %v", i+1, err)
		}
		if len(ts.Slots) != 1 || ts.Slots[0].Day != day {
			t.Fatalf("save %d: slots=%+v", i+1, ts.Slots)
		}
	}

	// Re-saving identical data is a no-op.
	if ts, err := save("FRI", models.TermScheduleSet); err != nil || len(ts.Slots) != 1 || ts.Slots[0].Day != "FRI" {
		t.Fatalf("identical save: slots=%+v err=%v", ts.Slots, err)
	}
	if got := TermScheduleByUserTerm(userID, "1", 2569); got.Status != models.TermScheduleSet || got.Slots[0].Day != "FRI" {
		t.Fatalf("saved schedule: %+v", got)
	}
}
