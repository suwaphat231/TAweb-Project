package models

import "time"

// Posting represents one recruitment round for a course. A course can have at
// most one active posting at a time; old rounds are archived (IsActive=false)
// so their applications, form reviews, and staff documents are preserved.
//
// Legacy course recruitment columns are retained only for migration.
type Posting struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	CourseID uint `gorm:"not null;index" json:"course_id"`
	// IsActive distinguishes the current recruitment round from archived ones.
	// At most one posting per course has IsActive=true.
	IsActive bool `gorm:"not null;default:true;index" json:"is_active"`

	LabBoySlots             int          `gorm:"default:0" json:"labboy_slots"`
	LabBoyAccepted          int          `gorm:"default:0" json:"labboy_accepted"`
	Status                  CourseStatus `gorm:"type:enum('open','closing_soon','closed','draft','archived');default:'draft'" json:"status"`
	Deadline                *time.Time   `json:"deadline,omitempty"`
	Description             *string      `gorm:"type:text" json:"description,omitempty"`
	Requirements            *string      `gorm:"type:text" json:"requirements,omitempty"`
	RequireGradeProof       bool         `gorm:"default:false" json:"require_grade_proof"`
	ClosedByInstructor      bool         `gorm:"default:false" json:"closed_by_instructor"`
	LabBoyScheduleConfirmed bool         `gorm:"default:false" json:"labboy_schedule_confirmed"`
	// LabBoyRosterConfirmedAt is set when the instructor confirms the accepted
	// Lab Boys as final. Staff see the course only after this, and the
	// accepted roster can no longer be changed by accepting or cancelling.
	LabBoyRosterConfirmedAt *time.Time `json:"labboy_roster_confirmed_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Posting) TableName() string { return "postings" }
