package database

import (
	"fmt"
	"os"
	"testing"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"labassist/models"
)

// This test creates its own database on the explicitly configured test server.
func TestPostingMigrationPreservesLegacyData(t *testing.T) {
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to a disposable MySQL server")
	}
	cfg, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	root, err := gorm.Open(mysql.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("labassist_migration_test_%d", time.Now().UnixNano())
	if err := root.Exec("CREATE DATABASE `" + name + "`").Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP DATABASE `" + name + "`"); conn, _ := root.DB(); conn.Close() })
	cfg.DBName = name
	db, err := gorm.Open(mysql.Open(cfg.FormatDSN()), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn, _ := db.DB(); conn.Close() })
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(db.AutoMigrate(&models.User{}, &models.Course{}, &models.Transcript{}))
	must(migrateApplicationData(db))
	must(db.Exec(`ALTER TABLE courses
 ADD lab_boy_slots INT DEFAULT 0, ADD lab_boy_accepted INT DEFAULT 0,
 ADD status VARCHAR(30), ADD deadline DATETIME NULL,
 ADD description TEXT, ADD requirements TEXT,
 ADD require_grade_proof BOOLEAN DEFAULT FALSE,
 ADD closed_by_instructor BOOLEAN DEFAULT FALSE,
 ADD lab_boy_schedule_confirmed BOOLEAN DEFAULT FALSE`).Error)
	u := models.User{FullName: "Legacy", Email: "legacy@test.invalid", Role: models.RoleStudent}
	must(db.Create(&u).Error)
	zero := uint(0)
	c := models.Course{Code: "LEGACY", Title: "Legacy", Semester: "1", AcademicYear: 2569, InstructorID: &zero}
	must(db.Create(&c).Error)
	must(db.Table("courses").Where("id = ?", c.ID).Updates(map[string]interface{}{
		"status": "open", "lab_boy_slots": 5, "lab_boy_accepted": 2, "require_grade_proof": true,
		"description": "original description", "deadline": "2030-01-01 00:00:00", "lab_boy_schedule_confirmed": true,
	}).Error)
	// Reproduce the old unique constraints before backfilling child rows.
	must(db.Exec("CREATE UNIQUE INDEX idx_application_student_course ON applications(student_id, course_id)").Error)
	must(db.Exec("CREATE UNIQUE INDEX idx_form_reviews_course_id ON form_reviews(course_id)").Error)
	// The legacy database has only the unique index supporting this FK.
	// AutoMigrate must install a replacement before removing that index.
	must(db.Exec("DROP INDEX idx_form_reviews_course_lookup ON form_reviews").Error)
	must(db.Exec("ALTER TABLE form_reviews ADD CONSTRAINT fk_form_reviews_course_id FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT").Error)
	a := models.Application{CourseID: c.ID, StudentID: u.ID, RoleApplied: models.RoleLabBoy, GradeProofData: []byte("legacy proof")}
	must(db.Create(&a).Error)
	r := models.FormReview{CourseID: c.ID, ReviewerID: u.ID, Status: models.ReviewVerified}
	must(db.Create(&r).Error)
	h := models.ApplicationHistory{ApplicationID: a.ID, CourseID: c.ID, StudentID: u.ID, AppliedAt: time.Now(), ArchivedAt: time.Now()}
	must(db.Create(&h).Error)
	d := models.StaffDocument{Name: "Legacy document", Type: models.DocWorkReport, StaffID: u.ID, CourseID: &c.ID}
	must(db.Create(&d).Error)
	for i := 0; i < 2; i++ {
		must(db.AutoMigrate(&models.User{}, &models.Course{}, &models.Transcript{}, &models.CourseInstructor{}))
		must(migrateApplicationData(db))
		must(BackfillPostings(db))
		must(migrateToPostingFKs(db))
		must(ensureForeignKeys(db))
	}
	var p models.Posting
	must(db.Where("course_id = ?", c.ID).First(&p).Error)
	if p.Status != models.StatusOpen || p.LabBoySlots != 5 || p.LabBoyAccepted != 2 || !p.RequireGradeProof || !p.LabBoyScheduleConfirmed || p.Description == nil || *p.Description != "original description" || p.Deadline == nil {
		t.Fatalf("legacy recruitment fields lost: %+v", p)
	}
	must(db.First(&a, a.ID).Error)
	must(db.First(&r, r.ID).Error)
	must(db.First(&h, h.ID).Error)
	must(db.First(&d, d.ID).Error)
	if a.PostingID != p.ID || r.PostingID != p.ID || h.PostingID != p.ID || d.PostingID == nil || *d.PostingID != p.ID || string(a.GradeProofData) != "legacy proof" {
		t.Fatal("legacy child links or proof lost")
	}
	var migrated models.Course
	must(db.First(&migrated, c.ID).Error)
	if migrated.InstructorID != nil {
		t.Fatal("unmatched instructor must become NULL")
	}
	// Restarting must not copy stale legacy columns over an edited posting.
	must(db.Model(&p).Update("lab_boy_slots", 7).Error)
	must(BackfillPostings(db))
	must(db.First(&p, p.ID).Error)
	if p.LabBoySlots != 7 {
		t.Fatal("restart overwrote posting")
	}
}
