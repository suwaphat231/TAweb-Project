package models

import "time"

type OccurrenceStatus string

const (
	OccurrenceScheduled        OccurrenceStatus = "scheduled"
	OccurrenceCancelledHoliday OccurrenceStatus = "cancelled_holiday"
	OccurrenceRescheduled      OccurrenceStatus = "rescheduled"
	OccurrenceCompleted        OccurrenceStatus = "completed"
	OccurrenceAbsent           OccurrenceStatus = "absent"
	OccurrenceCancelledOther   OccurrenceStatus = "cancelled_other"
)

// WorkOccurrence is one individual instance of a Lab Boy work session, derived
// by expanding the weekly schedule over the semester date range. Only
// OccurrenceCompleted occurrences count toward hours and payment calculation.
type WorkOccurrence struct {
	ID              uint             `gorm:"primaryKey" json:"id"`
	StaffCaseID     uint             `gorm:"not null;index" json:"staff_case_id"`
	ScheduleGroupID *uint            `gorm:"index" json:"schedule_group_id,omitempty"`
	ScheduledDate   time.Time        `gorm:"type:date;not null;index" json:"scheduled_date"`
	StartTime       string           `gorm:"size:10;not null" json:"start_time"`
	EndTime         string           `gorm:"size:10;not null" json:"end_time"`
	Status          OccurrenceStatus `gorm:"type:enum('scheduled','cancelled_holiday','rescheduled','completed','absent','cancelled_other');not null;default:'scheduled'" json:"status"`

	// CalendarDateID records which holiday triggered a cancellation.
	CalendarDateID *uint `gorm:"index" json:"calendar_date_id,omitempty"`

	// Reschedule fields — set when Status = 'rescheduled'.
	RescheduledToDate  *time.Time `gorm:"type:date" json:"rescheduled_to_date,omitempty"`
	RescheduledToStart string     `gorm:"size:10" json:"rescheduled_to_start,omitempty"`
	RescheduledToEnd   string     `gorm:"size:10" json:"rescheduled_to_end,omitempty"`

	// RescheduledFromOccurrenceID is set on the new occurrence created after a reschedule.
	RescheduledFromOccurrenceID *uint `gorm:"index" json:"rescheduled_from_occurrence_id,omitempty"`

	Reason string `gorm:"size:500" json:"reason,omitempty"`

	// ActualHours overrides the scheduled hours when non-zero (e.g. early finish).
	// Zero means "use the scheduled hours from the schedule group or staff case".
	ActualHours float64 `gorm:"type:decimal(8,2);default:0" json:"actual_hours,omitempty"`

	UpdatedByID *uint     `json:"updated_by_id,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
	CreatedAt   time.Time `json:"created_at"`
}

func (WorkOccurrence) TableName() string { return "work_occurrences" }
