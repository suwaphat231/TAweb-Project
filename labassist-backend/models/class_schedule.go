package models

import "time"

// ScheduleSlot is one occupied time block on a student's class timetable.
type ScheduleSlot struct {
	Day       string `json:"day"`        // MON TUE WED THU FRI SAT SUN
	StartTime string `json:"start_time"` // HH:MM (24-hour)
	EndTime   string `json:"end_time"`   // HH:MM (24-hour)
}

// ClassSchedule stores the uploaded timetable image and its OCR-extracted slots
// for one student. UserID is unique so uploading again replaces the previous row.
type ClassSchedule struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"uniqueIndex;not null" json:"user_id"`
	FileName  string         `gorm:"size:255" json:"file_name"`
	ImageData []byte         `gorm:"type:longblob" json:"-"`
	Slots     []ScheduleSlot `gorm:"serializer:json;type:longtext" json:"slots"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

func (ClassSchedule) TableName() string { return "class_schedules" }
