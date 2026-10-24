package database

import (
	"errors"
	"labassist/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrEditRequestPending is returned when a course already has a request
// waiting for the admin — one at a time keeps the review unambiguous.
var ErrEditRequestPending = errors.New("course already has a pending edit request")

// ErrEditRequestNotPending is returned when approving, rejecting or
// cancelling a request that was already decided or cancelled.
var ErrEditRequestNotPending = errors.New("edit request is no longer pending")

// CreateCourseEditRequest stores a pending request, snapshotting the
// course's current values into the Old* fields.
func CreateCourseEditRequest(r models.CourseEditRequest) (models.CourseEditRequest, error) {
	err := DB.Transaction(func(tx *gorm.DB) error {
		var course models.Course
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, r.CourseID).Error; err != nil {
			return err
		}
		var pending int64
		if err := tx.Model(&models.CourseEditRequest{}).
			Where("course_id = ? AND status = ?", r.CourseID, models.EditRequestPending).
			Count(&pending).Error; err != nil {
			return err
		}
		if pending > 0 {
			return ErrEditRequestPending
		}
		r.OldTitle = course.Title
		r.OldEnglishTitle = course.EnglishTitle
		r.OldCredits = course.Credits
		r.OldSchedule = course.Schedule
		r.Status = models.EditRequestPending
		return tx.Create(&r).Error
	})
	if err != nil {
		return models.CourseEditRequest{}, err
	}
	return r, nil
}

// ListCourseEditRequests returns requests newest first, filtered by
// requester (0 = everyone) and status ("" = any), with display fields set.
func ListCourseEditRequests(requestedBy uint, status string) ([]models.CourseEditRequest, error) {
	q := DB.Order("created_at DESC")
	if requestedBy != 0 {
		q = q.Where("requested_by = ?", requestedBy)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var out []models.CourseEditRequest
	if err := q.Find(&out).Error; err != nil {
		return nil, err
	}
	for i := range out {
		var c models.Course
		if err := DB.Select("code", "section", "semester", "academic_year").First(&c, out[i].CourseID).Error; err == nil {
			out[i].CourseCode, out[i].CourseSection = c.Code, c.Section
			out[i].CourseSemester, out[i].CourseYear = c.Semester, c.AcademicYear
		}
		if u, ok := UserByID(out[i].RequestedBy); ok {
			out[i].RequesterName = u.DisplayName()
		}
	}
	return out, nil
}

// CancelCourseEditRequest withdraws a requester's own pending request.
func CancelCourseEditRequest(id, requestedBy uint) error {
	res := DB.Where("id = ? AND requested_by = ? AND status = ?", id, requestedBy, models.EditRequestPending).
		Delete(&models.CourseEditRequest{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrEditRequestNotPending
	}
	return nil
}

// ReviewCourseEditRequest approves (applying the proposed values to the
// course) or rejects a pending request, in one transaction.
func ReviewCourseEditRequest(id, adminID uint, approve bool, reason string) (models.CourseEditRequest, error) {
	var r models.CourseEditRequest
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&r, id).Error; err != nil {
			return err
		}
		if r.Status != models.EditRequestPending {
			return ErrEditRequestNotPending
		}
		now := time.Now()
		r.ReviewedBy, r.ReviewedAt = &adminID, &now
		if approve {
			r.Status = models.EditRequestApproved
			// Catalog columns only — none of them live on the posting, so
			// the active posting needs no sync.
			updates := map[string]any{
				"title":         r.Title,
				"english_title": r.EnglishTitle,
				"credits":       r.Credits,
				"schedule":      r.Schedule,
			}
			if LabHoursFromCredits(r.Credits) >= 0 {
				updates["has_lab"] = LabHoursFromCredits(r.Credits) > 0
			}
			if err := tx.Model(&models.Course{}).Where("id = ?", r.CourseID).Updates(updates).Error; err != nil {
				return err
			}
		} else {
			r.Status = models.EditRequestRejected
			r.RejectReason = reason
		}
		return tx.Save(&r).Error
	})
	if err != nil {
		return models.CourseEditRequest{}, err
	}
	return r, nil
}
