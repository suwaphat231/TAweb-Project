package database

import (
	"strings"

	"labassist/models"
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
func UpsertFormReview(courseID, reviewerID uint, status models.ReviewStatus, note string) (models.FormReview, error) {
	var r models.FormReview
	DB.Where("course_id = ?", courseID).FirstOrInit(&r)
	r.CourseID = courseID
	r.ReviewerID = reviewerID
	r.Status = status
	r.Note = note
	if err := DB.Save(&r).Error; err != nil {
		return models.FormReview{}, err
	}
	return enrichReview(r), nil
}

// reviewByCourseID returns the existing review or a synthetic pending one.
func reviewByCourseID(courseID uint) models.FormReview {
	var r models.FormReview
	if DB.Where("course_id = ?", courseID).First(&r).Error != nil {
		return models.FormReview{CourseID: courseID, Status: models.ReviewPending}
	}
	return r
}

// ListFormReviews returns all courses that have labboy slots, each enriched
// with their current review status. If statusFilter is non-empty only that
// status is returned.
func ListFormReviews(statusFilter, search string) []models.FormReview {
	var courses []models.Course
	DB.Where("lab_boy_slots > 0").Order("id DESC").Find(&courses)

	out := make([]models.FormReview, 0, len(courses))
	for _, c := range courses {
		raw := reviewByCourseID(c.ID)
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
func UpdateStaffDocumentStatus(id uint, status models.DocStatus) (models.StaffDocument, bool) {
	var d models.StaffDocument
	if DB.First(&d, id).Error != nil {
		return models.StaffDocument{}, false
	}
	d.Status = status
	if err := DB.Save(&d).Error; err != nil {
		return models.StaffDocument{}, false
	}
	return d, true
}

// UpdateRosterRegEntry sets the RegVerified flag and RegNote for one
// roster entry identified by StudentCode. Returns the updated document
// and false when the document or student code is not found.
func UpdateRosterRegEntry(docID uint, studentCode string, verified bool, note string) (models.StaffDocument, bool) {
	var d models.StaffDocument
	if DB.First(&d, docID).Error != nil {
		return models.StaffDocument{}, false
	}
	changed := false
	for i := range d.Roster {
		if d.Roster[i].StudentCode == studentCode {
			d.Roster[i].RegVerified = verified
			d.Roster[i].RegNote = note
			changed = true
			break
		}
	}
	if !changed {
		return models.StaffDocument{}, false
	}
	if err := DB.Save(&d).Error; err != nil {
		return models.StaffDocument{}, false
	}
	return d, true
}
