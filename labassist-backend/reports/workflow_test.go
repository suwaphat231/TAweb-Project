package reports

import (
	"testing"

	"labassist/models"
)

var (
	reporter  = Actor{ID: 10, Role: "instructor"}
	otherInst = Actor{ID: 11, Role: "instructor"}
	student   = Actor{ID: 20, Role: "student"}
	staffUser = Actor{ID: 30, Role: "staff"}
	adminUser = Actor{ID: 40, Role: "admin"}
)

var allStatuses = []models.ReportStatus{
	models.ReportDraft, models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
	models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn,
}

func report(status models.ReportStatus) models.LabBoyReport {
	return models.LabBoyReport{ID: 1, ReporterID: reporter.ID, StudentID: student.ID, Status: status}
}

// The instructor who files a report confirms it by submitting: DRAFT goes
// straight to CONFIRMED with no review step.
func TestSubmitConfirmsImmediately(t *testing.T) {
	to, d := CheckAction(report(models.ReportDraft), reporter, ActionSubmit, "")
	if d != nil || to != models.ReportConfirmed {
		t.Fatalf("submit: want CONFIRMED, got %q denial=%v", to, d)
	}
	for _, s := range allStatuses {
		if s == models.ReportDraft {
			continue
		}
		if _, d := CheckAction(report(s), reporter, ActionSubmit, ""); d == nil {
			t.Errorf("submit from %s must be rejected", s)
		}
	}
}

func TestWithdraw(t *testing.T) {
	allowed := map[models.ReportStatus]bool{
		models.ReportDraft: true, models.ReportConfirmed: true, models.ReportSubmitted: true,
		models.ReportUnderReview: true, models.ReportAwaitingResponse: true,
	}
	for _, s := range allStatuses {
		to, d := CheckAction(report(s), reporter, ActionWithdraw, "รายงานผิดคน")
		if allowed[s] && (d != nil || to != models.ReportWithdrawn) {
			t.Errorf("withdraw from %s: want WITHDRAWN, got %q denial=%v", s, to, d)
		}
		if !allowed[s] && d == nil {
			t.Errorf("withdraw from %s must be rejected", s)
		}
	}
	if _, d := CheckAction(report(models.ReportConfirmed), reporter, ActionWithdraw, ""); d == nil {
		t.Error("withdraw without a reason must be rejected")
	}
}

// Only the reporting instructor acts on a report. Admin can look but not
// act; other instructors, staff and students cannot act either.
func TestOnlyReporterActs(t *testing.T) {
	for _, a := range []Actor{otherInst, student, staffUser, adminUser} {
		for _, act := range []Action{ActionSubmit, ActionWithdraw} {
			_, d := CheckAction(report(models.ReportDraft), a, act, "เหตุผล")
			if d == nil || !d.Forbidden {
				t.Errorf("%s by %s/%d must be forbidden, got %v", act, a.Role, a.ID, d)
			}
		}
		if got := AllowedActions(report(models.ReportConfirmed), a); len(got) != 0 {
			t.Errorf("%s/%d must have no actions, got %v", a.Role, a.ID, got)
		}
	}
}

func TestRemovedReviewActionsStayGone(t *testing.T) {
	for _, a := range []Action{"start_review", "request_info", "reopen", "decline_reconsideration"} {
		if _, d := CheckAction(report(models.ReportSubmitted), adminUser, a, "x"); d == nil {
			t.Errorf("%s must no longer exist", a)
		}
	}
}

func TestAllowedActions(t *testing.T) {
	got := AllowedActions(report(models.ReportDraft), reporter)
	if len(got) != 2 || got[0] != ActionSubmit || got[1] != ActionWithdraw {
		t.Errorf("draft: want [submit withdraw], got %v", got)
	}
	got = AllowedActions(report(models.ReportConfirmed), reporter)
	if len(got) != 1 || got[0] != ActionWithdraw {
		t.Errorf("confirmed: want [withdraw], got %v", got)
	}
}

// Reports are for instructors: the reporter and admin may open one; other
// instructors, staff and the student never can, in any status.
func TestCanView(t *testing.T) {
	for _, s := range allStatuses {
		r := report(s)
		if !CanView(r, reporter) {
			t.Errorf("reporter must see %s", s)
		}
		if !CanView(r, adminUser) {
			t.Errorf("admin must see %s", s)
		}
		for _, a := range []Actor{otherInst, student, staffUser} {
			if CanView(r, a) {
				t.Errorf("%s/%d must not see %s", a.Role, a.ID, s)
			}
		}
	}
	// The reported student never opens a report about them.
	about := studentReport(models.ReportConfirmed)
	if CanView(about, Actor{ID: about.StudentID, Role: "student"}) {
		t.Error("the reported student must never open the report")
	}
}

// --- reports a student sends in about another Lab Boy ---

var (
	peerReporter = Actor{ID: 21, Role: "student"}
	courseInst   = Actor{ID: 12, Role: "instructor", CourseInstructor: true}
)

