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
	if err := DB.AutoMigrate(&models.User{}, &models.Course{}); err != nil {
		t.Fatal(err)
	}
	if err := migrateApplicationData(DB); err != nil {
		t.Fatal(err)
	}
	suffix := time.Now().Format("150405.000000000")
	student, err := CreateUser(models.User{FullName: "Persistence student", Email: suffix + "@test.invalid", Role: models.RoleStudent})
	if err != nil {
		t.Fatal(err)
	}
	course := CreateCourse(models.Course{Code: "TEST", Title: "Persistence", Status: models.StatusDraft})
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
	if _, ok := ApplicationByID(app.ID); ok {
		t.Fatal("reset retained application")
	}
}
