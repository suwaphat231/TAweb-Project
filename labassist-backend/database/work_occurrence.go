package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GenerateWorkOccurrences expands a weekly schedule into individual WorkOccurrence
// rows between startDate and endDate (inclusive). Existing scheduled/cancelled
// rows for the case are replaced (completed/absent rows are preserved). The
// cancelledDates map keys are "YYYY-MM-DD" and values are CalendarDate IDs.
func GenerateWorkOccurrences(
	staffCaseID uint,
	weekDay, startTime, endTime string,
	startDate, endDate time.Time,
	cancelledDates map[string]uint,
) ([]models.WorkOccurrence, error) {
	var out []models.WorkOccurrence

	err := DB.Transaction(func(tx *gorm.DB) error {
		// Delete only replaceable statuses — preserve historical completed/absent records.
		tx.Where("staff_case_id = ? AND status IN ?", staffCaseID,
			[]models.OccurrenceStatus{
				models.OccurrenceScheduled,
				models.OccurrenceCancelledHoliday,
			},
		).Delete(&models.WorkOccurrence{})

		thaiDayToWeekday := map[string]time.Weekday{
			"อาทิตย์": time.Sunday,
			"จันทร์":   time.Monday,
			"อังคาร":   time.Tuesday,
			"พุธ":      time.Wednesday,
			"พฤหัสบดี": time.Thursday,
			"ศุกร์":    time.Friday,
			"เสาร์":    time.Saturday,
		}
		target, ok := thaiDayToWeekday[weekDay]
		if !ok {
			return nil
		}

		current := startDate
		for !current.After(endDate) {
			if current.Weekday() == target {
				dateStr := current.Format("2006-01-02")
				occ := models.WorkOccurrence{
					StaffCaseID:   staffCaseID,
					ScheduledDate: current,
					StartTime:     startTime,
					EndTime:       endTime,
					Status:        models.OccurrenceScheduled,
				}
				if calID, cancelled := cancelledDates[dateStr]; cancelled {
					occ.Status = models.OccurrenceCancelledHoliday
					occ.CalendarDateID = &calID
				}
				if err := tx.Create(&occ).Error; err != nil {
					return err
				}
				out = append(out, occ)
			}
			current = current.AddDate(0, 0, 1)
		}
		return nil
	})
	return out, err
}

// WorkOccurrencesForCase returns every occurrence for a staff case, ordered by date.
func WorkOccurrencesForCase(staffCaseID uint) []models.WorkOccurrence {
	var out []models.WorkOccurrence
	DB.Where("staff_case_id = ?", staffCaseID).Order("scheduled_date ASC").Find(&out)
	return out
}

// WorkOccurrencesForMonth returns occurrences in a given Gregorian year/month.
func WorkOccurrencesForMonth(staffCaseID uint, year, month int) []models.WorkOccurrence {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, -1)
	var out []models.WorkOccurrence
	DB.Where("staff_case_id = ? AND scheduled_date >= ? AND scheduled_date <= ?",
		staffCaseID, start.Format("2006-01-02"), end.Format("2006-01-02")).
		Order("scheduled_date ASC").Find(&out)
	return out
}

// UpdateOccurrenceStatus changes the status of one work occurrence with row locking.
func UpdateOccurrenceStatus(id uint, status models.OccurrenceStatus, reason string, updatedByID uint) (models.WorkOccurrence, bool) {
	var occ models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&occ, id).Error; err != nil {
			return err
		}
		occ.Status = status
		occ.Reason = reason
		occ.UpdatedByID = &updatedByID
		occ.UpdatedAt = time.Now()
		return tx.Save(&occ).Error
	})
	if err != nil {
		return models.WorkOccurrence{}, false
	}
	return occ, true
}

// RescheduleOccurrence marks an occurrence as rescheduled and creates the
// replacement occurrence on the new date. Returns (original, new, error).
func RescheduleOccurrence(id uint, newDate time.Time, newStart, newEnd, reason string, updatedByID uint) (models.WorkOccurrence, models.WorkOccurrence, error) {
	var original, newOcc models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&original, id).Error; err != nil {
			return err
		}
		original.Status = models.OccurrenceRescheduled
		original.RescheduledToDate = &newDate
		original.RescheduledToStart = newStart
		original.RescheduledToEnd = newEnd
		original.Reason = reason
		original.UpdatedByID = &updatedByID
		original.UpdatedAt = time.Now()
		if err := tx.Save(&original).Error; err != nil {
			return err
		}
		newOcc = models.WorkOccurrence{
			StaffCaseID:                 original.StaffCaseID,
			ScheduleGroupID:             original.ScheduleGroupID,
			ScheduledDate:               newDate,
			StartTime:                   newStart,
			EndTime:                     newEnd,
			Status:                      models.OccurrenceScheduled,
			RescheduledFromOccurrenceID: &original.ID,
			Reason:                      reason,
		}
		return tx.Create(&newOcc).Error
	})
	return original, newOcc, err
}
