package models

import "time"

// PenaltyStatus is where a blacklisted student stands, as shown to the
// student and the course's instructor: blacklisted with no appeal yet, or
// the status of the appeal against it.
type PenaltyStatus string

const (
	PenaltyBlacklisted    PenaltyStatus = "blacklisted"
	PenaltyAppealPending  PenaltyStatus = "appeal_pending"
	PenaltyAppealApproved PenaltyStatus = "appeal_approved"
	PenaltyAppealRejected PenaltyStatus = "appeal_rejected"
	PenaltyAppealMoreInfo PenaltyStatus = "appeal_more_info"
)

// Open is whether the appeal still waits on someone: the student cannot
// file another one meanwhile.
func (s PenaltyStatus) Open() bool { return s == PenaltyAppealPending || s == PenaltyAppealMoreInfo }

// BlacklistAppeal is a student's appeal against one blacklisting (a
// CONFIRMED LabBoyReport), decided by the course's instructor or admin. One
// appeal per blacklisting: BlacklistedAt pins which one, so a report that is
// reopened and blacklisted again can be appealed again. Never deleted; every
// step is a BlacklistAppealEvent plus a staff_audit_logs row.
type BlacklistAppeal struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	ReportID  uint `gorm:"not null;index" json:"report_id"`
	StudentID uint `gorm:"not null;index" json:"student_id"`
	// BlacklistedAt copies the report's BlacklistedAt when filed.
	BlacklistedAt time.Time     `gorm:"not null" json:"blacklisted_at"`
	Reason        string        `gorm:"type:text;not null" json:"reason"`
	Details       string        `gorm:"type:text" json:"details,omitempty"`
	Status        PenaltyStatus `gorm:"type:enum('appeal_pending','appeal_approved','appeal_rejected','appeal_more_info');not null;default:'appeal_pending';index" json:"status"`
	// Decision fields hold the final approve/reject; the full trail, with
	// requests for information, is in the events.
	DecidedAt    *time.Time `json:"decided_at,omitempty"`
	DecidedByID  *uint      `json:"decided_by_id,omitempty"`
	DecisionNote string     `gorm:"type:text" json:"decision_note,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Display fields filled in by the database layer, not stored.
	StudentName    string `gorm:"-" json:"student_name"`
	StudentCode    string `gorm:"-" json:"student_code"`
	DecidedByName  string `gorm:"-" json:"decided_by_name,omitempty"`
	CourseID       uint   `gorm:"-" json:"course_id"`
	CourseCode     string `gorm:"-" json:"course_code"`
	CourseTitle    string `gorm:"-" json:"course_title"`
	CourseSection  int    `gorm:"-" json:"course_section,omitempty"`
	CourseSemester string `gorm:"-" json:"course_semester,omitempty"`
	CourseYear     int    `gorm:"-" json:"course_academic_year,omitempty"`
	// BlacklistCount is how many times the student has ever been
	// blacklisted, this one included — their punishment history.
	BlacklistCount int `gorm:"-" json:"blacklist_count"`
}

func (BlacklistAppeal) TableName() string { return "blacklist_appeals" }

type AppealEventKind string

const (
	AppealEventSubmit      AppealEventKind = "SUBMIT"
	AppealEventRequestInfo AppealEventKind = "REQUEST_INFO"
	AppealEventStudentInfo AppealEventKind = "STUDENT_INFO"
	AppealEventApprove     AppealEventKind = "APPROVE"
	AppealEventReject      AppealEventKind = "REJECT"
)

// BlacklistAppealEvent is one append-only step of an appeal: who did what,
// when, with which note. Files sent with it point at it via
// LabBoyReportEvidence.AppealEventID.
type BlacklistAppealEvent struct {
	ID         uint            `gorm:"primaryKey" json:"id"`
	AppealID   uint            `gorm:"not null;index" json:"appeal_id"`
	Kind       AppealEventKind `gorm:"type:enum('SUBMIT','REQUEST_INFO','STUDENT_INFO','APPROVE','REJECT');not null" json:"kind"`
	FromStatus *PenaltyStatus  `gorm:"size:30" json:"from_status,omitempty"`
	ToStatus   PenaltyStatus   `gorm:"size:30;not null" json:"to_status"`
	Note       string          `gorm:"type:text;not null" json:"note"`
	ActorID    uint            `gorm:"not null" json:"actor_id"`
	CreatedAt  time.Time       `json:"created_at"`

	ActorName string `gorm:"-" json:"actor_name"`
	ActorRole string `gorm:"-" json:"actor_role"`
}

func (BlacklistAppealEvent) TableName() string { return "blacklist_appeal_events" }

// BlacklistedSince is when r became a blacklisting. Reports confirmed
// before BlacklistedAt existed fall back to their last update.
func (r LabBoyReport) BlacklistedSince() time.Time {
	if r.BlacklistedAt != nil {
		return *r.BlacklistedAt
	}
	return r.UpdatedAt
}

// PenaltyOf is where r stands as a blacklisting, given its latest appeal
// (nil if none): that appeal's status if it is still open or concerns the
// current blacklisting, else "blacklisted" for a CONFIRMED report, else
// empty (never blacklisted, or lifted some other way).
func PenaltyOf(r LabBoyReport, latest *BlacklistAppeal) PenaltyStatus {
	if latest != nil && (latest.Status.Open() || latest.BlacklistedAt.Equal(r.BlacklistedSince())) {
		return latest.Status
	}
	if r.Status == ReportConfirmed {
		return PenaltyBlacklisted
	}
	return ""
}
