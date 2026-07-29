package models

import "time"

type UserRole string

const (
	RoleStudent    UserRole = "student"
	RoleInstructor UserRole = "instructor"
	RoleStaff      UserRole = "staff"
	RoleAdmin      UserRole = "admin"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     *string   `gorm:"uniqueIndex;size:100" json:"username"`
	PasswordHash *string   `gorm:"size:255" json:"-"`
	FullName     string    `gorm:"size:200;not null" json:"full_name"`
	Email        string    `gorm:"uniqueIndex;size:200;not null" json:"email"`
	Role         UserRole  `gorm:"type:enum('student','instructor','staff','admin');not null" json:"role"`
	StudentID    *string   `gorm:"type:varchar(20);uniqueIndex" json:"student_id,omitempty"`
	GoogleSub    *string   `gorm:"uniqueIndex;size:100" json:"google_sub,omitempty"`
	GPA          *float64  `gorm:"type:decimal(3,2)" json:"gpa,omitempty"`
	Faculty      *string   `gorm:"size:200" json:"faculty,omitempty"`
	Year         *int8     `json:"year,omitempty"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Transcript OCR result — persisted to DB
	TranscriptGrades     map[string]string `gorm:"type:text;serializer:json" json:"transcript_grades,omitempty"`
	TranscriptStatus     *string           `gorm:"size:50" json:"transcript_status,omitempty"`
	TranscriptMessage    *string           `gorm:"type:text" json:"transcript_message,omitempty"`
	TranscriptConfidence *float64          `gorm:"type:decimal(5,4)" json:"transcript_confidence,omitempty"`
	TranscriptUpdatedAt  *time.Time        `json:"transcript_updated_at,omitempty"`
}

func (User) TableName() string { return "users" }
