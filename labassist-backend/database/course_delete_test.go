package database

import (
	"errors"
	"os"
	"strings"
	"testing"

	"labassist/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Run against an empty disposable MySQL database using LABASSIST_TEST_MYSQL_DSN.
func TestAdminCourseDeletePolicy(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.User{}, &models.Course{}, &models.Posting{}, &models.Application{},
		&models.ApplicationHistory{}, &models.FormReview{}, &models.StaffDocument{}, &models.StaffCase{},
		&models.ScheduleGroup{}, &models.WorkOccurrence{}, &models.MonthlyPeriod{}, &models.StaffAuditLog{},
		&models.CalendarDate{}, &models.Notification{}); err != nil {
		t.Fatal(err)
	}

	student := models.User{FullName: "นักศึกษาทดสอบ", Email: "del-test@silpakorn.edu", Role: models.RoleStudent}
	if err := DB.Create(&student).Error; err != nil {
		t.Fatal(err)
	}
	const term = "1"
	year := 2601 // a term no other test uses
	course := func(code string, posting models.CourseStatus) (models.Course, models.Posting) {
		t.Helper()
		c := models.Course{Code: code, Title: "วิชา " + code, Section: 1, Semester: term, AcademicYear: year}
		if err := DB.Omit(clause.Associations).Create(&c).Error; err != nil {
			t.Fatal(err)
		}
		p := models.Posting{CourseID: c.ID, IsActive: true, Status: posting}
		if err := DB.Create(&p).Error; err != nil {
			t.Fatal(err)
		}
		return c, p
	}
	apply := func(c models.Course, p models.Posting, status models.AppStatus) models.Application {
		t.Helper()
		a := models.Application{StudentID: student.ID, CourseID: c.ID, PostingID: p.ID,
			RoleApplied: models.RoleLabBoy, Status: status}
		if err := DB.Omit(clause.Associations).Create(&a).Error; err != nil {
			t.Fatal(err)
		}
		return a
	}

	// Only a withdrawn application, posting already reset to draft: deletable.
	withdrawnOnly, wp := course("DEL01", models.StatusDraft)
	withdrawn := apply(withdrawnOnly, wp, models.AppWithdrawn)
	// Recruitment open right now: blocked.
	recruiting, _ := course("DEL02", models.StatusOpen)
	// An accepted Lab Boy: blocked.
	accepted, ap := course("DEL03", models.StatusClosed)
	apply(accepted, ap, models.AppAccepted)
	// Nothing at all: deletable.
	empty, _ := course("DEL04", models.StatusDraft)
	// A withdrawn application plus the empty staff case opened with the
	// posting: deletable, and the empty case goes with it.
	shell, shellPosting := course("DEL05", models.StatusDraft)
	apply(shell, shellPosting, models.AppWithdrawn)
	staffCase := func(c models.Course, p models.Posting) models.StaffCase {
		t.Helper()
		sc := models.StaffCase{PostingID: p.ID, CourseID: c.ID, Semester: term, AcademicYear: year, CreatedByID: student.ID}
		if err := DB.Create(&sc).Error; err != nil {
			t.Fatal(err)
		}
		return sc
	}
	emptyCase := staffCase(shell, shellPosting)
	// A staff case with a work schedule: blocked.
	working, workingPosting := course("DEL06", models.StatusClosed)
	workCase := staffCase(working, workingPosting)
	if err := DB.Create(&models.ScheduleGroup{StaffCaseID: workCase.ID, WeekDay: "MON", StartTime: "13:00", EndTime: "16:00"}).Error; err != nil {
		t.Fatal(err)
	}

	var blocked *CourseDeleteBlockedError
	if err := DeleteCourse(recruiting.ID); !errors.As(err, &blocked) || !errors.Is(err, ErrConflict) ||
		!strings.Contains(err.Error(), "เปิดรับสมัคร") {
		t.Fatalf("open recruitment: %v", err)
	}
	if err := DeleteCourse(accepted.ID); !errors.As(err, &blocked) || !strings.Contains(err.Error(), "นักศึกษาที่รับแล้ว 1 รายการ") {
		t.Fatalf("accepted Lab Boy: %v", err)
	}
	if _, ok := CourseByID(accepted.ID); !ok {
		t.Fatal("a refused delete must not remove anything")
	}

	deleted, skipped, err := DeleteCoursesByTerm(term, year)
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 3 || len(skipped) != 3 || skipped[0].Code != "DEL02" || skipped[1].Code != "DEL03" ||
		skipped[2].Code != "DEL06" ||
		!strings.Contains(skipped[0].Reason, "เปิดรับสมัคร") || !strings.Contains(skipped[1].Reason, "รับแล้ว") ||
		!strings.Contains(skipped[2].Reason, "งานจ้าง Lab Boy") {
		t.Fatalf("term delete: deleted %d, skipped %+v", deleted, skipped)
	}
	var n int64
	DB.Model(&models.StaffCase{}).Where("id = ?", emptyCase.ID).Count(&n)
	if n != 0 {
		t.Error("the empty staff case goes with its course")
	}
	DB.Model(&models.StaffCase{}).Where("id = ?", workCase.ID).Count(&n)
	if n != 1 {
		t.Error("a staff case with work must stay")
	}
	for _, id := range []uint{withdrawnOnly.ID, empty.ID, shell.ID} {
		if _, ok := CourseByID(id); ok {
			t.Errorf("course %d should be deleted", id)
		}
	}
	DB.Model(&models.Application{}).Where("id = ?", withdrawn.ID).Count(&n)
	if n != 0 {
		t.Error("the withdrawn application goes with its course")
	}
	DB.Model(&models.Posting{}).Where("course_id = ?", withdrawnOnly.ID).Count(&n)
	if n != 0 {
		t.Error("postings go with their course")
	}
}
