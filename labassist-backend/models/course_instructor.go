package models

import "time"

type CourseInstructorSource string

const (
	CourseInstructorImported  CourseInstructorSource = "imported"
	CourseInstructorSelfAdded CourseInstructorSource = "self_added"
)

// CourseInstructor is the M:N junction between courses and instructor accounts.
// A row with a non-null archived_at is soft-deleted but kept for audit history.
type CourseInstructor struct {
	ID           uint                   `gorm:"primaryKey" json:"id"`
	CourseID     uint                   `gorm:"not null;uniqueIndex:idx_ci_course_instructor;index" json:"course_id"`
	InstructorID uint                   `gorm:"not null;uniqueIndex:idx_ci_course_instructor;index" json:"instructor_id"`
	Source       CourseInstructorSource `gorm:"type:enum('imported','self_added');not null;default:'imported'" json:"source"`
	CreatedAt    time.Time              `json:"created_at"`
	ArchivedAt   *time.Time             `json:"archived_at,omitempty"`
}

func (CourseInstructor) TableName() string { return "course_instructors" }
