package models

import "time"

// ScheduleGroupMonth records one calendar month during which the schedule
// group is active. The combination (schedule_group_id, year, month) is unique.
// MonthStartDate/MonthEndDate override the month boundaries for partial months.
type ScheduleGroupMonth struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	ScheduleGroupID uint       `gorm:"not null;uniqueIndex:idx_sgm_group_ym" json:"schedule_group_id"`
	Year            int        `gorm:"not null;uniqueIndex:idx_sgm_group_ym" json:"year"` // CE year
	Month           int        `gorm:"not null;uniqueIndex:idx_sgm_group_ym" json:"month"` // 1–12
	// MonthStartDate overrides the first day of the month when staff start mid-month.
	MonthStartDate *time.Time `gorm:"type:date" json:"month_start_date,omitempty"`
	// MonthEndDate overrides the last day of the month when staff end mid-month.
	MonthEndDate *time.Time `gorm:"type:date" json:"month_end_date,omitempty"`
	// IsManual is true when the occurrences for this month were set by staff
	// picking exact dates rather than auto-generated from the weekly pattern.
	IsManual  bool      `gorm:"not null;default:false" json:"is_manual"`
	CreatedAt time.Time `json:"created_at"`
}

func (ScheduleGroupMonth) TableName() string { return "schedule_group_months" }

// GroupWeekDaySlot is one day-time working slot within a ScheduleGroup.
// Multiple slots are serialised as a JSON array in ScheduleGroup.WeekDaysJSON.
type GroupWeekDaySlot struct {
	Day       string `json:"day"`        // MON TUE WED THU FRI SAT SUN
	StartTime string `json:"start_time"` // HH:MM
	EndTime   string `json:"end_time"`   // HH:MM
}

// MonthOccurrenceSummary aggregates counters for one calendar month inside a
// schedule group. It is computed on the fly from WorkOccurrence rows — never
// persisted — and returned by the summary endpoint.
type MonthOccurrenceSummary struct {
	Year             int     `json:"year"`
	Month            int     `json:"month"`
	Total            int     `json:"total"`
	CancelledHoliday int     `json:"cancelled_holiday"`
	CancelledOther   int     `json:"cancelled_other"`
	Rescheduled      int     `json:"rescheduled"`
	Valid            int     `json:"valid"`
	ValidMinutes     int64   `json:"valid_minutes"`
	ValidHours       float64 `json:"valid_hours"`
	LabBoyCount      int     `json:"lab_boy_count"`
	RatePerHourBaht  float64 `json:"rate_per_hour_baht"`
	PayPerPersonBaht float64 `json:"pay_per_person_baht"`
	TotalPayBaht     float64 `json:"total_pay_baht"`
}
