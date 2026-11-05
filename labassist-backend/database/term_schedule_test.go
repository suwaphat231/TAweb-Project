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
func TestUpsertTermScheduleSaveLimit(t *testing.T) {
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

	for i, day := range []string{"MON", "TUE", "WED"} {
		ts, err := save(day, models.TermScheduleSet)
		if err != nil {
			t.Fatalf("save %d: %v", i+1, err)
		}
		if ts.SaveCount != i+1 || ts.SaveLimit != models.MaxTermScheduleSaves {
			t.Fatalf("save %d: count=%d limit=%d", i+1, ts.SaveCount, ts.SaveLimit)
		}
	}

	// Re-saving identical data is a no-op, even after the limit is reached.
	if ts, err := save("WED", models.TermScheduleSet); err != nil || ts.SaveCount != 3 {
		t.Fatalf("identical save: count=%d err=%v", ts.SaveCount, err)
	}

	if _, err := save("", models.TermScheduleNoClass); !errors.Is(err, ErrTermScheduleSaveLimit) {
		t.Fatalf("4th save: want ErrTermScheduleSaveLimit, got %v", err)
	}
	if got := TermScheduleByUserTerm(userID, "1", 2569); got.Status != models.TermScheduleSet || got.Slots[0].Day != "WED" {
		t.Fatalf("rejected save changed the row: %+v", got)
	}

	// The limit is per term: another term starts fresh.
	if ts, err := UpsertTermSchedule(userID, "2", 2569, nil, models.TermScheduleNoClass); err != nil || ts.SaveCount != 1 {
		t.Fatalf("other term: count=%d err=%v", ts.SaveCount, err)
	}
}

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestResetTermScheduleSaves(t *testing.T) {
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

	userID := uint(time.Now().UnixNano()%1_000_000) + 900_000
	slot := func(day string) []models.ScheduleSlot {
		return []models.ScheduleSlot{{Day: day, StartTime: "09:00", EndTime: "12:00"}}
	}
	for _, day := range []string{"MON", "TUE", "WED"} {
		if _, err := UpsertTermSchedule(userID, "1", 2569, slot(day), models.TermScheduleSet); err != nil {
			t.Fatal(err)
		}
	}
	// A different term must keep its own count.
	if _, err := UpsertTermSchedule(userID, "2", 2569, slot("FRI"), models.TermScheduleSet); err != nil {
		t.Fatal(err)
	}
	if _, err := UpsertTermSchedule(userID, "1", 2569, slot("THU"), models.TermScheduleSet); !errors.Is(err, ErrTermScheduleSaveLimit) {
		t.Fatalf("want limit reached before reset, got %v", err)
	}

	found, err := ResetTermScheduleSaves(userID, "1", 2569)
	if err != nil || !found {
		t.Fatalf("reset: found=%v err=%v", found, err)
	}
	got := TermScheduleByUserTerm(userID, "1", 2569)
	if got.SaveCount != 0 || got.Slots[0].Day != "WED" {
		t.Fatalf("reset must zero the count and keep the schedule: %+v", got)
	}
	if other := TermScheduleByUserTerm(userID, "2", 2569); other.SaveCount != 1 {
		t.Fatalf("other term changed: %+v", other)
	}
	if _, err := UpsertTermSchedule(userID, "1", 2569, slot("THU"), models.TermScheduleSet); err != nil {
		t.Fatalf("save after reset: %v", err)
	}
	if found, _ := ResetTermScheduleSaves(userID, "3", 2569); found {
		t.Fatal("reset of a term with no schedule must report not found")
	}
	if rows := TermSchedulesByUser(userID); len(rows) != 2 || rows[0].SaveLimit != models.MaxTermScheduleSaves {
		t.Fatalf("list: %+v", rows)
	}
}
