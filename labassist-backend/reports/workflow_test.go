package reports

import (
	"testing"
	"time"

	"labassist/models"
)

var (
	reporter   = Actor{ID: 10, Role: "instructor"}
	otherInst  = Actor{ID: 11, Role: "instructor"}
	student    = Actor{ID: 20, Role: "student"}
	otherStu   = Actor{ID: 21, Role: "student"}
	staffUser  = Actor{ID: 30, Role: "staff"}
	adminUser  = Actor{ID: 40, Role: "admin"}
	adminOwner = Actor{ID: 41, Role: "admin"}
)

func report(status models.ReportStatus) models.LabBoyReport {
	return models.LabBoyReport{ID: 1, ReporterID: reporter.ID, StudentID: student.ID, Status: status}
}

func TestStateMachine(t *testing.T) {
	all := []models.ReportStatus{
		models.ReportDraft, models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
		models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn,
	}
	// Every allowed (action, from) pair and who performs it. Anything not
	// in this table must be rejected.
	type key struct {
		a    Action
		from models.ReportStatus
	}
	allowed := map[key]struct {
		by Actor
		to models.ReportStatus
	}{
		{ActionSubmit, models.ReportDraft}:                 {reporter, models.ReportSubmitted},
		{ActionWithdraw, models.ReportDraft}:               {reporter, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportSubmitted}:           {reporter, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportUnderReview}:         {reporter, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportAwaitingResponse}:    {reporter, models.ReportWithdrawn},
		{ActionStartReview, models.ReportSubmitted}:        {adminUser, models.ReportUnderReview},
		{ActionStartReview, models.ReportAwaitingResponse}: {adminUser, models.ReportUnderReview},
		{ActionRequestInfo, models.ReportUnderReview}:      {adminUser, models.ReportAwaitingResponse},
		{ActionConfirm, models.ReportUnderReview}:          {adminUser, models.ReportConfirmed},
		{ActionNotSubstantiated, models.ReportUnderReview}: {adminUser, models.ReportNotSubstantiated},
		{ActionReopen, models.ReportConfirmed}:             {adminUser, models.ReportUnderReview},
		{ActionReopen, models.ReportNotSubstantiated}:      {adminUser, models.ReportUnderReview},
	}
	for a := range rules {
		if a == ActionDeclineReconsideration {
			continue // covered separately: depends on the pending request
		}
		for _, from := range all {
			want, ok := allowed[key{a, from}]
			actor := want.by
			if !ok {
				// Try with the most privileged plausible actor for the action.
				actor = adminUser
				if rules[a].by == byReporter {
					actor = reporter
				}
			}
			to, d := CheckAction(report(from), actor, a, "เหตุผล")
			if ok && (d != nil || to != want.to) {
				t.Errorf("%s from %s: want → %s, got %q denial=%v", a, from, want.to, to, d)
			}
			if !ok && d == nil {
				t.Errorf("%s from %s must be rejected, got → %s", a, from, to)
			}
		}
	}
}

func TestCannotSkipToConfirmed(t *testing.T) {
	for _, s := range []models.ReportStatus{models.ReportDraft, models.ReportSubmitted, models.ReportAwaitingResponse, models.ReportWithdrawn} {
		if _, d := CheckAction(report(s), adminUser, ActionConfirm, "ok"); d == nil {
			t.Errorf("confirm from %s must be rejected", s)
		}
	}
}

func TestReporterCannotReviewOwnReport(t *testing.T) {
	// An admin who filed the report is still not allowed to judge it.
	r := report(models.ReportUnderReview)
	r.ReporterID = adminOwner.ID
	for _, a := range []Action{ActionConfirm, ActionNotSubstantiated, ActionRequestInfo} {
		_, d := CheckAction(r, adminOwner, a, "ok")
		if d == nil || !d.Forbidden {
			t.Errorf("reporter-admin %s: want forbidden, got %v", a, d)
		}
	}
	// A different admin may.
	if _, d := CheckAction(r, adminUser, ActionConfirm, "ok"); d != nil {
		t.Fatalf("other admin confirm: %v", d)
	}
	// An instructor (the reporter) can never review.
	if _, d := CheckAction(report(models.ReportUnderReview), reporter, ActionConfirm, "ok"); d == nil || !d.Forbidden {
		t.Fatalf("instructor confirm: want forbidden, got %v", d)
	}
}

func TestStudentCannotChangeStatus(t *testing.T) {
	for a := range rules {
		for _, s := range []models.ReportStatus{models.ReportDraft, models.ReportSubmitted, models.ReportUnderReview, models.ReportConfirmed} {
			r := report(s)
			now := time.Now()
			r.ReconsiderationRequestedAt = &now
			if _, d := CheckAction(r, student, a, "x"); d == nil || !d.Forbidden {
				t.Errorf("student %s on %s: want forbidden, got %v", a, s, d)
			}
		}
	}
}

