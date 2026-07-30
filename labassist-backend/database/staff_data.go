package database

import (
	"sort"
	"strings"
	"sync"
	"time"

	"labassist/models"
)

var staffMu sync.RWMutex

var (
	formReviews    []*models.FormReview
	staffDocuments []*models.StaffDocument

	nextReviewID uint = 1
	nextDocID    uint = 1
)

// enrichReview copies course fields onto the review so callers get everything
// in one response without a second round-trip.
func enrichReview(r models.FormReview) models.FormReview {
	c, ok := CourseByID(r.CourseID)
	if !ok {
		return r
	}
	r.CourseCode = c.Code
	r.CourseTitle = c.Title
	r.Section = c.Section
	r.Semester = c.Semester
	r.AcademicYear = c.AcademicYear
	r.InstructorName = c.InstructorName
	r.LabBoySlots = c.LabBoySlots
	r.AcceptedCount = c.LabBoyAccepted
	r.SubmittedAt = c.CreatedAt.Format("2006-01-02")
	return r
}

// UpsertFormReview creates or replaces the staff review for a course.
func UpsertFormReview(courseID, reviewerID uint, status models.ReviewStatus, note string) models.FormReview {
	staffMu.Lock()
	defer staffMu.Unlock()
	for _, r := range formReviews {
		if r.CourseID == courseID {
			r.ReviewerID = reviewerID
			r.Status = status
			r.Note = note
			r.UpdatedAt = time.Now()
			return enrichReview(*r)
		}
	}
	r := &models.FormReview{
		ID:         nextReviewID,
		CourseID:   courseID,
		ReviewerID: reviewerID,
		Status:     status,
		Note:       note,
		UpdatedAt:  time.Now(),
	}
	nextReviewID++
	formReviews = append(formReviews, r)
	return enrichReview(*r)
}

// reviewByCourseIDLocked returns the existing review or a synthetic pending
// one — caller must hold staffMu.
func reviewByCourseIDLocked(courseID uint) models.FormReview {
	for _, r := range formReviews {
		if r.CourseID == courseID {
			return *r
		}
	}
	return models.FormReview{CourseID: courseID, Status: models.ReviewPending}
}

// ListFormReviews returns all courses that have labboy slots, each enriched
// with their current review status. If statusFilter is non-empty only that
// status is returned.
func ListFormReviews(statusFilter, search string) []models.FormReview {
	var courses []models.Course
	DB.Where("labboy_slots > 0").Order("id DESC").Find(&courses)

	staffMu.RLock()
	defer staffMu.RUnlock()

	out := make([]models.FormReview, 0, len(courses))
	for _, c := range courses {
		raw := reviewByCourseIDLocked(c.ID)
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

// CreateStaffDocument adds a new document to the in-memory list.
func CreateStaffDocument(d models.StaffDocument) models.StaffDocument {
	staffMu.Lock()
	defer staffMu.Unlock()
	d.ID = nextDocID
	nextDocID++
	d.CreatedAt = time.Now()
	cp := d
	staffDocuments = append(staffDocuments, &cp)
	return cp
}

// ListStaffDocuments returns documents filtered by type and/or status, newest first.
func ListStaffDocuments(typeFilter, statusFilter, search string) []models.StaffDocument {
	staffMu.RLock()
	defer staffMu.RUnlock()

	out := make([]models.StaffDocument, 0, len(staffDocuments))
	for i := len(staffDocuments) - 1; i >= 0; i-- {
		d := *staffDocuments[i]
		if typeFilter != "" && string(d.Type) != typeFilter {
			continue
		}
		if statusFilter != "" && string(d.Status) != statusFilter {
			continue
		}
		if search != "" {
			q := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(d.Name), q) &&
				!strings.Contains(strings.ToLower(d.CourseRef), q) {
				continue
			}
		}
		out = append(out, d)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

// UpdateStaffDocumentStatus changes the status of a document by ID.
func UpdateStaffDocumentStatus(id uint, status models.DocStatus) (models.StaffDocument, bool) {
	staffMu.Lock()
	defer staffMu.Unlock()
	for _, d := range staffDocuments {
		if d.ID == id {
			d.Status = status
			return *d, true
		}
	}
	return models.StaffDocument{}, false
}
