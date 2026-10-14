package reports

import (
	"testing"

	"labassist/models"
)

var (
	courseInst = Actor{ID: 10, Role: "instructor", ManagesCourse: true}
	otherInst  = Actor{ID: 11, Role: "instructor"}
	student    = Actor{ID: 20, Role: "student"} // the reported Lab Boy
	otherStu   = Actor{ID: 21, Role: "student"}
	peer       = Actor{ID: 22, Role: "student"} // fellow Lab Boy who reports
	staffUser  = Actor{ID: 30, Role: "staff"}
	adminUser  = Actor{ID: 40, Role: "admin"}
)

var allStatuses = []models.ReportStatus{
	models.ReportDraft, models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
	models.ReportConfirmed, models.ReportNotSubstantiated, models.ReportWithdrawn,
}

// instReport is filed by the course's instructor; peerReport by a fellow Lab Boy.
func instReport(status models.ReportStatus) models.LabBoyReport {
	return models.LabBoyReport{ID: 1, ReporterID: courseInst.ID, ReporterRole: "instructor", StudentID: student.ID, Status: status}
}

func peerReport(status models.ReportStatus) models.LabBoyReport {
	return models.LabBoyReport{ID: 2, ReporterID: peer.ID, ReporterRole: "student", StudentID: student.ID, Status: status}
}

type step struct {
	a    Action
	from models.ReportStatus
}

type outcome struct {
	by Actor
	to models.ReportStatus
}

// checkMachine asserts that exactly the listed (action, from) pairs are
// allowed for reports built by mk; anything else is tried with the most
// plausible actor and must be rejected.
func checkMachine(t *testing.T, name string, mk func(models.ReportStatus) models.LabBoyReport, reporter Actor, allowed map[step]outcome) {
	t.Helper()
	for a := range rules {
		for _, from := range allStatuses {
			want, ok := allowed[step{a, from}]
			actor := want.by
			if !ok {
				actor = courseInst
				if rules[a].by == byReporter {
					actor = reporter
				}
			}
			to, d := CheckAction(mk(from), actor, a, "เหตุผล")
			if ok && (d != nil || to != want.to) {
				t.Errorf("%s: %s from %s: want → %s, got %q denial=%v", name, a, from, want.to, to, d)
			}
			if !ok && d == nil {
				t.Errorf("%s: %s from %s must be rejected, got → %s", name, a, from, to)
			}
		}
	}
}

func TestStateMachinePeerReport(t *testing.T) {
	checkMachine(t, "peer", peerReport, peer, map[step]outcome{
		{ActionSubmit, models.ReportDraft}:                      {peer, models.ReportSubmitted},
		{ActionWithdraw, models.ReportDraft}:                    {peer, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportSubmitted}:                {peer, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportUnderReview}:              {peer, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportAwaitingResponse}:         {peer, models.ReportWithdrawn},
		{ActionRequestInfo, models.ReportSubmitted}:             {courseInst, models.ReportAwaitingResponse},
		{ActionRequestInfo, models.ReportUnderReview}:           {courseInst, models.ReportAwaitingResponse},
		{ActionConfirm, models.ReportSubmitted}:                 {courseInst, models.ReportConfirmed},
		{ActionConfirm, models.ReportUnderReview}:               {courseInst, models.ReportConfirmed},
		{ActionConfirm, models.ReportAwaitingResponse}:          {courseInst, models.ReportConfirmed},
		{ActionNotSubstantiated, models.ReportSubmitted}:        {courseInst, models.ReportNotSubstantiated},
		{ActionNotSubstantiated, models.ReportUnderReview}:      {courseInst, models.ReportNotSubstantiated},
		{ActionNotSubstantiated, models.ReportAwaitingResponse}: {courseInst, models.ReportNotSubstantiated},
		{ActionReopen, models.ReportConfirmed}:                  {courseInst, models.ReportUnderReview},
		{ActionReopen, models.ReportNotSubstantiated}:           {courseInst, models.ReportUnderReview},
	})
}

