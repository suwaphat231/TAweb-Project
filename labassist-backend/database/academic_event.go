package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm"
)

// ListAcademicEventsForYears returns the saved academic events of the given
// academic years (พ.ศ.), earliest first.
func ListAcademicEventsForYears(years []int) ([]models.AcademicEvent, error) {
	var out []models.AcademicEvent
	err := DB.Where("academic_year IN ?", years).Order("start_date ASC, id ASC").Find(&out).Error
	return out, err
}

// CountAcademicEvents is how many events are saved for an academic year.
func CountAcademicEvents(academicYear int) (int, error) {
	var n int64
	err := DB.Model(&models.AcademicEvent{}).Where("academic_year = ?", academicYear).Count(&n).Error
	return int(n), err
}

// ReplaceAcademicEvents swaps every event saved for the academic year for the
// given ones, in one transaction, so importing the calendar again corrects it
// instead of duplicating it.
func ReplaceAcademicEvents(academicYear int, events []models.AcademicEvent) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("academic_year = ?", academicYear).Delete(&models.AcademicEvent{}).Error; err != nil {
			return err
		}
		if len(events) == 0 {
			return nil
		}
		now := time.Now()
		for i := range events {
			events[i].ID, events[i].CreatedAt = 0, now
		}
		return tx.Create(&events).Error
	})
}
