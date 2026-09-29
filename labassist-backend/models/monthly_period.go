package models

import "time"

type MonthlyPeriodStatus string

const (
	PeriodOpen   MonthlyPeriodStatus = "open"
	PeriodClosed MonthlyPeriodStatus = "closed"
)

// MonthlyPeriod represents one calendar month of work within a StaffCase.
// Documents and payment requests are grouped by period. A period must be
// explicitly opened before staff can confirm occurrences for that month, and
// closed before the next period can be finalised. Closing is irreversible
// without re-opening via a new period record.
type MonthlyPeriod struct {
	ID          uint                `gorm:"primaryKey" json:"id"`
	StaffCaseID uint                `gorm:"not null;index;uniqueIndex:idx_monthly_period_case_month" json:"staff_case_id"`
	Month       int                 `gorm:"not null;uniqueIndex:idx_monthly_period_case_month" json:"month"`
	Year        int                 `gorm:"not null;uniqueIndex:idx_monthly_period_case_month" json:"year"`
	Status      MonthlyPeriodStatus `gorm:"type:enum('open','closed');not null;default:'open'" json:"status"`
	ClosedAt    *time.Time          `json:"closed_at,omitempty"`
	ClosedByID  *uint               `json:"closed_by_id,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

func (MonthlyPeriod) TableName() string { return "monthly_periods" }
