package models

import "time"

type DocType string
type DocStatus string

const (
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
}

// DocumentPeriod is the month/year a StaffDocument's line items cover.
type DocumentPeriod struct {
	Month int `json:"month"` // 1-12
	Year  int `json:"year"`  // พ.ศ. (Buddhist era)
}

// StaffDocument represents a document created by staff as part of the
// hiring/payment workflow (approval memo → work report → payment evidence →
// payment request). Stored in-memory alongside applications and notifications.
type StaffDocument struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Type      DocType   `json:"type"`
	CourseRef string    `json:"course_ref"`
	CourseID  *uint     `json:"course_id,omitempty"`
	StaffID   uint      `json:"staff_id"`
	Status    DocStatus `json:"status"`
	Note      string    `json:"note,omitempty"`

	// Line-item fields, populated only for the 3 document types that carry
	// a per-student roster (payment_evidence, payment_request, work_report).
	Period          *DocumentPeriod `json:"period,omitempty"`
	SessionDates    []int           `json:"session_dates,omitempty"` // day-of-month
	HoursPerSession float64         `json:"hours_per_session,omitempty"`
	Rate            float64         `json:"rate,omitempty"`
	Roster          []RosterEntry   `json:"roster,omitempty"` // creation-time snapshot; excluded students are simply absent
	TotalAmount     float64         `json:"total_amount,omitempty"`

	// Bureaucratic memo fields — no existing model can derive these, so
	// they're typed once per document.
	RefNumber        string `json:"ref_number,omitempty"`
	PriorMemoRef     string `json:"prior_memo_ref,omitempty"`
	PriorMemoDate    string `json:"prior_memo_date,omitempty"`
	DeptHeadName     string `json:"dept_head_name,omitempty"`
	DeanName         string `json:"dean_name,omitempty"`
	StaffOfficerName string `json:"staff_officer_name,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
