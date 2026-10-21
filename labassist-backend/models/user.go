package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// StringMap stores a map[string]string as a JSON column in MySQL.
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
	ID           uint    `gorm:"primaryKey" json:"id"`
	Username     *string `gorm:"uniqueIndex;size:100" json:"username"`
	PasswordHash *string `gorm:"size:255" json:"-"`
	FullName     string  `gorm:"size:200;not null" json:"full_name"`
	// NamePrefix is the student's Thai title (นาย / นางสาว), required before
	// applying as a Lab Boy. FullName never carries it; use DisplayName to
	// show the two together. Defaults to '' so AutoMigrate can add the column.
	NamePrefix string `gorm:"size:20;not null;default:''" json:"name_prefix"`
	// FullNameEn is the English spelling of the name, set by an admin. It
	// defaults to '' so AutoMigrate can add the column to existing rows.
	FullNameEn string `gorm:"size:200;not null;default:''" json:"full_name_en"`
	AvatarURL  string `gorm:"type:mediumtext" json:"avatar_url,omitempty"`
	// Email has no gorm uniqueIndex tag: admin-created accounts start with a
	// blank email (filled in later via Google sign-in), so uniqueness is
	// enforced instead by a functional index that ignores empty strings — see
	// database/connection.go.
	Email     string   `gorm:"size:200;not null" json:"email"`
	Role      UserRole `gorm:"type:enum('student','instructor','staff','admin');not null" json:"role"`
	StudentID *string  `gorm:"uniqueIndex;size:20" json:"student_id,omitempty"`
	GoogleSub *string  `gorm:"uniqueIndex;size:100" json:"google_sub,omitempty"`
	GPA       *float64 `gorm:"type:decimal(3,2)" json:"gpa,omitempty"`
	Faculty   *string  `gorm:"size:200" json:"faculty,omitempty"`
	Year      *int8    `json:"year,omitempty"`
	// Phone is the student's contact number, digits only.
	Phone     *string   `gorm:"size:20" json:"phone,omitempty"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	TranscriptGrades     StringMap  `gorm:"type:json" json:"transcript_grades,omitempty"`
	TranscriptStatus     *string    `gorm:"size:50" json:"transcript_status,omitempty"`
	TranscriptMessage    *string    `gorm:"type:text" json:"transcript_message,omitempty"`
	TranscriptConfidence *float64   `gorm:"type:decimal(5,4)" json:"transcript_confidence,omitempty"`
	TranscriptUpdatedAt  *time.Time `json:"transcript_updated_at,omitempty"`
	// TranscriptCourseTitles names the courses in TranscriptGrades, keyed by
	// code. Filled in by the endpoints that show the grades, not stored.
	TranscriptCourseTitles map[string]string `gorm:"-" json:"transcript_course_titles,omitempty"`
}

func (User) TableName() string { return "users" }

// Thai name titles a student may choose.
const (
	NamePrefixMr   = "นาย"
	NamePrefixMiss = "นางสาว"
)

// IsValidNamePrefix reports whether p is one of the allowed student titles.
func IsValidNamePrefix(p string) bool {
	return p == NamePrefixMr || p == NamePrefixMiss
}

// DisplayName is the name to show and print: the title, a space, then the
// name ("นาย สมชาย ใจดี"), or just FullName when no title is set.
func (u User) DisplayName() string {
	// A Google sign-up has only the English name until the student enters
	// the Thai one on their profile.
	if u.FullName == "" {
		return u.FullNameEn
	}
	if u.NamePrefix == "" {
		return u.FullName
	}
	return u.NamePrefix + " " + u.FullName
}

// MarshalJSON adds has_password so the client can offer "create password"
// instead of "change password" without ever seeing the hash, and
// display_name so every page shows the same titled name.
func (u User) MarshalJSON() ([]byte, error) {
	type plain User
	return json.Marshal(struct {
		plain
		HasPassword bool   `json:"has_password"`
		DisplayName string `json:"display_name"`
	}{plain(u), u.PasswordHash != nil && *u.PasswordHash != "", u.DisplayName()})
}
