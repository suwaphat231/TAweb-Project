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
func TestReviewAutoClosesFullPostingAndReopensOnCancel(t *testing.T) {
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
	if err := DB.AutoMigrate(&models.User{}, &models.Posting{}, &models.Application{}); err != nil {
		t.Fatal(err)
	}

	future := time.Now().AddDate(0, 0, 7)
	posting := models.Posting{CourseID: 900001, IsActive: true, LabBoySlots: 2, Status: models.StatusOpen, Deadline: &future}
	if err := DB.Create(&posting).Error; err != nil {
		t.Fatal(err)
	}
	apply := func(student uint) models.Application {
		a := models.Application{StudentID: student, PostingID: posting.ID, CourseID: posting.CourseID,
			RoleApplied: models.RoleLabBoy, Status: models.AppPending}
		if err := DB.Create(&a).Error; err != nil {
			t.Fatal(err)
		}
		return a
	}
	review := func(a models.Application, st models.AppStatus) ReviewTxResult {
		res, err := ReviewApplicationTx(a.ID, st, func(x *models.Application) { x.Status = st })
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	status := func() models.CourseStatus {
		var p models.Posting
		DB.First(&p, posting.ID)
		return p.Status
	}

	a1, a2, a3 := apply(1), apply(2), apply(3)
	if res := review(a1, models.AppAccepted); res.AutoClosed || status() != models.StatusOpen {
		t.Fatalf("first accept closed the round: %+v status=%s", res, status())
	}
	if res := review(a2, models.AppAccepted); !res.AutoClosed || status() != models.StatusClosed {
		t.Fatalf("filling the last slot should close: %+v status=%s", res, status())
	}
	if res := review(a3, models.AppAccepted); !res.SlotsFull {
		t.Fatalf("accept past capacity: %+v", res)
	}

	// Freeing a slot reopens a round that closed only because it was full.
	if res := review(a2, models.AppRejected); !res.Reopened || status() != models.StatusOpen {
		t.Fatalf("cancel should reopen: %+v status=%s", res, status())
	}

	// A round the instructor closed by hand stays closed.
	review(a3, models.AppAccepted)
	DB.Model(&models.Posting{}).Where("id = ?", posting.ID).UpdateColumn("closed_by_instructor", true)
	if res := review(a3, models.AppRejected); res.Reopened || status() != models.StatusClosed {
		t.Fatalf("instructor-closed round reopened: %+v status=%s", res, status())
	}
}
