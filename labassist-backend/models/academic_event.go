package models

import "time"

// Academic event categories.
const (
	EventRegistration = "registration" // ลงทะเบียน / เพิ่ม-ถอน
	EventExam         = "exam"         // สอบ
	EventDeadline     = "deadline"     // วันสุดท้ายของ… / กำหนดส่ง
	EventOther        = "other"
)

// AcademicEvent is an activity from the academic calendar (registration, exams,
// deadlines, …). It is shown on the admin calendar only: unlike CalendarDate it
// never cancels work days.
type AcademicEvent struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	AcademicYear int       `gorm:"not null;index:idx_academic_event_year" json:"academic_year"` // พ.ศ.
	Semester     string    `gorm:"size:10;not null" json:"semester"`
	StartDate    time.Time `gorm:"type:date;not null;index" json:"start_date"`
	EndDate      time.Time `gorm:"type:date;not null" json:"end_date"`
	Name         string    `gorm:"size:200;not null" json:"name"`
	Category     string    `gorm:"size:20;not null" json:"category"`
	CreatedByID  uint      `gorm:"not null" json:"created_by_id"`
	CreatedAt    time.Time `json:"created_at"`
}
