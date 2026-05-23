package models

import "time"

type CourseStatus string

const (
	StatusOpen        CourseStatus = "open"
	StatusClosingSoon CourseStatus = "closing_soon"
	StatusClosed      CourseStatus = "closed"
	StatusDraft       CourseStatus = "draft"
)

type Course struct {
	ID             uint         `gorm:"primaryKey" json:"id"`
	Code           string       `gorm:"size:20;not null" json:"code"`
	Title          string       `gorm:"size:300;not null" json:"title"`
	InstructorID   uint         `gorm:"not null" json:"instructor_id"`
	Instructor     User         `gorm:"foreignKey:InstructorID" json:"-"`
	InstructorName string       `gorm:"-" json:"instructor_name"`
	Semester       string       `gorm:"size:10;not null" json:"semester"`
	AcademicYear   int          `gorm:"not null" json:"academic_year"`
	TASlots        int          `gorm:"default:0" json:"ta_slots"`
	LabBoySlots    int          `gorm:"default:0" json:"labboy_slots"`
	TAAccepted     int          `gorm:"default:0" json:"ta_accepted"`
	LabBoyAccepted int          `gorm:"default:0" json:"labboy_accepted"`
	Status         CourseStatus `gorm:"type:enum('open','closing_soon','closed','draft');default:'draft'" json:"status"`
	Deadline       *time.Time   `json:"deadline,omitempty"`
	Description    *string      `gorm:"type:text" json:"description,omitempty"`
	Requirements   *string      `gorm:"type:text" json:"requirements,omitempty"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

func (Course) TableName() string { return "courses" }
