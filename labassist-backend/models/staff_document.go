package models

import "time"

type DocType string
type DocStatus string

const (
	DocApprovalMemo    DocType = "approval_memo"
	DocPaymentEvidence DocType = "payment_evidence"
	DocPaymentRequest  DocType = "payment_request"

	DocDraft    DocStatus = "draft"
	DocPending  DocStatus = "pending"
	DocApproved DocStatus = "approved"
)

// StaffDocument represents a document created by staff as part of the
// hiring/payment workflow (approval memo → payment evidence → payment request).
// Stored in-memory alongside applications and notifications.
type StaffDocument struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Type      DocType   `json:"type"`
	CourseRef string    `json:"course_ref"`
	StaffID   uint      `json:"staff_id"`
	Status    DocStatus `json:"status"`
	Note      string    `json:"note,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
