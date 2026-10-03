package models

import "time"

type DocType string
type DocStatus string

const (
	DocHiringNotice    DocType = "hiring_notice"
	DocApprovalMemo    DocType = "approval_memo"
	DocLabNotice       DocType = "lab_notice"
	DocPaymentEvidence DocType = "payment_evidence"
	DocPaymentRequest  DocType = "payment_request"
	DocWorkReport      DocType = "work_report"

	DocDraft             DocStatus = "draft"
	DocPending           DocStatus = "pending"
	DocApproved          DocStatus = "approved"
	DocGenerated         DocStatus = "generated"
	DocAwaitingSignature DocStatus = "awaiting_signature"
	DocSigned            DocStatus = "signed"
	DocCancelled         DocStatus = "cancelled"
	DocSuperseded        DocStatus = "superseded"
)

// WorkDaySlot holds one weekly recurring work slot for a labboy position.
type WorkDaySlot struct {
	Day       string `json:"day"`
	TimeStart string `json:"time_start"`
	TimeEnd   string `json:"time_end"`
}

// RosterEntry is a per-student line item, computed and frozen onto a
// StaffDocument at creation time from that moment's accepted-applicant list —
// later status changes on the underlying Application never retroactively
// alter an already-issued document.
type RosterEntry struct {
	StudentID   uint    `json:"student_id"`
	StudentName string  `json:"student_name"`
	StudentCode string  `json:"student_code"`
	Hours       float64 `json:"hours"`
	Amount      float64 `json:"amount"`
	// RegVerified is set by staff after comparing this student's name,
	// student ID, and enrollment status against the REG system.
	RegVerified bool   `json:"reg_verified"`
	RegNote     string `json:"reg_note,omitempty"`
}

// DocumentPeriod is the month/year a StaffDocument's line items cover.
type DocumentPeriod struct {
	Month int `json:"month"` // 1-12
	Year  int `json:"year"`  // พ.ศ. (Buddhist era)
}

// StaffDocument represents a document created by staff as part of the
// hiring/payment workflow (approval memo → work report → payment evidence →
// payment request).
type StaffDocument struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Type      DocType   `gorm:"type:enum('hiring_notice','approval_memo','lab_notice','payment_evidence','payment_request','work_report');not null" json:"type"`
	CourseRef string    `gorm:"size:255" json:"course_ref"`
	PostingID *uint     `gorm:"index" json:"posting_id,omitempty"`
	CourseID  *uint     `json:"course_id,omitempty"`
	StaffID   uint      `gorm:"not null" json:"staff_id"`
	Status    DocStatus `gorm:"type:enum('draft','pending','approved','generated','awaiting_signature','signed','cancelled','superseded');not null;default:'draft'" json:"status"`
	Note      string    `gorm:"type:text" json:"note,omitempty"`

	// Line-item fields, populated only for the 3 document types that carry
	// a per-student roster (payment_evidence, payment_request, work_report).
	// Monetary columns use DECIMAL to avoid floating-point representation errors.
	Period          *DocumentPeriod `gorm:"serializer:json" json:"period,omitempty"`
	SessionDates    []int           `gorm:"serializer:json" json:"session_dates,omitempty"`
	HoursPerSession float64         `gorm:"type:decimal(8,2);default:0" json:"hours_per_session,omitempty"`
	Rate            float64         `gorm:"type:decimal(10,2);default:0" json:"rate,omitempty"`
	Roster          []RosterEntry   `gorm:"serializer:json;type:longtext" json:"roster,omitempty"`
	TotalAmount     float64         `gorm:"type:decimal(12,2);default:0" json:"total_amount,omitempty"`

	// WorkDay/WorkTimeStart/WorkTimeEnd describe the recurring weekly
	// schedule for line-item documents so the work report can display
	// "วันพุธ เวลา 10:20 น. - 12:20 น." per session row.
	WorkDay       string `json:"work_day,omitempty"`
	WorkTimeStart string `json:"work_time_start,omitempty"`
	WorkTimeEnd   string `json:"work_time_end,omitempty"`

	// WorkSchedule holds up to 3 weekly recurring slots (day + time range)
	// collected when the hiring_notice document is created.
	WorkSchedule    []WorkDaySlot `gorm:"serializer:json" json:"work_schedule,omitempty"`
	SessionsPerMonth int          `json:"sessions_per_month,omitempty"`

	// Bureaucratic memo fields — no existing model can derive these, so
	// they're typed once per document.
	RefNumber        string `json:"ref_number,omitempty"`
	PriorMemoRef     string `json:"prior_memo_ref,omitempty"`
	PriorMemoDate    string `json:"prior_memo_date,omitempty"`
	DeptHeadName     string `json:"dept_head_name,omitempty"`
	DeanName         string `json:"dean_name,omitempty"`
	StaffOfficerName string `json:"staff_officer_name,omitempty"`

	// StaffCaseID links this document to the new staff case workflow. Nullable
	// for backwards compatibility with documents created before StaffCase existed.
	StaffCaseID     *uint `gorm:"index" json:"staff_case_id,omitempty"`
	MonthlyPeriodID *uint `gorm:"index" json:"monthly_period_id,omitempty"`

	// Versioning: each time a signed document is revised a new StaffDocument row
	// is created with Version incremented and the old row's SupersededByID set.
	Version        int   `gorm:"not null;default:1" json:"version"`
	SupersededByID *uint `gorm:"index" json:"superseded_by_id,omitempty"`

	// Signed document upload — separate from generated DOCX bytes.
	SignedFileName string    `json:"signed_file_name,omitempty"`
	SignedFileData []byte    `gorm:"type:longblob" json:"-"`
	SignedAt       *time.Time `json:"signed_at,omitempty"`
	SignedByID     *uint     `json:"signed_by_id,omitempty"`

	// DataSnapshot is a JSON-encoded copy of all inputs used to generate this
	// document, frozen at creation time so the document is reproducible even
	// after source data changes.
	DataSnapshot    string `gorm:"type:longtext" json:"-"`
	SnapshotVersion int    `gorm:"default:1" json:"snapshot_version"`

	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (StaffDocument) TableName() string { return "staff_documents" }
