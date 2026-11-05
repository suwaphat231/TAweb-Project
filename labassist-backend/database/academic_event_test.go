package database

import (
	"os"
	"testing"
	"time"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestReplaceAcademicEvents(t *testing.T) {
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
	if err := DB.Migrator().DropTable(&models.AcademicEvent{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.AutoMigrate(&models.AcademicEvent{}); err != nil {
		t.Fatal(err)
	}

	d := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	ev := func(year int, name, start, end string) models.AcademicEvent {
		return models.AcademicEvent{AcademicYear: year, Semester: "1", StartDate: d(start), EndDate: d(end), Name: name, Category: "exam", CreatedByID: 1}
	}
	if err := ReplaceAcademicEvents(2569, []models.AcademicEvent{ev(2569, "สอบกลางภาค", "2026-08-22", "2026-09-05"), ev(2569, "ลงทะเบียน", "2026-06-15", "2026-06-19")}); err != nil {
		t.Fatal(err)
	}
	if err := ReplaceAcademicEvents(2570, []models.AcademicEvent{ev(2570, "ปีถัดไป", "2027-08-22", "2027-08-22")}); err != nil {
		t.Fatal(err)
	}
	// Importing 2569 again replaces its events (no duplicates) and leaves 2570 alone.
	if err := ReplaceAcademicEvents(2569, []models.AcademicEvent{ev(2569, "สอบปลายภาค", "2026-10-12", "2026-10-23")}); err != nil {
		t.Fatal(err)
	}
	rows, err := ListAcademicEventsForYears([]int{2569, 2570})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Name != "สอบปลายภาค" || rows[1].Name != "ปีถัดไป" {
		t.Fatalf("rows = %+v", rows)
	}
	if n, _ := CountAcademicEvents(2569); n != 1 {
		t.Errorf("count 2569 = %d, want 1", n)
	}
}
