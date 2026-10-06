package models

import "time"

type CalendarDateType string
type CalendarDateScope string

const (
	DateTypePublicHoliday     CalendarDateType = "public_holiday"
	DateTypeUniversityHoliday CalendarDateType = "university_holiday"
	DateTypeNoClass           CalendarDateType = "no_class"
	DateTypeCaseException     CalendarDateType = "case_exception"
	DateTypeMakeup            CalendarDateType = "makeup"

	DateScopeGlobal   CalendarDateScope = "global"
	DateScopeSemester CalendarDateScope = "semester"
	DateScopeCase     CalendarDateScope = "case"
)

// CalendarDate records a date that affects the work schedule — a holiday, a
// no-class day, a makeup session, or any other exception. The Scope field
// controls which staff cases it applies to.
type CalendarDate struct {
	ID       uint              `gorm:"primaryKey" json:"id"`
	Date     time.Time         `gorm:"type:date;not null;index" json:"date"`
	Name     string            `gorm:"size:200;not null" json:"name"`
	DateType CalendarDateType  `gorm:"type:enum('public_holiday','university_holiday','no_class','case_exception','makeup');not null" json:"date_type"`
	Scope    CalendarDateScope `gorm:"type:enum('global','semester','case');not null;default:'global'" json:"scope"`

	// Semester and AcademicYear are used when Scope = 'semester'.
	Semester     string `gorm:"size:10" json:"semester,omitempty"`
	AcademicYear int    `json:"academic_year,omitempty"`

	// StaffCaseID is set when Scope = 'case'.
	StaffCaseID *uint `gorm:"index" json:"staff_case_id,omitempty"`

	// AffectsWork = true means this date cancels a scheduled work occurrence.
	// Pointer so GORM can distinguish explicit false from zero-value (default true).
	AffectsWork *bool `gorm:"not null;default:true" json:"affects_work"`

	// OriginalDateID links a makeup CalendarDate back to the holiday it compensates for.
	OriginalDateID *uint `gorm:"index" json:"original_date_id,omitempty"`

	CreatedByID uint      `gorm:"not null" json:"created_by_id"`
	EditReason  string    `gorm:"size:500" json:"edit_reason,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (CalendarDate) TableName() string { return "calendar_dates" }
