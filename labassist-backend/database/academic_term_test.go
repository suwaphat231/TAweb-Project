package database

import (
	"os"
	"testing"
	"time"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestUpsertAcademicTerms(t *testing.T) {
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
	if err := DB.Migrator().DropTable(&models.AcademicTerm{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.AutoMigrate(&models.AcademicTerm{}); err != nil {
		t.Fatal(err)
	}

	d := func(s string) *time.Time { v, _ := time.Parse("2006-01-02", s); return &v }
	first := []models.AcademicTerm{
		{AcademicYear: 2569, Semester: "1", OpenDate: d("2026-06-22"), CloseDate: d("2026-10-30"), CreatedByID: 1},
		{AcademicYear: 2569, Semester: "2", OpenDate: d("2026-11-09"), CreatedByID: 1},
	}
	if err := UpsertAcademicTerms(first); err != nil {
		t.Fatal(err)
	}
	// Saving again replaces the dates instead of adding rows.
	second := []models.AcademicTerm{{AcademicYear: 2569, Semester: "1", OpenDate: d("2026-06-29"), CloseDate: d("2026-11-06"), CreatedByID: 2}}
	if err := UpsertAcademicTerms(second); err != nil {
		t.Fatal(err)
	}
	rows, err := ListAcademicTerms(2569)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (no duplicates)", len(rows))
	}
	if rows[0].Semester != "1" || rows[0].OpenDate.Format("2006-01-02") != "2026-06-29" ||
		rows[0].CloseDate.Format("2006-01-02") != "2026-11-06" || rows[0].CreatedByID != 2 {
		t.Errorf("semester 1 not replaced: %+v", rows[0])
	}
	if rows[1].Semester != "2" || rows[1].CloseDate != nil {
		t.Errorf("semester 2 should be untouched with no close date: %+v", rows[1])
	}
	other, _ := ListAcademicTermsForYears([]int{2568, 2570})
	if len(other) != 0 {
		t.Errorf("other years should be empty, got %d", len(other))
	}
}
