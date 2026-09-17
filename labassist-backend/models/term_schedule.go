package models

import "time"

// TermScheduleStatus describes whether a student has confirmed their class
// schedule for a given academic term.
type TermScheduleStatus string

const (
	// TermScheduleUnset — no data entered yet; conflict check is unavailable.
	TermScheduleUnset TermScheduleStatus = "unset"
	// TermScheduleSet — student entered and confirmed their busy slots.
	TermScheduleSet TermScheduleStatus = "set"
	// TermScheduleNoClass — student confirmed they have no classes this term.
	TermScheduleNoClass TermScheduleStatus = "no_class"
)

// TermSchedule stores a student's manually-entered busy time slots for one
// academic term. Composite unique on (user_id, semester, academic_year) so
// one student has exactly one row per term, replaced on save.
type TermSchedule struct {
	ID           uint               `gorm:"primaryKey" json:"id"`
	UserID       uint               `gorm:"uniqueIndex:idx_user_term;not null" json:"user_id"`
	Semester     string             `gorm:"uniqueIndex:idx_user_term;size:10;not null" json:"semester"`
	AcademicYear int                `gorm:"uniqueIndex:idx_user_term;not null" json:"academic_year"`
	// Slots holds the weekly time blocks the student is in class.
	Slots  []ScheduleSlot     `gorm:"serializer:json;type:longtext" json:"slots"`
	Status TermScheduleStatus `gorm:"size:20;not null;default:'unset'" json:"status"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (TermSchedule) TableName() string { return "term_schedules" }
