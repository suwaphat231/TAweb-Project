package models

import "time"

// Blacklist is an instructor's warning about a student who worked as their
// Lab Boy (no-show, abandoned work, ...). It never blocks the student from
// applying — every instructor just sees the flag on that student's future
// applications and on the shared blacklist page. Students never see it.
//
// Revoking sets RevokedAt instead of deleting so the history is kept.
type Blacklist struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	StudentID     uint       `gorm:"not null;index" json:"student_id"`
	ApplicationID *uint      `gorm:"index" json:"application_id,omitempty"`
	CourseID      *uint      `json:"course_id,omitempty"`
	ReportedByID  uint       `gorm:"not null" json:"reported_by_id"`
	Reason        string     `gorm:"type:text;not null" json:"reason"`
	CreatedAt     time.Time  `json:"created_at"`
	RevokedAt     *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	RevokedByID   *uint      `json:"revoked_by_id,omitempty"`

	// Display fields filled in by the database layer, not stored.
	StudentName    string `gorm:"-" json:"student_name"`
	StudentCode    string `gorm:"-" json:"student_code"`
	ReportedByName string `gorm:"-" json:"reported_by_name"`
	CourseCode     string `gorm:"-" json:"course_code,omitempty"`
	CourseTitle    string `gorm:"-" json:"course_title,omitempty"`
	CourseSemester string `gorm:"-" json:"course_semester,omitempty"`
	CourseYear     int    `gorm:"-" json:"course_academic_year,omitempty"`
}

func (Blacklist) TableName() string { return "blacklists" }
