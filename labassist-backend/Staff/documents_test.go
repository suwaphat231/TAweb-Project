package staff

import (
	"testing"

	"labassist/models"
)

// Every per-course workflow document must be linked to its course/posting,
// otherwise the staff workflow cannot match it to its step.
func TestNeedsCourse_AllCourseDocTypes(t *testing.T) {
	for _, dt := range []models.DocType{
		models.DocHiringNotice,
		models.DocApprovalMemo,
		models.DocLabNotice,
		models.DocPaymentEvidence,
		models.DocPaymentRequest,
		models.DocWorkReport,
	} {
		if !needsCourse(dt) {
			t.Errorf("needsCourse(%q) = false, want true", dt)
		}
	}
}

func TestNeedsRoster_OnlyFinancialDocTypes(t *testing.T) {
	for _, dt := range []models.DocType{models.DocHiringNotice, models.DocApprovalMemo, models.DocLabNotice} {
		if needsRoster(dt) {
			t.Errorf("needsRoster(%q) = true, want false", dt)
		}
	}
}

// CreateDocument rejects any type without a label, so every creatable
// workflow document type must have one.
func TestDocTypeLabel_AllWorkflowDocTypes(t *testing.T) {
	for _, dt := range []models.DocType{
		models.DocHiringNotice,
		models.DocApprovalMemo,
		models.DocLabNotice,
		models.DocPaymentEvidence,
		models.DocPaymentRequest,
		models.DocWorkReport,
	} {
		if _, ok := docTypeLabel[dt]; !ok {
			t.Errorf("docTypeLabel missing %q", dt)
		}
	}
}

// A plan-based work report pays every scheduled/completed session and
// nothing that was cancelled.
func TestPlanHoursAndAmount(t *testing.T) {
	occs := []models.OccurrenceSnapshot{
		{Hours: 2, Status: string(models.OccurrenceScheduled)},
		{Hours: 215.0 / 60, Status: string(models.OccurrenceCompleted)}, // 13:00–16:35
		{Hours: 2, Status: string(models.OccurrenceCancelledHoliday)},
	}
	hours, amount := planHoursAndAmount(occs, 50)
	if hours != 5.58 {
		t.Errorf("hours = %v, want 5.58", hours)
	}
	// Paid on the exact hours (as the approval memo is), not the rounded 5.58.
	if amount != 279.17 {
		t.Errorf("amount = %v, want 279.17", amount)
	}
}