func TestStateMachineInstructorReport(t *testing.T) {
	checkMachine(t, "instructor", instReport, courseInst, map[step]outcome{
		{ActionBlacklist, models.ReportDraft}:                   {courseInst, models.ReportConfirmed},
		{ActionWithdraw, models.ReportDraft}:                    {courseInst, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportSubmitted}:                {courseInst, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportUnderReview}:              {courseInst, models.ReportWithdrawn},
		{ActionWithdraw, models.ReportAwaitingResponse}:         {courseInst, models.ReportWithdrawn},
		{ActionRequestInfo, models.ReportSubmitted}:             {courseInst, models.ReportAwaitingResponse},
		{ActionRequestInfo, models.ReportUnderReview}:           {courseInst, models.ReportAwaitingResponse},
		{ActionConfirm, models.ReportSubmitted}:                 {courseInst, models.ReportConfirmed},
		{ActionConfirm, models.ReportUnderReview}:               {courseInst, models.ReportConfirmed},
		{ActionConfirm, models.ReportAwaitingResponse}:          {courseInst, models.ReportConfirmed},
		{ActionNotSubstantiated, models.ReportSubmitted}:        {courseInst, models.ReportNotSubstantiated},
		{ActionNotSubstantiated, models.ReportUnderReview}:      {courseInst, models.ReportNotSubstantiated},
		{ActionNotSubstantiated, models.ReportAwaitingResponse}: {courseInst, models.ReportNotSubstantiated},
		{ActionReopen, models.ReportConfirmed}:                  {courseInst, models.ReportUnderReview},
		{ActionReopen, models.ReportNotSubstantiated}:           {courseInst, models.ReportUnderReview},
	})
}

func TestOnlyCourseInstructorDecides(t *testing.T) {
	for _, a := range []Action{ActionConfirm, ActionNotSubstantiated, ActionRequestInfo} {
		for _, who := range []Actor{otherInst, staffUser, peer, student, otherStu} {
			if _, d := CheckAction(peerReport(models.ReportSubmitted), who, a, "ok"); d == nil || !d.Forbidden {
				t.Errorf("%s by %+v: want forbidden, got %v", a, who, d)
			}
		}
	}
	if _, d := CheckAction(peerReport(models.ReportSubmitted), adminUser, ActionConfirm, "ok"); d != nil {
		t.Fatalf("admin confirm: %v", d)
	}
}

func TestStudentCannotBlacklist(t *testing.T) {
	// A student reporter can only send the report to the instructor.
	if _, d := CheckAction(peerReport(models.ReportDraft), peer, ActionBlacklist, ""); d == nil || !d.Forbidden {
		t.Fatalf("student blacklist: want forbidden, got %v", d)
	}
	// An instructor who no longer teaches the course cannot either.
	r := instReport(models.ReportDraft)
	r.ReporterID = otherInst.ID
	if _, d := CheckAction(r, otherInst, ActionBlacklist, ""); d == nil || !d.Forbidden {
		t.Fatalf("non-teaching instructor blacklist: want forbidden, got %v", d)
	}
	// Blacklisting needs no extra reason; the report itself is the reason.
	if to, d := CheckAction(instReport(models.ReportDraft), courseInst, ActionBlacklist, ""); d != nil || to != models.ReportConfirmed {
		t.Fatalf("instructor blacklist: to=%s d=%v", to, d)
	}
}

func TestReportedStudentCannotChangeStatus(t *testing.T) {
	for a := range rules {
		for _, s := range []models.ReportStatus{models.ReportDraft, models.ReportSubmitted, models.ReportUnderReview, models.ReportConfirmed} {
			for _, mk := range []func(models.ReportStatus) models.LabBoyReport{instReport, peerReport} {
				r := mk(s)
				if _, d := CheckAction(r, student, a, "x"); d == nil || !d.Forbidden {
					t.Errorf("student %s on %s: want forbidden, got %v", a, s, d)
				}
			}
		}
	}
}

