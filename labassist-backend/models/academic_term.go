package models

import "time"

// AcademicTerm is the open and close date of one semester of an academic
// year, read from the university's academic calendar (admin PDF import).
type AcademicTerm struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	AcademicYear int    `gorm:"not null;uniqueIndex:idx_academic_term" json:"academic_year"` // พ.ศ.
	Semester     string `gorm:"size:10;not null;uniqueIndex:idx_academic_term" json:"semester"`
	// OpenDate / CloseDate are nullable: the calendar may give only one of them.
	OpenDate    *time.Time `gorm:"type:date" json:"open_date"`
	CloseDate   *time.Time `gorm:"type:date" json:"close_date"`
	CreatedByID uint       `gorm:"not null" json:"created_by_id"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
