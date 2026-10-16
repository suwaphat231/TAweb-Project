package database

import (
	"errors"
	"strings"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// --- Courses (MySQL-backed via DB, see database/connection.go) ---

func ListCourses(status, q string, hasLab *bool) ([]models.Course, error) {
	query := DB.Order("id DESC")
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	if q != "" {
		s := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(code) LIKE ? OR LOWER(title) LIKE ?", s, s)
	}
	var rows []models.Course
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		enriched := courseWithInstructor(c)
		if status != "" && string(enriched.Status) != status {
			continue
		}
		out = append(out, enriched)
	}
	return out, nil
}

func CourseByID(id uint) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// InstructorCourses returns courses the instructor owns via the M:N table.
func InstructorCourses(instructorID uint, fullName string, isAdmin bool, hasLab *bool) ([]models.Course, error) {
	query := DB.Table("courses").Order("courses.id DESC")
	if !isAdmin {
		query = query.Joins(
			"JOIN course_instructors ci ON ci.course_id = courses.id AND ci.instructor_id = ? AND ci.archived_at IS NULL",
			instructorID,
		)
	}
	if hasLab != nil {
		query = query.Where("courses.has_lab = ?", *hasLab)
	}
	var rows []models.Course
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		out = append(out, courseWithInstructor(c))
	}
	return out, nil
}

func CreateCourse(c models.Course) models.Course {
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Create(&c).Error; err != nil {
			return err
		}
		// The course's own instructor (matched from the import file, or the
		// instructor creating it) owns it — an imported link is what
		// InstructorOwnsCourse checks. self_added is only for courses an
		// instructor links themselves to via AddCourseRelation.
		if c.InstructorID != nil && *c.InstructorID != 0 {
			ci := models.CourseInstructor{
				CourseID:     c.ID,
				InstructorID: *c.InstructorID,
				Source:       models.CourseInstructorImported,
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ci).Error; err != nil {
				return err
			}
		}
		return syncPostingTx(tx, c)
	}); err != nil {
		return models.Course{}
	}
	return courseWithInstructor(c)
}

func UpdateCourse(id uint, fn func(c *models.Course)) (models.Course, bool) {
	var c models.Course
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; err != nil {
			return err
		}
		var p models.Posting
		if err := tx.Where("course_id = ? AND is_active = true", id).First(&p).Error; err != nil {
			return err
		}
		applyPostingToCourse(p, &c)
		fn(&c)
		if err := tx.Omit(clause.Associations).Save(&c).Error; err != nil {
			return err
		}
		return syncPostingTx(tx, c)
	}); err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// --- Recruitment posting persistence ---

// postingFromCourse builds a Posting value from a course's recruitment fields.
func postingFromCourse(c models.Course) models.Posting {
	return models.Posting{
		CourseID:                c.ID,
		IsActive:                true,
		LabBoySlots:             c.LabBoySlots,
		LabBoyAccepted:          c.LabBoyAccepted,
		Status:                  c.Status,
		Deadline:                c.Deadline,
		Description:             c.Description,
		Requirements:            c.Requirements,
		RequireGradeProof:       c.RequireGradeProof,
		ClosedByInstructor:      c.ClosedByInstructor,
		LabBoyScheduleConfirmed: c.LabBoyScheduleConfirmed,
	}
}

// syncPostingTx creates or updates the active posting for the course inside
// the given DB handle (which may be a transaction). LabBoyAccepted is
// intentionally omitted — ReviewApplicationTx adjusts that counter atomically.
func syncPostingTx(tx *gorm.DB, c models.Course) error {
	p := postingFromCourse(c)
	var existing models.Posting
	err := tx.Where("course_id = ? AND is_active = true", c.ID).First(&existing).Error
	if err == nil {
		return tx.Model(&existing).
			Select("LabBoySlots", "Status", "Deadline", "Description", "Requirements", "RequireGradeProof", "ClosedByInstructor", "LabBoyScheduleConfirmed").
			Updates(p).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return tx.Create(&p).Error
}

// ActivePostingForCourse returns the current recruitment round for a course.
func ActivePostingForCourse(courseID uint) (models.Posting, bool) {
	var p models.Posting
	err := DB.Where("course_id = ? AND is_active = true", courseID).First(&p).Error
	return p, err == nil
}

// deleteEmptyCourseTx rejects deletion of any course with submitted records.
func deleteEmptyCourseTx(tx *gorm.DB, id uint) error {
	var course models.Course
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, id).Error; err != nil {
		return err
	}
	// Preserve every submitted application, review and issued document.
	for _, table := range []string{"applications", "application_history", "form_reviews", "staff_documents"} {
		var n int64
		if err := tx.Table(table).Where("course_id = ? OR posting_id IN (SELECT id FROM postings WHERE course_id = ?)", id, id).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrConflict
		}
	}
	if err := tx.Model(&models.Notification{}).Where("course_id = ?", id).Update("course_id", nil).Error; err != nil {
		return err
	}
	if err := tx.Where("course_id = ?", id).Delete(&models.Posting{}).Error; err != nil {
		return err
	}
	return tx.Delete(&course).Error
}

