package models

import "time"

// Outcomes of one holiday sync run for one year.
const (
	HolidaySyncSuccess = "success" // data fetched and saved
	HolidaySyncNoData  = "no_data" // source has no file / no holidays for the year yet
	HolidaySyncFailed  = "failed"  // fetch or validation failed; stored data untouched
)

// HolidaySyncRun records one sync attempt for one calendar year (ค.ศ.), so
// staff can see when the data was last refreshed and why a run failed.
type HolidaySyncRun struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	Year          int    `gorm:"not null;index" json:"year"` // ค.ศ.
	Status        string `gorm:"size:20;not null" json:"status"`
	Trigger       string `gorm:"size:20;not null" json:"trigger"` // scheduled | manual
	TriggeredByID *uint  `json:"triggered_by_id,omitempty"`
	Message       string `gorm:"size:500" json:"message,omitempty"`

	Total          int `json:"total"`           // holidays in the source file
	Created        int `json:"created"`         // new rows
	Updated        int `json:"updated"`         // rows whose name/type changed
	Unchanged      int `json:"unchanged"`       // rows already up to date
	SkippedManual  int `json:"skipped_manual"`  // already added by staff
	SkippedDeleted int `json:"skipped_deleted"` // staff deleted an imported row
	Missing        int `json:"missing"`         // imported earlier, no longer in the source (kept)

	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
}

func (HolidaySyncRun) TableName() string { return "holiday_sync_runs" }

// CalendarDateExclusion remembers an imported holiday that staff deleted, so
// the next sync does not bring it back.
type CalendarDateExclusion struct {
	ExternalKey string    `gorm:"primaryKey;size:64" json:"external_key"`
	DeletedByID uint      `json:"deleted_by_id"`
	CreatedAt   time.Time `json:"created_at"`
}

func (CalendarDateExclusion) TableName() string { return "calendar_date_exclusions" }
