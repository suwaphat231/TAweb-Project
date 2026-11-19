package models

import "time"

// TeachingPlanDate is one class day an instructor kept (or added) when
// opening a posting. A course row with any of these uses them in place of the
// days worked out from its weekly schedule and the academic calendar.
type TeachingPlanDate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CourseID  uint      `gorm:"not null;index:idx_teaching_plan_course" json:"course_id"`
	Date      time.Time `gorm:"type:date;not null" json:"date"`
	StartTime string    `gorm:"size:5;not null" json:"start_time"` // HH:MM
	EndTime   string    `gorm:"size:5;not null" json:"end_time"`   // HH:MM
	CreatedAt time.Time `json:"created_at"`
}

func (TeachingPlanDate) TableName() string { return "teaching_plan_dates" }
