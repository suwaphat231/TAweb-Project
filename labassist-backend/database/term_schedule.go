package database

import "labassist/models"

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
		}
	}
	return ts
}

// UpsertTermSchedule saves or replaces the TermSchedule for one student/term.
func UpsertTermSchedule(userID uint, semester string, academicYear int, slots []models.ScheduleSlot, status models.TermScheduleStatus) (models.TermSchedule, error) {
	var ts models.TermSchedule
	if err := DB.Where("user_id = ? AND semester = ? AND academic_year = ?", userID, semester, academicYear).
		FirstOrCreate(&ts, models.TermSchedule{
			UserID:       userID,
			Semester:     semester,
			AcademicYear: academicYear,
		}).Error; err != nil {
		return models.TermSchedule{}, err
	}
	ts.Slots = slots
	ts.Status = status
	if err := DB.Save(&ts).Error; err != nil {
		return models.TermSchedule{}, err
	}
	return ts, nil
}

// TermOption is a distinct (semester, academic_year) pair from the courses table.
type TermOption struct {
	Semester     string `json:"semester"`
	AcademicYear int    `json:"academic_year"`
}

// DistinctCourseTerms returns all distinct semester/year pairs from courses,
// ordered newest-year-first, then semester ascending.
func DistinctCourseTerms() []TermOption {
	var rows []TermOption
	DB.Raw("SELECT DISTINCT semester, academic_year FROM courses ORDER BY academic_year DESC, semester ASC").Scan(&rows)
	return rows
}

// BestTermSchedule returns the student's TermSchedule for the given
// semester/year. If that specific record is missing or unset, it falls back to
// the most-recently-updated "set" record the student has for any term —
// catching the common case where the student entered their schedule under the
// wrong semester label.
//
// "no_class" for the exact term is respected as-is: the student explicitly
// confirmed no classes that semester, so there can be no conflict and we must
// not override that decision with a schedule from another term.
func BestTermSchedule(userID uint, semester string, academicYear int) models.TermSchedule {
	ts := TermScheduleByUserTerm(userID, semester, academicYear)
	if ts.Status == models.TermScheduleSet || ts.Status == models.TermScheduleNoClass {
		return ts
	}
	// Status is "unset" — no confirmed data for this specific term.
	// Fall back to the most-recently-updated "set" record across all terms.
	var fallback models.TermSchedule
	if DB.Where("user_id = ? AND status = ?", userID, models.TermScheduleSet).
		Order("updated_at DESC").First(&fallback).Error == nil {
		return fallback
	}
	return ts
}
