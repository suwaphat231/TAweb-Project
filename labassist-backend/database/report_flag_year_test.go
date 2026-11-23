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
func TestConfirmedReportFlagLastsOneAcademicYear(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.User{}, &models.Course{}, &models.LabBoyReport{},
		&models.LabBoyReportReview{}, &models.LabBoyReportResponse{}); err != nil {
		t.Fatal(err)
	}

	mkCourse := func(code, sem string, year int) models.Course {
		c := models.Course{Code: code, Title: code, Section: 1, Semester: sem, AcademicYear: year}
		if err := DB.Create(&c).Error; err != nil {
			t.Fatal(err)
		}
		return c
	}
	c68 := mkCourse("RF0001", "2", 2568)
	c69 := mkCourse("RF0002", "1", 2569)
	const stu = 990001
	report := func(c models.Course, st models.ReportStatus) {
		r := models.LabBoyReport{ApplicationID: 1, StudentID: stu, CourseID: c.ID, ReporterID: 1,
			IncidentDate: time.Now(), Category: models.CategoryAbsence, Description: "x", Status: st}
		if err := DB.Create(&r).Error; err != nil {
			t.Fatal(err)
		}
	}
	report(c68, models.ReportConfirmed)
	report(c69, models.ReportConfirmed)
	report(c69, models.ReportSubmitted) // not confirmed: never a flag

	for _, tc := range []struct{ year, want int }{{2568, 2}, {2569, 1}, {2570, 0}} {
		counts, err := ConfirmedRecordCounts([]uint{stu}, tc.year)
		if err != nil {
			t.Fatal(err)
		}
		recs, err := ConfirmedRecordsForStudent(stu, tc.year)
		if err != nil {
			t.Fatal(err)
		}
		if counts[stu] != tc.want || len(recs) != tc.want {
			t.Fatalf("year %d: count=%d records=%d, want %d", tc.year, counts[stu], len(recs), tc.want)
		}
		for _, r := range recs {
			if r.CourseYear < tc.year {
				t.Fatalf("year %d: got record from %d", tc.year, r.CourseYear)
			}
		}
	}
}
