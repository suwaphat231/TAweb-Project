package models

import "time"

type AppStatus string
type RoleApplied string

const (
	AppAccepted  AppStatus = "accepted"
	AppRejected  AppStatus = "rejected"
	AppWithdrawn AppStatus = "withdrawn"

	RoleTA     RoleApplied = "ta"
	RoleLabBoy RoleApplied = "labboy"
)

type Application struct {
	ID             uint        `gorm:"primaryKey" json:"id"`
	StudentID      uint        `gorm:"not null" json:"student_id"`
	Student        User        `gorm:"foreignKey:StudentID" json:"-"`
	CourseID       uint        `gorm:"not null" json:"course_id"`
	Course         Course      `gorm:"foreignKey:CourseID" json:"-"`
	RoleApplied    RoleApplied `gorm:"type:role_applied;not null" json:"role_applied"`
	Status         AppStatus   `gorm:"type:app_status;default:'accepted'" json:"status"`
	Motivation     *string     `gorm:"type:text" json:"motivation,omitempty"`
	AppliedAt      time.Time   `gorm:"default:CURRENT_TIMESTAMP" json:"applied_at"`
	ReviewedAt     *time.Time  `json:"reviewed_at,omitempty"`
	ReviewedByID   *uint       `json:"reviewed_by_id,omitempty"`
	ReviewedBy     *User       `gorm:"foreignKey:ReviewedByID" json:"-"`
	Note           *string     `gorm:"type:text" json:"note,omitempty"`

	// Computed fields (not in DB)
	StudentName    string  `gorm:"-" json:"student_name"`
	StudentCode    string  `gorm:"-" json:"student_code"`
	StudentGPA     float64 `gorm:"-" json:"student_gpa"`
	CourseCode     string  `gorm:"-" json:"course_code"`
	CourseTitle    string  `gorm:"-" json:"course_title"`
	ReviewedByName string  `gorm:"-" json:"reviewed_by_name,omitempty"`
}

func (Application) TableName() string { return "applications" }
