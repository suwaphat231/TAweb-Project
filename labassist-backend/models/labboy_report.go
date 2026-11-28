package models

import "time"

// LabBoyReport is an instructor's report about how a Lab Boy performed in
// one of the instructor's courses. It replaces the old instant Blacklist
// flag: a report is only an allegation until a reviewer (staff/admin, never
// the reporter) confirms it, and only CONFIRMED reports are ever shown to
// other instructors as work-performance history. Nothing here blocks a
// student from applying.
//
// Reports are never deleted. Every status change is written to
// LabBoyReportStatusHistory and to staff_audit_logs in the same transaction.
type LabBoyReport struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// ApplicationID is the accepted Lab Boy application the report is about.
	// StudentID and CourseID are copied from it server-side so the client
	// can never point a report at a student it did not work with.
	ApplicationID uint           `gorm:"not null;index" json:"application_id"`
	StudentID     uint           `gorm:"not null;index:idx_lbr_student_status" json:"student_id"`
	CourseID      uint           `gorm:"not null;index" json:"course_id"`
	ReporterID    uint           `gorm:"not null;index" json:"reporter_id,omitempty"`
	IncidentDate  time.Time      `gorm:"type:date;not null;index" json:"incident_date"`
	Category      ReportCategory `gorm:"type:enum('ABSENCE','LATE_NOTICE','DUTY_NEGLECT','UNPROFESSIONAL_CONDUCT','OTHER');not null;index" json:"category"`
	Description   string         `gorm:"type:text;not null" json:"description"`
	Impact        string         `gorm:"type:text" json:"impact,omitempty"`
	Status        ReportStatus   `gorm:"type:enum('DRAFT','SUBMITTED','UNDER_REVIEW','AWAITING_RESPONSE','CONFIRMED','NOT_SUBSTANTIATED','WITHDRAWN');not null;default:'DRAFT';index;index:idx_lbr_student_status" json:"status"`
	SubmittedAt   *time.Time     `json:"submitted_at,omitempty"`
	// ReconsiderationRequestedAt is set when the student asks for a
	// CONFIRMED report to be reviewed again; cleared when a reviewer
	// reopens or declines the request.
	ReconsiderationRequestedAt *time.Time `json:"reconsideration_requested_at,omitempty"`
	// AppealDeadline is set when the report takes effect (CONFIRMED): the
	// reported student is told then, and may appeal once until this time.
	// A report that never took effect has none — the student is never told.
	AppealDeadline *time.Time `json:"appeal_deadline,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt                  time.Time  `json:"updated_at"`

	// Display fields filled in by the database layer, not stored.
	StudentName    string `gorm:"-" json:"student_name"`
	StudentCode    string `gorm:"-" json:"student_code"`
	ReporterName   string `gorm:"-" json:"reporter_name"`
	// ReporterRole is "student" for a report a fellow Lab Boy sent in (it
	// waits for the course instructor), otherwise the instructor/admin role.
	ReporterRole   string `gorm:"-" json:"reporter_role,omitempty"`
	CourseCode     string `gorm:"-" json:"course_code"`
	CourseTitle    string `gorm:"-" json:"course_title"`
	CourseSection  int    `gorm:"-" json:"course_section,omitempty"`
	CourseSemester string `gorm:"-" json:"course_semester,omitempty"`
	CourseYear     int    `gorm:"-" json:"course_academic_year,omitempty"`
}

func (LabBoyReport) TableName() string { return "labboy_reports" }

type ReportStatus string

const (
	ReportDraft            ReportStatus = "DRAFT"
	ReportSubmitted        ReportStatus = "SUBMITTED"
	ReportUnderReview      ReportStatus = "UNDER_REVIEW"
	ReportAwaitingResponse ReportStatus = "AWAITING_RESPONSE"
	ReportConfirmed        ReportStatus = "CONFIRMED"
	ReportNotSubstantiated ReportStatus = "NOT_SUBSTANTIATED"
	ReportWithdrawn        ReportStatus = "WITHDRAWN"
)

type ReportCategory string

const (
	CategoryAbsence               ReportCategory = "ABSENCE"
	CategoryLateNotice            ReportCategory = "LATE_NOTICE"
	CategoryDutyNeglect           ReportCategory = "DUTY_NEGLECT"
	CategoryUnprofessionalConduct ReportCategory = "UNPROFESSIONAL_CONDUCT"
	CategoryOther                 ReportCategory = "OTHER"
)

func (c ReportCategory) Valid() bool {
	switch c {
	case CategoryAbsence, CategoryLateNotice, CategoryDutyNeglect, CategoryUnprofessionalConduct, CategoryOther:
		return true
	}
	return false
}

// LabBoyReportEvidence is one file attached to a report, by the reporter or
// by the student alongside a response. The bytes live in private object
// storage (DataKey; Data only for files from before that), so there is no
// public path to them — they are only served through the report's evidence
// endpoint after a permission check.
type LabBoyReportEvidence struct {
	ID           uint `gorm:"primaryKey" json:"id"`
	ReportID     uint `gorm:"not null;index" json:"report_id"`
	UploadedByID uint `gorm:"not null" json:"uploaded_by_id,omitempty"`
	// ResponseID links a student's file to the response it was sent with.
	ResponseID  *uint     `gorm:"index" json:"response_id,omitempty"`
	FileName    string    `gorm:"size:255;not null" json:"file_name"`
	ContentType string    `gorm:"size:100;not null" json:"content_type"`
	SizeBytes   int64     `gorm:"not null" json:"size_bytes"`
	DataKey     string    `gorm:"size:255;not null;default:''" json:"-"`
	Data        []byte    `gorm:"type:longblob" json:"-"`
	CreatedAt   time.Time `json:"created_at"`

	UploadedByName string `gorm:"-" json:"uploaded_by_name"`
}

func (LabBoyReportEvidence) TableName() string { return "labboy_report_evidence" }

type ReportResponseKind string

const (
	// ResponseExplanation is the student's side of the story.
	ResponseExplanation ReportResponseKind = "EXPLANATION"
	// ResponseReconsideration asks for a CONFIRMED report to be reviewed again.
	ResponseReconsideration ReportResponseKind = "RECONSIDERATION"
	// ResponseReporterInfo is extra information the reporter adds after a
	// reviewer asked for it.
	ResponseReporterInfo ReportResponseKind = "REPORTER_INFO"
)

// LabBoyReportResponse is an append-only message on a report. Each
// submission is its own row; nothing ever overwrites an earlier one.
type LabBoyReportResponse struct {
	ID        uint               `gorm:"primaryKey" json:"id"`
	ReportID  uint               `gorm:"not null;index" json:"report_id"`
	AuthorID  uint               `gorm:"not null" json:"author_id,omitempty"`
	Kind      ReportResponseKind `gorm:"type:enum('EXPLANATION','RECONSIDERATION','REPORTER_INFO');not null" json:"kind"`
	Message   string             `gorm:"type:text;not null" json:"message"`
	CreatedAt time.Time          `json:"created_at"`

	AuthorName string `gorm:"-" json:"author_name"`
	AuthorRole string `gorm:"-" json:"author_role"`
}

func (LabBoyReportResponse) TableName() string { return "labboy_report_responses" }

type ReviewDecision string

const (
	DecisionRequestInfo            ReviewDecision = "REQUEST_INFO"
	DecisionConfirm                ReviewDecision = "CONFIRM"
	DecisionNotSubstantiated       ReviewDecision = "NOT_SUBSTANTIATED"
	DecisionReopen                 ReviewDecision = "REOPEN"
	DecisionDeclineReconsideration ReviewDecision = "DECLINE_RECONSIDERATION"
)

// LabBoyReportReview is one reviewer decision with its reason. A report can
// collect several over time (request info, then confirm, then reopen...).
type LabBoyReportReview struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	ReportID   uint           `gorm:"not null;index" json:"report_id"`
	ReviewerID uint           `gorm:"not null" json:"reviewer_id"`
	Decision   ReviewDecision `gorm:"type:enum('REQUEST_INFO','CONFIRM','NOT_SUBSTANTIATED','REOPEN','DECLINE_RECONSIDERATION');not null" json:"decision"`
	Reason     string         `gorm:"type:text;not null" json:"reason"`
	CreatedAt  time.Time      `json:"created_at"`

	ReviewerName string `gorm:"-" json:"reviewer_name"`
}

func (LabBoyReportReview) TableName() string { return "labboy_report_reviews" }

// LabBoyReportStatusHistory is the report's timeline: one row per status
// change, including the very first DRAFT.
type LabBoyReportStatusHistory struct {
	ID         uint          `gorm:"primaryKey" json:"id"`
	ReportID   uint          `gorm:"not null;index" json:"report_id"`
	FromStatus *ReportStatus `gorm:"size:30" json:"from_status,omitempty"`
	ToStatus   ReportStatus  `gorm:"size:30;not null" json:"to_status"`
	ActorID    uint          `gorm:"not null" json:"actor_id,omitempty"`
	Reason     string        `gorm:"type:text" json:"reason,omitempty"`
	CreatedAt  time.Time     `json:"created_at"`

	ActorName string `gorm:"-" json:"actor_name"`
}

func (LabBoyReportStatusHistory) TableName() string { return "labboy_report_status_history" }

// ConfirmedRecord is the minimal view of a CONFIRMED report that an
// instructor sees when considering the student for another course: what was
// confirmed and why, never the evidence or the reporter's raw files.
type ConfirmedRecord struct {
	ReportID       uint           `json:"report_id"`
	Category       ReportCategory `json:"category"`
	IncidentDate   time.Time      `json:"incident_date"`
	CourseCode     string         `json:"course_code"`
	CourseTitle    string         `json:"course_title"`
	CourseSemester string         `json:"course_semester,omitempty"`
	CourseYear     int            `json:"course_academic_year,omitempty"`
	Description    string         `json:"description"`
	ConfirmedAt    time.Time      `json:"confirmed_at"`
	ReviewReason   string         `json:"review_reason"`
	// StudentResponded tells the reader the student gave their side.
	StudentResponded bool `json:"student_responded"`
	// AppealPending: the student appealed and the decision is not in yet.
	AppealPending bool `json:"appeal_pending"`
}

// StudentRecord is what the reported student sees about a report that took
// effect against them. It is an allow-list: nothing here tells the student
// who filed the report or whether it came from a fellow student or an
// instructor (no reporter fields, no timeline actors, no evidence).
type StudentRecord struct {
	ReportID       uint           `json:"report_id"`
	CourseCode     string         `json:"course_code"`
	CourseTitle    string         `json:"course_title"`
	CourseSection  int            `json:"course_section,omitempty"`
	CourseSemester string         `json:"course_semester,omitempty"`
	CourseYear     int            `json:"course_academic_year,omitempty"`
	Category       ReportCategory `json:"category"`
	IncidentDate   time.Time      `json:"incident_date"`
	Description    string         `json:"description"`
	// Status is CONFIRMED (in force), NOT_SUBSTANTIATED (overturned on
	// appeal) or WITHDRAWN (taken back after it took effect).
	Status         ReportStatus `json:"status"`
	ConfirmedAt    *time.Time   `json:"confirmed_at,omitempty"`
	AppealDeadline *time.Time   `json:"appeal_deadline,omitempty"`
	CanAppeal      bool         `json:"can_appeal"`
	// Appeal is nil until the student appeals.
	Appeal *StudentAppeal `json:"appeal,omitempty"`
}

// StudentAppeal is the student's one appeal and its outcome.
type StudentAppeal struct {
	Message     string    `json:"message"`
	SubmittedAt time.Time `json:"submitted_at"`
	// Outcome is "pending", "upheld" (the record stays) or "overturned".
	Outcome   string     `json:"outcome"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`
	Reason    string     `json:"reason,omitempty"`
}
