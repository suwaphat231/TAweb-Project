package database

import (
	"time"

	"labassist/models"
)

// CreateCalendarDate persists a new calendar date exception.
func CreateCalendarDate(cd models.CalendarDate) (models.CalendarDate, error) {
	cd.ID = 0
	if err := DB.Create(&cd).Error; err != nil {
		return models.CalendarDate{}, err
	}
	return cd, nil
}

// CalendarDateByID returns a single calendar date by primary key.
func CalendarDateByID(id uint) (models.CalendarDate, bool) {
	var cd models.CalendarDate
	if DB.First(&cd, id).Error != nil {
		return models.CalendarDate{}, false
	}
	return cd, true
}

// ListCalendarDates returns dates applicable to a staff case: global dates,
// semester-scoped dates matching the case's semester/year, and case-specific dates.
// Optionally filtered by a Gregorian date range.
func ListCalendarDates(staffCaseID uint, semester string, academicYear int, from, to *time.Time) []models.CalendarDate {
	q := DB.Where(
		"(scope = 'global') OR (scope = 'semester' AND semester = ? AND academic_year = ?) OR (scope = 'case' AND staff_case_id = ?)",
		semester, academicYear, staffCaseID,
	).Order("date ASC")
	if from != nil {
		q = q.Where("date >= ?", from.Format("2006-01-02"))
	}
	if to != nil {
		q = q.Where("date <= ?", to.Format("2006-01-02"))
	}
	var out []models.CalendarDate
	q.Find(&out)
	return out
}

// UpdateCalendarDate applies fn to a calendar date and saves the result.
func UpdateCalendarDate(id uint, fn func(*models.CalendarDate)) (models.CalendarDate, bool) {
	var cd models.CalendarDate
	if DB.First(&cd, id).Error != nil {
		return models.CalendarDate{}, false
	}
	fn(&cd)
	cd.UpdatedAt = time.Now()
	if DB.Save(&cd).Error != nil {
		return models.CalendarDate{}, false
	}
	return cd, true
}

// DeleteCalendarDate hard-deletes a calendar date entry.
func DeleteCalendarDate(id uint) bool {
	return DB.Delete(&models.CalendarDate{}, id).Error == nil
}
