package database

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"labassist/models"
)

var errStudentNotInRoster = errors.New("student not in roster")

// enrichReview copies course and posting fields onto the review so callers
// get everything in one response without a second round-trip.
func enrichReview(r models.FormReview) models.FormReview {
	var courseID uint
	if r.PostingID != 0 {
		if p, ok := postingByID(r.PostingID); ok {
			courseID = p.CourseID
			r.LabBoySlots = p.LabBoySlots
			r.AcceptedCount = p.LabBoyAccepted
		}
	} else {
		courseID = r.CourseID
	}
	if c, ok := CourseByID(courseID); ok {
		r.CourseCode = c.Code
		r.CourseTitle = c.Title
		r.Section = c.Section
		r.Semester = c.Semester
		r.AcademicYear = c.AcademicYear
		r.InstructorName = c.InstructorName
		r.SubmittedAt = c.CreatedAt.Format("2006-01-02")
		// Slots/accepted from posting take priority; fall back to course for
		// legacy rows where PostingID was not yet set.
		if r.PostingID == 0 {
			r.LabBoySlots = c.LabBoySlots
			r.AcceptedCount = c.LabBoyAccepted
		}
	}
	return r
}

// UpsertFormReview creates or replaces the staff review for the active
// posting of a course. Wrapped in a transaction so the posting lookup and
// the upsert are always consistent.
func UpsertFormReview(courseID, reviewerID uint, status models.ReviewStatus, note string) (models.FormReview, error) {
	var result models.FormReview
	err := DB.Transaction(func(tx *gorm.DB) error {
		var posting models.Posting
		if err := tx.Where("course_id = ? AND is_active = true", courseID).First(&posting).Error; err != nil {
			return fmt.Errorf("no active posting for course %d", courseID)
		}
		r := models.FormReview{PostingID: posting.ID, CourseID: courseID, ReviewerID: reviewerID, Status: status, Note: note}
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "posting_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"reviewer_id", "status", "note", "updated_at"}),
		}).Create(&r).Error; err != nil {
			return err
		}
		if err := tx.Where("posting_id = ?", posting.ID).First(&r).Error; err != nil {
			return err
		}
		result = enrichReview(r)
		return nil
	})
	return result, err
}

// reviewByPostingID returns the existing review for a posting or a synthetic pending one.
func reviewByPostingID(postingID, courseID uint) models.FormReview {
	var r models.FormReview
	if DB.Where("posting_id = ?", postingID).First(&r).Error != nil {
		return models.FormReview{PostingID: postingID, CourseID: courseID, Status: models.ReviewPending}
	}
	return r
}

// ListFormReviews returns all active postings with labboy slots, each
// enriched with their current review status. If statusFilter is non-empty
// only that status is returned.
func ListFormReviews(statusFilter, search string) []models.FormReview {
	var postings []models.Posting
	DB.Where("is_active = true AND lab_boy_slots > 0").Order("id DESC").Find(&postings)

	out := make([]models.FormReview, 0, len(postings))
	for _, p := range postings {
		raw := reviewByPostingID(p.ID, p.CourseID)
		if statusFilter != "" && string(raw.Status) != statusFilter {
			continue
		}
		r := enrichReview(raw)
		if search != "" {
			q := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(r.CourseCode), q) &&
				!strings.Contains(strings.ToLower(r.CourseTitle), q) &&
				!strings.Contains(strings.ToLower(r.InstructorName), q) {
				continue
			}
		}
		out = append(out, r)
	}
	return out
}

// --- StaffDocument ---

// CreateStaffDocument persists a new document to the database.
func CreateStaffDocument(d models.StaffDocument) (models.StaffDocument, error) {
	d.ID = 0
	if err := DB.Create(&d).Error; err != nil {
		return models.StaffDocument{}, err
	}
	return d, nil
}

// StaffDocumentByID returns a single document by ID.
func StaffDocumentByID(id uint) (models.StaffDocument, bool) {
	var d models.StaffDocument
	if DB.First(&d, id).Error != nil {
		return models.StaffDocument{}, false
	}
	return d, true
}

// ListStaffDocuments returns documents filtered by type and/or status, newest first.
func ListStaffDocuments(typeFilter, statusFilter, search string) []models.StaffDocument {
	query := DB.Order("created_at DESC")
	if typeFilter != "" {
		query = query.Where("type = ?", typeFilter)
	}
	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}
	if search != "" {
		q := "%" + strings.ToLower(search) + "%"
		query = query.Where("LOWER(name) LIKE ? OR LOWER(course_ref) LIKE ?", q, q)
	}
	var out []models.StaffDocument
	query.Find(&out)
	return out
}

// UpdateStaffDocumentStatus changes the status of a document by ID.
// Uses SELECT FOR UPDATE so concurrent calls on the same row are serialized,
// and only the status column is written (not the full row).
func UpdateStaffDocumentStatus(id uint, status models.DocStatus) (models.StaffDocument, bool) {
	var result models.StaffDocument
	err := DB.Transaction(func(tx *gorm.DB) error {
		var d models.StaffDocument
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&d, id).Error; err != nil {
			return err
		}
		if d.Status == status {
			result = d
			return nil
		}
		if err := tx.Model(&d).Update("status", status).Error; err != nil {
			return err
		}
		d.Status = status
		result = d
		return nil
	})
	if err != nil {
		return models.StaffDocument{}, false
	}
	return result, true
}

// UpdateStaffDocumentSchedule replaces the work_schedule and sessions_per_month
// fields on a document (hiring_notice) without touching any other columns.
func UpdateStaffDocumentSchedule(id uint, schedule []models.WorkDaySlot, sessionsPerMonth int) (models.StaffDocument, bool) {
	var doc models.StaffDocument
	if err := DB.First(&doc, id).Error; err != nil {
		return models.StaffDocument{}, false
	}
	doc.WorkSchedule = schedule
	doc.SessionsPerMonth = sessionsPerMonth
	if err := DB.Model(&doc).Select("work_schedule", "sessions_per_month").Updates(&doc).Error; err != nil {
		return models.StaffDocument{}, false
	}
	return doc, true
}

// UpdateRosterRegEntry sets the RegVerified flag and RegNote for one roster
// entry identified by StudentCode.
//
// Uses SELECT FOR UPDATE so two staff verifying different students on the same
// document are serialized — preventing a concurrent save from silently
// overwriting the other's change. Only the roster column is written back.
func UpdateRosterRegEntry(docID uint, studentCode string, verified bool, note string) (models.StaffDocument, bool) {
	var result models.StaffDocument
	err := DB.Transaction(func(tx *gorm.DB) error {
		var d models.StaffDocument
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&d, docID).Error; err != nil {
			return err
		}
		for i := range d.Roster {
			if d.Roster[i].StudentCode != studentCode {
				continue
			}
			// Skip write if nothing changed.
			if d.Roster[i].RegVerified == verified && d.Roster[i].RegNote == note {
				result = d
				return nil
			}
			d.Roster[i].RegVerified = verified
			d.Roster[i].RegNote = note
			if err := tx.Model(&d).Update("roster", d.Roster).Error; err != nil {
				return err
			}
			result = d
			return nil
		}
		return errStudentNotInRoster
	})
	if err != nil {
		return models.StaffDocument{}, false
	}
	return result, true
}
