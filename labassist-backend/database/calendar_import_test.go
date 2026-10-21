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
func TestImportCalendarDatesSkipsDuplicates(t *testing.T) {
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
	if err := DB.Migrator().DropTable(&models.CalendarDate{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.AutoMigrate(&models.CalendarDate{}); err != nil {
		t.Fatal(err)
	}

	day := func(s string) time.Time {
		d, _ := time.Parse("2006-01-02", s)
		return d
	}
	yes := true
	row := func(date, sem, name string) models.CalendarDate {
		return models.CalendarDate{Date: day(date), Name: name, DateType: models.DateTypeNoClass,
			Scope: models.DateScopeSemester, Semester: sem, AcademicYear: 2569, AffectsWork: &yes, CreatedByID: 1}
	}
	// Already in the system: one semester holiday added by staff, one global one.
	if _, err := CreateCalendarDate(row("2026-10-12", "1", "สอบปลายภาค")); err != nil {
		t.Fatal(err)
	}
	global := row("2026-10-23", "", "วันปิยมหาราช")
	global.Scope, global.AcademicYear = models.DateScopeGlobal, 0
	if _, err := CreateCalendarDate(global); err != nil {
		t.Fatal(err)
	}

	created, skipped, err := ImportCalendarDates(2569, []models.CalendarDate{
		row("2026-10-12", "1", "สอบปลายภาค"),   // exists
		row("2026-10-13", "1", "สอบปลายภาค"),   // new
		row("2026-10-13", "1", "สอบปลายภาค"),   // repeated in the upload
		row("2026-10-12", "2", "สอบปลายภาค"),   // same day, other semester: new
		row("2026-10-12", "1", "วันหยุดอื่น"),  // same day, other name: new
		row("2026-10-23", "1", "วันปิยมหาราช"), // already a global holiday
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(created) != 3 || skipped != 3 {
		t.Fatalf("created %d, skipped %d; want 3 and 3", len(created), skipped)
	}
	for _, c := range created {
		if c.ID == 0 {
			t.Error("created row has no ID")
		}
	}

	keys, err := ExistingCalendarKeys(2569, []string{"1", "2", "S"})
	if err != nil {
		t.Fatal(err)
	}
	if !keys[CalendarKey(day("2026-10-13"), "1", "สอบปลายภาค")] || !keys[CalendarKey(day("2026-10-23"), "S", "วันปิยมหาราช")] {
		t.Error("existing keys miss an imported row or a global holiday")
	}
	if keys[CalendarKey(day("2026-10-14"), "1", "สอบปลายภาค")] {
		t.Error("unexpected key")
	}
}
