package database

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"labassist/models"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// --- Applications ---

func ApplicantsForCourse(courseID uint, roleFilter, statusFilter, search string) ([]models.Application, error) {
	posting, ok := ActivePostingForCourse(courseID)
	if !ok {
		return []models.Application{}, nil
	}
	rows, err := applicationRows("posting_id = ?", posting.ID)
	if err != nil {
		return nil, err
	}
	out := make([]models.Application, 0)
	for _, a := range rows {
		if roleFilter != "" && string(a.RoleApplied) != roleFilter {
			continue
		}
		if statusFilter != "" && string(a.Status) != statusFilter {
			continue
		}
		enriched := enrichApplication(a)
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(enriched.StudentName), s) && !strings.Contains(strings.ToLower(enriched.StudentCode), s) {
				continue
			}
		}
		out = append(out, enriched)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StudentGPA > out[j].StudentGPA })
	return out, nil
}

func StudentApplications(studentID uint) ([]models.Application, error) {
	rows, err := applicationRows("student_id = ?", studentID)
	if err != nil {
		return nil, err
	}
	out := make([]models.Application, 0)
	for _, a := range rows {
		if a.StudentID != studentID {
			continue
		}
		out = append(out, enrichApplication(a).StudentView())
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].AppliedAt.After(out[j].AppliedAt) })
	return out, nil
}

func RecentStudentApplications(studentID uint, limit int) ([]models.Application, error) {
	all, err := StudentApplications(studentID)
	if err != nil {
		return nil, err
	}
	active := all[:0]
	for _, a := range all {
		if a.PostingActive && a.Status != models.AppWithdrawn {
			active = append(active, a)
		}
	}
	if len(active) > limit {
		return active[:limit], nil
	}
	return active, nil
}

func CountAppliedByStudent(studentID uint) (int64, error) {
	var n int64
	err := DB.Model(&models.Application{}).
		Joins("JOIN postings ON postings.id = applications.posting_id AND postings.is_active = true").
		Where("student_id = ? AND applications.status <> ?", studentID, models.AppWithdrawn).Count(&n).Error
	return n, err
}

func ApplicationByID(id uint) (models.Application, bool) {
	var a models.Application
	if DB.First(&a, id).Error != nil {
		return a, false
	}
	return enrichApplication(a), true
}

func ApplicationByIDForStudent(id, studentID uint) (models.Application, bool) {
	var a models.Application
	if DB.Where("id = ? AND student_id = ?", id, studentID).First(&a).Error != nil {
		return a, false
	}
	return enrichApplication(a), true
}

func CreateApplication(a models.Application) (models.Application, error) {
	a.ID = 0
	a.AppliedAt = time.Now()

	// Resolve the active posting for this course. CallerID passes CourseID;
	// we set PostingID before persisting.
	posting, ok := ActivePostingForCourse(a.CourseID)
	if !ok {
		return models.Application{}, fmt.Errorf("no active posting for course %d", a.CourseID)
	}
	a.PostingID = posting.ID

	err := DB.Transaction(func(tx *gorm.DB) error {
		// Serialize with reset/delete so an in-flight request cannot attach
		// itself to a recruitment round that was just archived.
		var course models.Course
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, a.CourseID).Error; err != nil {
			return err
		}
		var current models.Posting
		if err := tx.Where("id = ? AND is_active = true", a.PostingID).First(&current).Error; err != nil {
			return ErrConflict
		}
		// Check for an existing application for this student in this posting.
		var existing models.Application
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("student_id = ? AND posting_id = ?", a.StudentID, a.PostingID).
			First(&existing).Error
		if err == nil {
			if existing.Status != models.AppWithdrawn && existing.Status != models.AppRejected {
				return ErrConflict
			}
			// An instructor-cancelled acceptance is not an invitation to
			// re-apply; only the instructor can accept the student again.
			if existing.Cancelled {
				return ErrConflict
			}
			// Archive the old round so the student's history and grade proof
			// from the rejected/withdrawn round are preserved for the instructor.
			snapshot := models.ApplicationHistory{
				ApplicationID:      existing.ID,
				StudentID:          existing.StudentID,
				PostingID:          existing.PostingID,
				CourseID:           existing.CourseID,
				RoleApplied:        existing.RoleApplied,
				Status:             existing.Status,
				Grade:              existing.Grade,
				AppliedAt:          existing.AppliedAt,
				ReviewedAt:         existing.ReviewedAt,
				ReviewedByID:       existing.ReviewedByID,
				Note:               existing.Note,
				WithdrawalReason:   existing.WithdrawalReason,
				OcrWarning:         existing.OcrWarning,
				GradeProofFileName: existing.GradeProofFileName,
				GradeProofData:     existing.GradeProofData,
				ArchivedAt:         time.Now(),
			}
			if err := tx.Create(&snapshot).Error; err != nil {
				return err
			}
			// Reuse the row — reset it to a fresh pending application.
			existing.Status = models.AppPending
			existing.RoleApplied = a.RoleApplied
			existing.Grade = a.Grade
			existing.AppliedAt = a.AppliedAt
			existing.ReviewedAt = nil
			existing.ReviewedByID = nil
			existing.Note = nil
			existing.OcrWarning = nil
			existing.GradeProofFileName = ""
			existing.GradeProofData = nil
			a = existing
			return tx.Omit(clause.Associations).Save(&existing).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := tx.Omit(clause.Associations).Create(&a).Error; err != nil {
			var mysqlErr *mysqldriver.MySQLError
			if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
				return ErrConflict
			}
			return err
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

func UpdateApplication(id uint, fn func(a *models.Application)) (models.Application, bool) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&a, id).Error; err != nil {
			return err
		}
		fn(&a)
		return tx.Omit(clause.Associations).Save(&a).Error
	})
	if err != nil {
		return models.Application{}, false
	}
	return enrichApplication(a), true
}

