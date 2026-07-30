package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// StringMap stores a map[string]string as a JSONB column in Postgres.
type StringMap map[string]string

func (m StringMap) Value() (driver.Value, error) {
	if m == nil {
		return nil, nil
	}
	b, err := json.Marshal(m)
	return string(b), err
}

func (m *StringMap) Scan(src any) error {
	if src == nil {
		*m = nil
		return nil
	}
	var b []byte
	switch v := src.(type) {
	case string:
		b = []byte(v)
	case []byte:
		b = v
	default:
		return fmt.Errorf("StringMap: unsupported type %T", src)
	}
	return json.Unmarshal(b, m)
}

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
	// Email has no gorm uniqueIndex tag: admin-created accounts start with a
	// blank email (filled in later via Google sign-in), so uniqueness is
	// enforced instead by a partial index that ignores empty strings — see
	// database/connection.go.
	Email string `gorm:"size:200;not null" json:"email"`
	Role         UserRole  `gorm:"type:user_role;not null" json:"role"`
	StudentID    *string   `gorm:"uniqueIndex;size:20" json:"student_id,omitempty"`
	GoogleSub    *string   `gorm:"uniqueIndex;size:100" json:"google_sub,omitempty"`
	GPA          *float64  `gorm:"type:decimal(3,2)" json:"gpa,omitempty"`
	Faculty      *string   `gorm:"size:200" json:"faculty,omitempty"`
	Year         *int8     `json:"year,omitempty"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	TranscriptGrades     StringMap  `gorm:"type:jsonb" json:"transcript_grades,omitempty"`
	TranscriptStatus     *string    `gorm:"size:50" json:"transcript_status,omitempty"`
	TranscriptMessage    *string    `gorm:"type:text" json:"transcript_message,omitempty"`
	TranscriptConfidence *float64   `gorm:"type:decimal(5,4)" json:"transcript_confidence,omitempty"`
	TranscriptUpdatedAt  *time.Time `json:"transcript_updated_at,omitempty"`
}

func (User) TableName() string { return "users" }