func TestOnlyReporterSubmitsOrWithdraws(t *testing.T) {
	if _, d := CheckAction(peerReport(models.ReportDraft), otherStu, ActionSubmit, ""); d == nil || !d.Forbidden {
		t.Fatalf("other student submit: %v", d)
	}
	if _, d := CheckAction(peerReport(models.ReportSubmitted), courseInst, ActionWithdraw, "x"); d == nil || !d.Forbidden {
		t.Fatalf("instructor withdraw of a student's report: %v", d)
	}
	if _, d := CheckAction(peerReport(models.ReportSubmitted), adminUser, ActionWithdraw, "x"); d != nil {
		t.Fatalf("admin withdraw: %v", d)
	}
	if _, d := CheckAction(peerReport(models.ReportDraft), adminUser, ActionSubmit, ""); d == nil {
		t.Fatal("admin must not submit someone else's draft")
	}
}

func TestReasonRequired(t *testing.T) {
	cases := map[Action]models.ReportStatus{
		ActionWithdraw: models.ReportSubmitted, ActionRequestInfo: models.ReportUnderReview,
		ActionConfirm: models.ReportUnderReview, ActionNotSubstantiated: models.ReportUnderReview,
		ActionReopen: models.ReportConfirmed,
	}
	for a, s := range cases {
		actor := courseInst
		if a == ActionWithdraw {
			actor = peer
		}
		if _, d := CheckAction(peerReport(s), actor, a, ""); d == nil {
			t.Errorf("%s without reason must be rejected", a)
		}
	}
}

func TestCanView(t *testing.T) {
	draft, sub := peerReport(models.ReportDraft), peerReport(models.ReportSubmitted)
	checks := []struct {
		name string
		r    models.LabBoyReport
		a    Actor
		want bool
	}{
		{"reporter sees draft", draft, peer, true},
		{"student cannot see draft", draft, student, false},
		{"instructor cannot see a student's draft", draft, courseInst, false},
		{"admin sees draft", draft, adminUser, true},
		{"student sees own submitted", sub, student, true},
		{"course instructor sees submitted", sub, courseInst, true},
		{"other student never", sub, otherStu, false},
		{"other instructor never", sub, otherInst, false},
		{"staff never", sub, staffUser, false},
	}
	for _, c := range checks {
		if got := CanView(c.r, c.a); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}

func TestReporterHiddenFromReportedStudent(t *testing.T) {
	r := peerReport(models.ReportSubmitted)
	if !HidesReporter(r, student) {
		t.Fatal("reported student must not see the fellow student who reported")
	}
	if HidesReporter(r, courseInst) || HidesReporter(r, peer) {
		t.Fatal("instructor and reporter see the reporter")
	}
	if HidesReporter(instReport(models.ReportConfirmed), student) {
		t.Fatal("an instructor's blacklist names the instructor")
	}
	if !HidesStudentSide(r, peer) || HidesStudentSide(r, courseInst) {
		t.Fatal("only a student reporter is kept from the reported student's explanations")
	}
}

func TestResponseKinds(t *testing.T) {
	if k, d := ResponseKindFor(peerReport(models.ReportUnderReview), student); d != nil || k != models.ResponseExplanation {
		t.Fatalf("student explanation: %s %v", k, d)
	}
	if _, d := ResponseKindFor(peerReport(models.ReportUnderReview), otherStu); d == nil || !d.Forbidden {
		t.Fatalf("other student: %v", d)
	}
	if _, d := ResponseKindFor(instReport(models.ReportConfirmed), student); d == nil {
		t.Fatal("once blacklisted the student appeals instead of explaining")
	}
	if k, d := ResponseKindFor(peerReport(models.ReportAwaitingResponse), peer); d != nil || k != models.ResponseReporterInfo {
		t.Fatalf("reporter info: %s %v", k, d)
	}
	if _, d := ResponseKindFor(peerReport(models.ReportUnderReview), courseInst); d == nil {
		t.Fatal("the instructor records decisions, not responses")
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