// ErrAlreadyWithdrawn is returned by WithdrawApplication when the row is already withdrawn.
var ErrAlreadyWithdrawn = errors.New("already withdrawn")

// WithdrawApplication atomically sets the application to withdrawn and, if it
// was previously accepted, decrements the course's accepted-slot counter — all
// within a single transaction so concurrent withdrawals cannot double-decrement.
func WithdrawApplication(id, studentID uint, reason string) (models.Application, error) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND student_id = ?", id, studentID).
			First(&a).Error; err != nil {
			return err
		}
		if a.Status == models.AppWithdrawn {
			return ErrAlreadyWithdrawn
		}
		// Accepted students may not withdraw once the instructor has
		// deliberately closed the posting; deadline-based auto-close alone
		// does not block withdrawal (ClosedByInstructor stays false).
		if a.Status == models.AppAccepted {
			var posting models.Posting
			if err := tx.First(&posting, a.PostingID).Error; err == nil && posting.ClosedByInstructor {
				return ErrWithdrawalClosed
			}
		}
		// An accepted Lab Boy only files a request; the instructor decides
		// in ResolveWithdrawRequest, so the slot stays taken until then.
		if a.Status == models.AppAccepted {
			if a.WithdrawRequested {
				return ErrWithdrawAlreadyRequested
			}
			now := time.Now()
			a.WithdrawRequested = true
			a.WithdrawRequestedAt = &now
			a.WithdrawalReason = &reason
			return tx.Omit(clause.Associations).Save(&a).Error
		}
		prevStatus := a.Status
		a.Status = models.AppWithdrawn
		a.WithdrawalReason = &reason
		// The student saw a cancelled acceptance as pending, so withdrawing
		// it must leave them free to re-apply like any other withdrawal.
		a.Cancelled = false
		if err := tx.Omit(clause.Associations).Save(&a).Error; err != nil {
			return err
		}
		if prevStatus == models.AppAccepted {
			return tx.Model(&models.Posting{}).Where("id = ?", a.PostingID).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

// ErrWithdrawAlreadyRequested is returned by WithdrawApplication when an
// accepted student's withdrawal request is still awaiting the instructor.
var ErrWithdrawAlreadyRequested = errors.New("withdraw already requested")

// ErrNoWithdrawRequest is returned by ResolveWithdrawRequest when the
// application has no pending withdrawal request.
var ErrNoWithdrawRequest = errors.New("no pending withdraw request")

// ErrPostingArchived is returned when the application's posting has been
// archived, which makes it read-only.
var ErrPostingArchived = errors.New("posting archived")

// ResolveWithdrawRequest approves or rejects an accepted Lab Boy's pending
// withdrawal request. Approving withdraws the application and hands its slot
// back; rejecting clears the request and leaves the student accepted.
func ResolveWithdrawRequest(appID uint, approve bool, reviewerID uint) (models.Application, error) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&a, appID).Error; err != nil {
			return err
		}
		if a.Status != models.AppAccepted || !a.WithdrawRequested {
			return ErrNoWithdrawRequest
		}
		var posting models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&posting, a.PostingID).Error; err != nil {
			return err
		}
		if !posting.IsActive {
			return ErrPostingArchived
		}
		now := time.Now()
		a.WithdrawRequested = false
		a.ReviewedAt = &now
		a.ReviewedByID = &reviewerID
		if approve {
			a.Status = models.AppWithdrawn
		} else {
			a.WithdrawRequestedAt = nil
			a.WithdrawalReason = nil
		}
		if err := tx.Omit(clause.Associations).Save(&a).Error; err != nil {
			return err
		}
		if approve {
			return tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

// ReviewTxResult is returned by ReviewApplicationTx.
type ReviewTxResult struct {
	Archived     bool // archived rounds are read-only
	Updated      models.Application
	PrevStatus   models.AppStatus
	SlotsFull    bool // true when skipped because the course had no remaining slots
	WasWithdrawn bool // true when skipped because the student withdrew after the pre-check
	MissingProof bool // true when skipped because course requires grade proof but none uploaded
}

// ReviewApplicationTx atomically checks slot availability, updates the
// application, and adjusts the course's accepted count inside one transaction
// with row-level locks on both the course and the application. This prevents
// two concurrent accepts from both passing the slot check when only one slot
// remains. When SlotsFull is true the application is unchanged and no error
// is returned.
func ReviewApplicationTx(appID uint, newStatus models.AppStatus, applyFields func(a *models.Application)) (ReviewTxResult, error) {
	var res ReviewTxResult
	err := DB.Transaction(func(tx *gorm.DB) error {
		var app models.Application
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&app, appID).Error; err != nil {
			return err
		}

		var posting models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&posting, app.PostingID).Error; err != nil {
			return err
		}
		if !posting.IsActive {
			res.Archived = true
			return nil
		}

		// Re-check after acquiring the lock: the student may have withdrawn
		// between the handler's pre-check and this point.
		if app.Status == models.AppWithdrawn {
			res.WasWithdrawn = true
			return nil
		}

		prevStatus := app.Status

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			if app.RoleApplied == models.RoleLabBoy && posting.LabBoyAccepted >= posting.LabBoySlots {
				res.SlotsFull = true
				return nil
			}
			// Enforce grade-proof requirement inside the lock so a direct API
			// call or a race between upload and review cannot bypass it.
			if posting.RequireGradeProof && len(app.GradeProofData) == 0 {
				res.MissingProof = true
				return nil
			}
		}

		applyFields(&app)
		// Leaving accepted settles any pending withdrawal request.
		if app.Status != models.AppAccepted {
			app.WithdrawRequested = false
		}
		if err := tx.Omit(clause.Associations).Save(&app).Error; err != nil {
			return err
		}

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			if err := tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("lab_boy_accepted + 1")).Error; err != nil {
				return err
			}
		} else if prevStatus == models.AppAccepted && newStatus != models.AppAccepted {
			if err := tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error; err != nil {
				return err
			}
		}

		res.PrevStatus = prevStatus
		res.Updated = enrichApplication(app)
		return nil
	})
	return res, err
}