func TestOnlyReporterSubmitsOrWithdraws(t *testing.T) {
	if _, d := CheckAction(report(models.ReportDraft), otherInst, ActionSubmit, ""); d == nil || !d.Forbidden {
		t.Fatalf("other instructor submit: %v", d)
	}
	if _, d := CheckAction(report(models.ReportSubmitted), otherInst, ActionWithdraw, "x"); d == nil || !d.Forbidden {
		t.Fatalf("other instructor withdraw: %v", d)
	}
	if _, d := CheckAction(report(models.ReportSubmitted), adminUser, ActionWithdraw, "x"); d != nil {
		t.Fatalf("admin withdraw: %v", d)
	}
	if _, d := CheckAction(report(models.ReportDraft), adminUser, ActionSubmit, ""); d == nil {
		t.Fatal("admin must not submit someone else's draft")
	}
}

func TestReasonRequired(t *testing.T) {
	cases := map[Action]models.ReportStatus{
		ActionWithdraw: models.ReportSubmitted, ActionRequestInfo: models.ReportUnderReview,
		ActionNotSubstantiated: models.ReportUnderReview, ActionReopen: models.ReportConfirmed,
	}
	for a, s := range cases {
		actor := adminUser
		if a == ActionWithdraw {
			actor = reporter
		}
		if _, d := CheckAction(report(s), actor, a, ""); d == nil {
			t.Errorf("%s without reason must be rejected", a)
		}
	}
}

func TestStaffCannotReview(t *testing.T) {
	for a, rule := range rules {
		if rule.by != byReviewer {
			continue
		}
		for _, s := range rule.from {
			r := report(s)
			now := time.Now()
			r.ReconsiderationRequestedAt = &now
			if _, d := CheckAction(r, staffUser, a, "x"); d == nil || !d.Forbidden {
				t.Errorf("staff %s on %s: want forbidden, got %v", a, s, d)
			}
		}
	}
}

func TestConfirmWithoutReason(t *testing.T) {
	to, d := CheckAction(report(models.ReportUnderReview), adminUser, ActionConfirm, "")
	if d != nil {
		t.Fatalf("confirm without reason must be allowed: %v", d)
	}
	if to != models.ReportConfirmed {
		t.Fatalf("got %s, want %s", to, models.ReportConfirmed)
	}
}

func TestDeclineReconsiderationNeedsPendingRequest(t *testing.T) {
	r := report(models.ReportConfirmed)
	if _, d := CheckAction(r, adminUser, ActionDeclineReconsideration, "x"); d == nil {
		t.Fatal("decline without pending request must be rejected")
	}
	now := time.Now()
	r.ReconsiderationRequestedAt = &now
	to, d := CheckAction(r, adminUser, ActionDeclineReconsideration, "x")
	if d != nil || to != models.ReportConfirmed {
		t.Fatalf("decline: to=%s d=%v", to, d)
	}
}

func TestCanView(t *testing.T) {
	draft, sub, conf := report(models.ReportDraft), report(models.ReportSubmitted), report(models.ReportConfirmed)
	checks := []struct {
		name string
		r    models.LabBoyReport
		a    Actor
		want bool
	}{
		{"reporter sees draft", draft, reporter, true},
		{"student cannot see draft", draft, student, false},
		{"staff cannot see draft", draft, staffUser, false},
		{"admin sees draft", draft, adminUser, true},
		{"student sees own submitted", sub, student, true},
		{"other student never", sub, otherStu, false},
		{"other instructor never", sub, otherInst, false},
		{"staff cannot see pending", sub, staffUser, false},
		{"staff sees confirmed", conf, staffUser, true},
	}
	for _, c := range checks {
		if got := CanView(c.r, c.a); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}

func TestResponseKinds(t *testing.T) {
	if k, d := ResponseKindFor(report(models.ReportUnderReview), student, false); d != nil || k != models.ResponseExplanation {
		t.Fatalf("student explanation: %s %v", k, d)
	}
	if _, d := ResponseKindFor(report(models.ReportUnderReview), otherStu, false); d == nil || !d.Forbidden {
		t.Fatalf("other student: %v", d)
	}
	if _, d := ResponseKindFor(report(models.ReportUnderReview), student, true); d == nil {
		t.Fatal("reconsideration of an open report must be rejected")
	}
	if k, d := ResponseKindFor(report(models.ReportConfirmed), student, true); d != nil || k != models.ResponseReconsideration {
		t.Fatalf("reconsideration: %s %v", k, d)
	}
	if _, d := ResponseKindFor(report(models.ReportConfirmed), student, false); d == nil {
		t.Fatal("explanation after the decision must go through reconsideration")
	}
	if k, d := ResponseKindFor(report(models.ReportAwaitingResponse), reporter, false); d != nil || k != models.ResponseReporterInfo {
		t.Fatalf("reporter info: %s %v", k, d)
	}
	if _, d := ResponseKindFor(report(models.ReportUnderReview), staffUser, false); d == nil {
		t.Fatal("staff record decisions, not responses")
	}
}

func TestSafeFileName(t *testing.T) {
	for in, want := range map[string]string{
		"../../etc/passwd":    "passwd",
		`C:\fakepath\a"b.png`: "ab.png",
		"":                    "evidence",
		"ใบลงเวลา\x00.pdf":    "ใบลงเวลา.pdf",
	} {
		if got := safeFileName(in); got != want {
			t.Errorf("safeFileName(%q) = %q, want %q", in, got, want)
		}
	}
}