func studentReport(status models.ReportStatus) models.LabBoyReport {
	return models.LabBoyReport{ID: 2, ReporterID: peerReporter.ID, ReporterRole: "student", StudentID: student.ID, Status: status}
}

func TestCourseInstructorConfirmsOrRejects(t *testing.T) {
	to, d := CheckAction(studentReport(models.ReportSubmitted), courseInst, ActionConfirm, "")
	if d != nil || to != models.ReportConfirmed {
		t.Fatalf("confirm: want CONFIRMED, got %q denial=%v", to, d)
	}
	if _, d := CheckAction(studentReport(models.ReportSubmitted), courseInst, ActionNotSubstantiated, ""); d == nil {
		t.Error("rejecting without a reason must be refused")
	}
	to, d = CheckAction(studentReport(models.ReportSubmitted), courseInst, ActionNotSubstantiated, "ไม่พบหลักฐาน")
	if d != nil || to != models.ReportNotSubstantiated {
		t.Fatalf("reject: want NOT_SUBSTANTIATED, got %q denial=%v", to, d)
	}
	// Decisions are final: no second decision, no reopening a rejection.
	for _, s := range []models.ReportStatus{models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn} {
		for _, a := range []Action{ActionConfirm, ActionNotSubstantiated} {
			if _, d := CheckAction(studentReport(s), courseInst, a, "x"); d == nil {
				t.Errorf("%s from %s must be refused", a, s)
			}
		}
	}
	got := AllowedActions(studentReport(models.ReportSubmitted), courseInst)
	if len(got) != 2 || got[0] != ActionConfirm || got[1] != ActionNotSubstantiated {
		t.Errorf("course instructor on a waiting report: want [confirm not_substantiated], got %v", got)
	}
}

func TestOnlyCourseInstructorReviews(t *testing.T) {
	r := studentReport(models.ReportSubmitted)
	for _, a := range []Actor{otherInst, peerReporter, student, staffUser, adminUser} {
		for _, act := range []Action{ActionConfirm, ActionNotSubstantiated} {
			if _, d := CheckAction(r, a, act, "x"); d == nil || !d.Forbidden {
				t.Errorf("%s by %s/%d must be forbidden, got %v", act, a.Role, a.ID, d)
			}
		}
	}
	// An instructor's own report is never put up for review.
	own := report(models.ReportSubmitted)
	if _, d := CheckAction(own, Actor{ID: reporter.ID, Role: "instructor", CourseInstructor: true}, ActionConfirm, ""); d == nil {
		t.Error("instructor-filed reports have no review step")
	}
}

func TestStudentWithdrawsOnlyWhileWaiting(t *testing.T) {
	to, d := CheckAction(studentReport(models.ReportSubmitted), peerReporter, ActionWithdraw, "ส่งผิดคน")
	if d != nil || to != models.ReportWithdrawn {
		t.Fatalf("withdraw while waiting: want WITHDRAWN, got %q denial=%v", to, d)
	}
	for _, s := range []models.ReportStatus{models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn} {
		if _, d := CheckAction(studentReport(s), peerReporter, ActionWithdraw, "x"); d == nil {
			t.Errorf("student withdraw from %s must be refused", s)
		}
	}
	if got := AllowedActions(studentReport(models.ReportSubmitted), peerReporter); len(got) != 1 || got[0] != ActionWithdraw {
		t.Errorf("student reporter: want [withdraw], got %v", got)
	}
}

func TestStudentReportVisibility(t *testing.T) {
	for _, s := range []models.ReportStatus{models.ReportSubmitted, models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn} {
		r := studentReport(s)
		if !CanView(r, peerReporter) {
			t.Errorf("the student who sent it must see %s", s)
		}
		if !CanView(r, courseInst) {
			t.Errorf("the course instructor must see %s", s)
		}
		if !CanView(r, adminUser) {
			t.Errorf("admin must see %s", s)
		}
		for _, a := range []Actor{otherInst, student, staffUser} {
			if CanView(r, a) {
				t.Errorf("%s/%d must not see %s", a.Role, a.ID, s)
			}
		}
	}
	// The course instructor does not see an instructor colleague's report.
	if CanView(report(models.ReportConfirmed), courseInst) {
		t.Error("course instructor must not see another instructor's report")
	}
	if CanAddEvidence(studentReport(models.ReportSubmitted), peerReporter) {
		t.Error("students send reports without attachments")
	}
}

func TestEditAndEvidence(t *testing.T) {
	if !CanEditDraft(report(models.ReportDraft), reporter) || CanEditDraft(report(models.ReportConfirmed), reporter) {
		t.Error("only drafts are editable by the reporter")
	}
	if CanEditDraft(report(models.ReportDraft), adminUser) {
		t.Error("admin must not edit")
	}
	if !CanAddEvidence(report(models.ReportConfirmed), reporter) {
		t.Error("reporter may add evidence to a confirmed report")
	}
	if CanAddEvidence(report(models.ReportWithdrawn), reporter) {
		t.Error("no evidence on a withdrawn report")
	}
	if CanAddEvidence(report(models.ReportConfirmed), adminUser) {
		t.Error("admin must not add evidence")
	}
}