func DeleteCourse(id uint) bool {
	return DB.Transaction(func(tx *gorm.DB) error { return deleteEmptyCourseTx(tx, id) }) == nil
}

// ResetCourseToDraft is what an instructor's "ลบประกาศ" actually does:
// archive the current active posting (preserving all application history,
// form reviews, and staff documents that reference it) and open a blank draft
// posting for the next recruitment round. The course catalog row — code,
// title, section, schedule, instructor — is untouched. No applications are
// deleted; they remain linked to the now-archived posting.
func ResetCourseToDraft(id uint) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; err != nil {
			return err
		}
		// Archive the current round — mark it inactive so history is preserved.
		if err := tx.Model(&models.Posting{}).
			Where("course_id = ? AND is_active = true", id).
			Update("is_active", false).Error; err != nil {
			return err
		}
		// Open a fresh draft posting for the new round.
		return tx.Create(&models.Posting{
			CourseID: id,
			IsActive: true,
			Status:   models.StatusDraft,
		}).Error
	}); err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// CourseExists reports whether a teaching slot (code + section + semester +
// academic_year) is already occupied. The instructor is not part of the key:
// the same section cannot exist twice regardless of who teaches it.
func CourseExists(code, semester string, academicYear, section int) bool {
	_, ok := FindCourseByKey(code, semester, academicYear, section)
	return ok
}

// FindCourseByKey returns the existing course occupying the same slot
// (code + section + semester + academic year), regardless of instructor.
func FindCourseByKey(code, semester string, academicYear, section int) (models.Course, bool) {
	var c models.Course
	err := DB.Where("code = ? AND semester = ? AND academic_year = ? AND section = ?",
		code, semester, academicYear, section).First(&c).Error
	return c, err == nil
}

// FindCourseSlot returns the course for one meeting time (slot) of a section.
func FindCourseSlot(code, semester string, academicYear, section, slot int) (models.Course, bool) {
	var c models.Course
	err := DB.Where("code = ? AND semester = ? AND academic_year = ? AND section = ? AND slot = ?",
		code, semester, academicYear, section, slot).First(&c).Error
	return c, err == nil
}

// DeleteCoursesByTerm only deletes empty catalog entries; historical data stays.
func DeleteCoursesByTerm(semester string, academicYear int) int {
	deleted := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var ids []uint
		if err := tx.Model(&models.Course{}).Where("semester = ? AND academic_year = ?", semester, academicYear).Order("id").Pluck("id", &ids).Error; err != nil {
			return err
		}
		for _, id := range ids {
			if err := deleteEmptyCourseTx(tx, id); err != nil {
				if errors.Is(err, ErrConflict) {
					continue
				}
				return err
			}
			deleted++
		}
		return nil
	})
	if err != nil {
		return 0
	}
	return deleted
}

func CountCourses() (int64, error) {
	var n int64
	err := DB.Model(&models.Course{}).Count(&n).Error
	return n, err
}

func CountOpenCourses() (int64, error) {
	var n int64
	err := DB.Model(&models.Posting{}).
		Where("status IN ? AND is_active = true", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Count(&n).Error
	return n, err
}

func RecentOpenCourses(limit int) ([]models.Course, error) {
	var postings []models.Posting
	if err := DB.Where("status IN ? AND is_active = true", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Order("id DESC").Limit(limit).Find(&postings).Error; err != nil {
		return nil, err
	}
	out := make([]models.Course, 0, len(postings))
	for _, p := range postings {
		if c, ok := CourseByID(p.CourseID); ok {
			out = append(out, c)
		}
	}
	return out, nil
}
