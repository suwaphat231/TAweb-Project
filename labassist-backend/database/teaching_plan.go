package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm"
)

// TeachingPlanForCourse returns the class days an instructor saved for a
// course row, date ascending. Empty when none were saved.
func TeachingPlanForCourse(courseID uint) ([]models.TeachingPlanDate, error) {
	var out []models.TeachingPlanDate
	err := DB.Where("course_id = ?", courseID).Order("date ASC, start_time ASC").Find(&out).Error
	return out, err
}

// ReplaceTeachingPlan swaps a course row's saved class days for the given ones.
func ReplaceTeachingPlan(courseID uint, rows []models.TeachingPlanDate) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("course_id = ?", courseID).Delete(&models.TeachingPlanDate{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		now := time.Now()
		for i := range rows {
			rows[i].ID, rows[i].CourseID, rows[i].CreatedAt = 0, courseID, now
		}
		return tx.Create(&rows).Error
	})
}

// ClearTeachingPlan drops a course row's saved class days.
func ClearTeachingPlan(courseID uint) error {
	return DB.Where("course_id = ?", courseID).Delete(&models.TeachingPlanDate{}).Error
}
