package models

import "time"

type StaffCaseStatus string

const (
	StaffCaseOpen       StaffCaseStatus = "open"
	StaffCasePlanLocked StaffCaseStatus = "plan_locked"
	StaffCaseDone       StaffCaseStatus = "done"
)

// StaffCase represents the staff-side workflow for one course offering's Lab Boy
// hiring and payment cycle. There is exactly one StaffCase per Posting (enforced
// by the unique index on posting_id).
type StaffCase struct {
	ID           uint            `gorm:"primaryKey" json:"id"`
	PostingID    uint            `gorm:"not null;uniqueIndex;index" json:"posting_id"`
	CourseID     uint            `gorm:"not null;index" json:"course_id"`
	Semester     string          `gorm:"size:10;not null" json:"semester"`
	AcademicYear int             `gorm:"not null" json:"academic_year"`
	Status       StaffCaseStatus `gorm:"type:enum('open','plan_locked','done');not null;default:'open'" json:"status"`
	LabBoyCount  int             `gorm:"default:0" json:"labboy_count"`
	// HoursPerSession is hours per work session (can be overridden per schedule group).
	HoursPerSession float64 `gorm:"type:decimal(8,2);default:0" json:"hours_per_session"`
	// RatePerHour is stored in satang (1 baht = 100 satang) to avoid floating-point errors.
	RatePerHour int64 `gorm:"not null;default:0" json:"rate_per_hour_satang"`

	WorkStartDate *time.Time `json:"work_start_date,omitempty"`
	WorkEndDate   *time.Time `json:"work_end_date,omitempty"`

	ConfirmedByInstructorAt *time.Time `json:"confirmed_by_instructor_at,omitempty"`
	ConfirmedByInstructorID *uint      `json:"confirmed_by_instructor_id,omitempty"`

	PlanLockedAt   *time.Time `json:"plan_locked_at,omitempty"`
	PlanLockedByID *uint      `json:"plan_locked_by_id,omitempty"`

	CreatedByID uint      `gorm:"not null" json:"created_by_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (StaffCase) TableName() string { return "staff_cases" }

// ScheduleGroup holds the weekly schedule for a group of Lab Boys who work at
// the same time. A single StaffCase may have multiple schedule groups when Lab Boys
// are assigned to different days or time slots.
type ScheduleGroup struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	StaffCaseID     uint      `gorm:"not null;index" json:"staff_case_id"`
	WeekDay         string    `gorm:"size:20;not null" json:"week_day"`
	StartTime       string    `gorm:"size:10;not null" json:"start_time"`
	EndTime         string    `gorm:"size:10;not null" json:"end_time"`
	HoursPerSession float64   `gorm:"type:decimal(8,2);default:0" json:"hours_per_session"`
	Note            string    `gorm:"size:500" json:"note,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

func (ScheduleGroup) TableName() string { return "staff_case_schedule_groups" }
