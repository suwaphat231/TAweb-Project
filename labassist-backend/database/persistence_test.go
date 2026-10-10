package database

import (
	"bytes"
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"labassist/models"
)

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestPersistenceAcrossConnections(t *testing.T) {
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to an empty disposable MySQL database")
	}
	old := DB
	t.Cleanup(func() { DB = old })
	open := func() {
		db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
		if err != nil {
			t.Fatal(err)
		}
		DB = db
	}
	open()
	if err := DB.AutoMigrate(&models.User{}, &models.Course{}, &models.Transcript{}); err != nil {
		t.Fatal(err)
	}
	if err := migrateApplicationData(DB); err != nil {
		t.Fatal(err)
	}
	if err := migrateToPostingFKs(DB); err != nil {
		t.Fatal(err)
	}
	if err := ensureForeignKeys(DB); err != nil {
		t.Fatal(err)
	}
	suffix := time.Now().Format("150405.000000000")
	student, err := CreateUser(models.User{FullName: "Persistence student", Email: suffix + "@test.invalid", Role: models.RoleStudent})
	if err != nil {
		t.Fatal(err)
	}
	course := CreateCourse(models.Course{Code: suffix, Title: "Persistence", Status: models.StatusOpen, LabBoySlots: 2, Semester: "1", AcademicYear: 2569})
	app, err := CreateApplication(models.Application{StudentID: student.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy})
	if err != nil {
		t.Fatal(err)
	}
	proof := bytes.Repeat([]byte{1, 2, 3, 4}, 256*1024) // Larger than MySQL BLOB's 64 KB limit.
	if _, ok := SetApplicationGradeProof(app.ID, "proof.png", proof); !ok {
		t.Fatal("save proof")
	}
	reviewed := time.Now().Truncate(time.Second)
	note := "approved"
	if _, ok := UpdateApplication(app.ID, func(a *models.Application) {
		a.Status = models.AppAccepted
		a.ReviewedAt = &reviewed
		a.ReviewedByID = &student.ID
		a.Note = &note
	}); !ok {
		t.Fatal("save review")
	}
	if CreateNotifications([]models.Notification{{UserID: student.ID, Title: "Accepted", Body: "Saved"}}) != 1 {
		t.Fatal("save notification")
	}
	n := UserNotifications(student.ID)[0]
	MarkNotifRead(n.ID, student.ID+1)
	if UserNotifications(student.ID)[0].IsRead {
		t.Fatal("another user marked notification")
	}
	MarkNotifRead(n.ID, student.ID)
	CreateActivityLog(models.ActivityLog{UserID: &student.ID, Method: "POST", Path: "/persistence-test", StatusCode: 200})
	sqlDB, _ := DB.DB()
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	open()
	t.Cleanup(func() { db, _ := DB.DB(); db.Close() })
	if err := migrateApplicationData(DB); err != nil {
		t.Fatal("repeat migration:", err)
	}
	got, ok := ApplicationByID(app.ID)
	if !ok || got.Status != models.AppAccepted || got.Note == nil || *got.Note != note || got.ReviewedAt == nil || !got.ReviewedAt.Equal(reviewed) || got.ReviewedByID == nil || *got.ReviewedByID != student.ID || !got.HasGradeProof {
		t.Fatalf("review lost: %+v", got)
	}
	name, data, ok := ApplicationGradeProofData(app.ID)
	if !ok || name != "proof.png" || !bytes.Equal(data, proof) {
		t.Fatal("proof lost")
	}
	if _, ok := ApplicationByIDForStudent(app.ID, student.ID+1); ok {
		t.Fatal("another user read application")
	}
	if len(StudentApplications(student.ID)) != 1 || len(AcceptedStudentsForCourse(course.ID)) != 1 {
		t.Fatal("listing lost")
	}
	if !UserNotifications(student.ID)[0].IsRead {
		t.Fatal("read state lost")
	}
	logs, total := ListActivityLogs("", "POST", 0, 10)
	if total < 1 || logs[0].Path != "/persistence-test" {
		t.Fatal("activity lost")
	}
	if _, err := CreateApplication(models.Application{StudentID: student.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy}); err != ErrConflict {
		t.Fatalf("duplicate: %v", err)
	}
	if _, ok := ResetCourseToDraft(course.ID); !ok {
		t.Fatal("reset failed")
	}
	if saved, ok := ApplicationByID(app.ID); !ok || saved.PostingID != app.PostingID {
		t.Fatal("reset lost historical application")
	}
	if len(ApplicantsForCourse(course.ID, "", "", "")) != 0 {
		t.Fatal("old applications leaked into new round")
	}
	newApp, err := CreateApplication(models.Application{StudentID: student.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy})
	if err != nil || newApp.PostingID == app.PostingID || newApp.ID == app.ID {
		t.Fatalf("new round application: %+v, %v", newApp, err)
	}
	if DeleteCourse(course.ID) {
		t.Fatal("deleted course with historical applications")
	}
	if _, ok := UpdateCourse(course.ID, func(c *models.Course) {
		c.LabBoySlots = 3
		c.RequireGradeProof = true
	}); !ok {
		t.Fatal("set posting fields")
	}
	if _, ok := UpdateCourse(course.ID, func(c *models.Course) {
		c.LabBoySlots = 0
		c.RequireGradeProof = false
		c.Deadline = nil
	}); !ok {
		t.Fatal("clear posting fields")
	}
	current, _ := ActivePostingForCourse(course.ID)
	if current.LabBoySlots != 0 || current.RequireGradeProof || current.Deadline != nil {
		t.Fatalf("zero values were not saved: %+v", current)
	}
	if _, err := WithdrawApplication(app.ID, student.ID, "ตารางเรียนชน"); err != nil {
		t.Fatal(err)
	}
	current, _ = ActivePostingForCourse(course.ID)
	if current.LabBoyAccepted != 0 {
		t.Fatal("old withdrawal changed new round counter")
	}
	if err := DB.Create(&models.Posting{CourseID: course.ID, IsActive: true, Status: models.StatusDraft}).Error; err == nil {
		t.Fatal("database allowed two active postings")
	}
	duplicate := models.Course{Code: course.Code, Title: "Duplicate", Semester: course.Semester, AcademicYear: course.AcademicYear}
	if err := DB.Create(&duplicate).Error; err == nil {
		t.Fatal("database allowed duplicate course")
	}
	if err := DB.Create(&models.Posting{CourseID: 999999999, IsActive: true, Status: models.StatusDraft}).Error; err == nil {
		t.Fatal("database allowed orphan posting")
	}
	if err := migrateToPostingFKs(DB); err != nil {
		t.Fatal("repeat posting migration:", err)
	}
	if err := ensureForeignKeys(DB); err != nil {
		t.Fatal("repeat foreign keys:", err)
	}
	if _, err := UpsertFormReview(course.ID, student.ID, models.ReviewVerified, "checked"); err != nil {
		t.Fatal(err)
	}
	if err := DB.Create(&models.FormReview{CourseID: course.ID, PostingID: newApp.PostingID, ReviewerID: student.ID, Status: models.ReviewPending}).Error; err == nil {
		t.Fatal("database allowed duplicate posting review")
	}
}
