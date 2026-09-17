package models

import "time"

type DocType string
type DocStatus string

const (
	DocHiringNotice    DocType = "hiring_notice"
	DocApprovalMemo    DocType = "approval_memo"
	DocPaymentEvidence DocType = "payment_evidence"
	DocPaymentRequest  DocType = "payment_request"
	DocWorkReport      DocType = "work_report"

	DocDraft    DocStatus = "draft"
	DocPending  DocStatus = "pending"
	DocApproved DocStatus = "approved"
)

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
	Type      DocType   `gorm:"type:enum('hiring_notice','approval_memo','payment_evidence','payment_request','work_report');not null" json:"type"`
	CourseRef string    `gorm:"size:255" json:"course_ref"`
	CourseID  *uint     `json:"course_id,omitempty"`
	StaffID   uint      `gorm:"not null" json:"staff_id"`
	Status    DocStatus `gorm:"type:enum('draft','pending','approved');not null;default:'draft'" json:"status"`
	Note      string    `gorm:"type:text" json:"note,omitempty"`

	// Line-item fields, populated only for the 3 document types that carry
	// a per-student roster (payment_evidence, payment_request, work_report).
	Period          *DocumentPeriod `gorm:"serializer:json" json:"period,omitempty"`
	SessionDates    []int           `gorm:"serializer:json" json:"session_dates,omitempty"`
	HoursPerSession float64         `json:"hours_per_session,omitempty"`
	Rate            float64         `json:"rate,omitempty"`
	Roster          []RosterEntry   `gorm:"serializer:json;type:longtext" json:"roster,omitempty"`
	TotalAmount     float64         `json:"total_amount,omitempty"`

	// WorkDay/WorkTimeStart/WorkTimeEnd describe the recurring weekly
	// schedule for line-item documents so the work report can display
	// "วันพุธ เวลา 10:20 น. - 12:20 น." per session row.
	WorkDay       string `json:"work_day,omitempty"`
	WorkTimeStart string `json:"work_time_start,omitempty"`
	WorkTimeEnd   string `json:"work_time_end,omitempty"`

	// Bureaucratic memo fields — no existing model can derive these, so
	// they're typed once per document.
	RefNumber        string `json:"ref_number,omitempty"`
	PriorMemoRef     string `json:"prior_memo_ref,omitempty"`
	PriorMemoDate    string `json:"prior_memo_date,omitempty"`
	DeptHeadName     string `json:"dept_head_name,omitempty"`
	DeanName         string `json:"dean_name,omitempty"`
	StaffOfficerName string `json:"staff_officer_name,omitempty"`

	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (StaffDocument) TableName() string { return "staff_documents" }
