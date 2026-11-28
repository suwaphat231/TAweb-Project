package reports

import (
	"testing"
	"time"

	"labassist/models"
)

// --- the reported student's appeal, decided by whoever confirmed ---

func appealed(r models.LabBoyReport) models.LabBoyReport {
	now := time.Now()
	r.ReconsiderationRequestedAt = &now
	return r
}

func TestConfirmerDecidesAppeal(t *testing.T) {
	confirmer := Actor{ID: courseInst.ID, Role: "instructor", CourseInstructor: true, Confirmer: true}
	r := appealed(studentReport(models.ReportConfirmed))

	to, d := CheckAction(r, confirmer, ActionAppealOverturn, "หลักฐานไม่พอ")
	if d != nil || to != models.ReportNotSubstantiated {
		t.Fatalf("overturn: want NOT_SUBSTANTIATED, got %q denial=%v", to, d)
	}
	to, d = CheckAction(r, confirmer, ActionAppealUphold, "ยืนยันตามเดิม")
	if d != nil || to != models.ReportConfirmed {
		t.Fatalf("uphold: want CONFIRMED, got %q denial=%v", to, d)
	}
	for _, a := range []Action{ActionAppealUphold, ActionAppealOverturn} {
		if _, d := CheckAction(r, confirmer, a, ""); d == nil {
			t.Errorf("%s without a reason must be refused", a)
		}
	}
	got := AllowedActions(r, confirmer)
	if len(got) != 2 || got[0] != ActionAppealUphold || got[1] != ActionAppealOverturn {
		t.Errorf("confirmer on an appealed report: want [appeal_uphold appeal_overturn], got %v", got)
	}

	// For an instructor's own report, the reporter confirmed it and decides.
	own := appealed(report(models.ReportConfirmed))
	self := Actor{ID: reporter.ID, Role: "instructor", Confirmer: true}
	if _, d := CheckAction(own, self, ActionAppealOverturn, "x"); d != nil {
		t.Errorf("reporter who confirmed must decide the appeal: %v", d)
	}
}

func TestOnlyConfirmerDecidesAppeal(t *testing.T) {
	r := appealed(studentReport(models.ReportConfirmed))
	// Teaching the course is not enough; admin and students never decide.
	for _, a := range []Actor{courseInst, otherInst, peerReporter, student, staffUser, adminUser} {
		for _, act := range []Action{ActionAppealUphold, ActionAppealOverturn} {
			if _, d := CheckAction(r, a, act, "x"); d == nil || !d.Forbidden {
				t.Errorf("%s by %s/%d must be forbidden, got %v", act, a.Role, a.ID, d)
			}
		}
	}
}

func TestAppealDecisionNeedsPendingAppeal(t *testing.T) {
	confirmer := Actor{ID: courseInst.ID, Role: "instructor", Confirmer: true}
	// No appeal waiting (never sent, or already decided and cleared).
	for _, act := range []Action{ActionAppealUphold, ActionAppealOverturn} {
		if _, d := CheckAction(studentReport(models.ReportConfirmed), confirmer, act, "x"); d == nil {
			t.Errorf("%s without a pending appeal must be refused", act)
		}
	}
	// After an overturn the report is no longer CONFIRMED: no further decision.
	for _, s := range []models.ReportStatus{models.ReportNotSubstantiated, models.ReportWithdrawn, models.ReportSubmitted} {
		if _, d := CheckAction(appealed(studentReport(s)), confirmer, ActionAppealUphold, "x"); d == nil {
			t.Errorf("uphold from %s must be refused", s)
		}
	}
}

func TestConfirmerMayOpenReport(t *testing.T) {
	// A confirmer who no longer teaches the course still opens it to decide.
	if !CanView(studentReport(models.ReportConfirmed), Actor{ID: 99, Role: "instructor", Confirmer: true}) {
		t.Error("the confirmer must open the report")
	}
	// The reported student never opens the report itself.
	if CanView(appealed(studentReport(models.ReportConfirmed)), student) {
		t.Error("the reported student must not open the report")
	}
}
