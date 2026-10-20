package database

import (
	"errors"
	"slices"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrTermScheduleSaveLimit is returned when a student has already used all
// MaxTermScheduleSaves saves for a term.
var ErrTermScheduleSaveLimit = errors.New("term schedule save limit reached")

// TermScheduleByUserTerm returns the stored TermSchedule for a student/semester/year.
// When none exists, returns a synthetic "unset" record with ID=0 (never persisted).
func TermScheduleByUserTerm(userID uint, semester string, academicYear int) models.TermSchedule {
	var ts models.TermSchedule
	if DB.Where("user_id = ? AND semester = ? AND academic_year = ?", userID, semester, academicYear).
		First(&ts).Error != nil {
		return models.TermSchedule{
			UserID:       userID,
			Semester:     semester,
			AcademicYear: academicYear,
			Slots:        []models.ScheduleSlot{},
			Status:       models.TermScheduleUnset,
			SaveLimit:    models.MaxTermScheduleSaves,
		}
	}
	ts.SaveLimit = models.MaxTermScheduleSaves
	return ts
}

// HasConfirmedTermSchedule reports whether the student has explicitly saved
// a schedule or confirmed that a term has no classes.
func HasConfirmedTermSchedule(userID uint) (bool, error) {
	var count int64
	err := DB.Model(&models.TermSchedule{}).
		Where("user_id = ? AND status IN ?", userID, []models.TermScheduleStatus{
			models.TermScheduleSet,
			models.TermScheduleNoClass,
		}).Count(&count).Error
	return count > 0, err
}

// UpsertTermSchedule saves or replaces the TermSchedule for one student/term.
// Each save that changes the schedule uses one of MaxTermScheduleSaves; once
// they are used up it returns ErrTermScheduleSaveLimit. Re-saving identical
// data is a no-op and does not count.
func UpsertTermSchedule(userID uint, semester string, academicYear int, slots []models.ScheduleSlot, status models.TermScheduleStatus) (models.TermSchedule, error) {
	var ts models.TermSchedule
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND semester = ? AND academic_year = ?", userID, semester, academicYear).
			FirstOrCreate(&ts, models.TermSchedule{
				UserID:       userID,
				Semester:     semester,
				AcademicYear: academicYear,
			}).Error; err != nil {
			return err
		}
		// Lock the row so concurrent saves cannot both pass the limit check.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ts, ts.ID).Error; err != nil {
			return err
		}
		if ts.Status == status && slices.Equal(ts.Slots, slots) {
			return nil
		}
		if ts.SaveCount >= models.MaxTermScheduleSaves {
			return ErrTermScheduleSaveLimit
		}
		ts.Slots = slots
		ts.Status = status
		ts.SaveCount++
		return tx.Save(&ts).Error
	})
	if err != nil {
		return models.TermSchedule{}, err
	}
	ts.SaveLimit = models.MaxTermScheduleSaves
	return ts, nil
}

// TermOption is a distinct (semester, academic_year) pair from the courses table.
type TermOption struct {
	Semester     string `json:"semester"`
	AcademicYear int    `json:"academic_year"`
}

// DistinctCourseTerms returns all distinct semester/year pairs from courses,
// ordered newest-year-first, then semester ascending.
func DistinctCourseTerms() ([]TermOption, error) {
	var rows []TermOption
	if err := DB.Raw("SELECT DISTINCT semester, academic_year FROM courses ORDER BY academic_year DESC, semester ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
