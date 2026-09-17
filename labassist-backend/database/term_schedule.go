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