// SetApplicationGradeProof stores the uploaded grade-proof image on an
// application, replacing any previous upload. Ownership must be checked by
// the caller before calling this (e.g. via ApplicationByIDForStudent).
func SetApplicationGradeProof(id uint, fileName string, data []byte) (models.Application, bool) {
	return UpdateApplication(id, func(a *models.Application) {
		a.GradeProofFileName = fileName
		a.GradeProofData = data
	})
}

// ApplicationGradeProofData returns the raw image bytes for an application's
// grade proof, for the download endpoints. Ownership/authorization must be
// checked by the caller first.
func ApplicationGradeProofData(id uint) (fileName string, data []byte, ok bool) {
	var a models.Application
	if DB.Select("grade_proof_file_name", "grade_proof_data").First(&a, id).Error != nil || len(a.GradeProofData) == 0 {
		return "", nil, false
	}
	return a.GradeProofFileName, a.GradeProofData, true
}

func BulkUpdateApplications(ids []uint, fn func(a *models.Application)) int64 {
	var rows []models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ?", ids).Order("id").Find(&rows).Error; err != nil {
			return err
		}
		for i := range rows {
			fn(&rows[i])
			if err := tx.Omit(clause.Associations).Save(&rows[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0
	}
	return int64(len(rows))
}

func CountApplications() (int64, error) {
	var n int64
	err := DB.Model(&models.Application{}).Count(&n).Error
	return n, err
}

func CountApplicationsByStatus(status models.AppStatus) (int64, error) {
	var n int64
	err := DB.Model(&models.Application{}).Where("status = ?", status).Count(&n).Error
	return n, err
}

func applicationRows(query string, args ...interface{}) ([]models.Application, error) {
	rows := make([]models.Application, 0)
	if err := DB.Where(query, args...).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ApplicationHistoryForApplication returns all archived rounds for an
// application, newest first. Each entry represents one rejected or withdrawn
// round the student re-applied from.
func ApplicationHistoryForApplication(applicationID uint) ([]models.ApplicationHistory, error) {
	var rows []models.ApplicationHistory
	if err := DB.Where("application_id = ?", applicationID).Order("archived_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
