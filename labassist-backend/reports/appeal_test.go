package reports

import (
	"testing"
	"time"

	"labassist/models"
)

var (
	today         = time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	blacklistedAt = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)
)

// blacklisted is an instructor's blacklisting of student, made on
// blacklistedAt and shown until untilDays after today.
func blacklisted(untilDays int) models.LabBoyReport {
	r := instReport(models.ReportConfirmed)
	at := blacklistedAt
	until := today.AddDate(0, 0, untilDays)
	r.BlacklistedAt, r.BlacklistUntil = &at, &until
	return r
}

func appeal(status models.PenaltyStatus) models.BlacklistAppeal {
	return models.BlacklistAppeal{ID: 9, ReportID: 1, StudentID: student.ID, BlacklistedAt: blacklistedAt, Status: status}
}

func TestCanAppealWithinFifteenDays(t *testing.T) {
	r := blacklisted(30)
	if d := CanAppeal(r, student, nil, blacklistedAt.Add(15*24*time.Hour), today); d != nil {
		t.Fatalf("on the 15th day: %v", d)
	}
	if d := CanAppeal(r, student, nil, blacklistedAt.Add(15*24*time.Hour+time.Minute), today); d == nil {
		t.Fatal("after 15 days must be rejected")
	}
}

func TestOnlyTheBlacklistedStudentAppeals(t *testing.T) {
	r := blacklisted(30)
	for _, who := range []Actor{otherStu, peer, courseInst, adminUser, staffUser} {
		if d := CanAppeal(r, who, nil, blacklistedAt, today); d == nil || !d.Forbidden {
			t.Errorf("%+v: want forbidden, got %v", who, d)
		}
	}
}

func TestAppealNeedsAnActiveBlacklist(t *testing.T) {
	for _, s := range []models.ReportStatus{models.ReportSubmitted, models.ReportNotSubstantiated, models.ReportWithdrawn} {
		if d := CanAppeal(instReport(s), student, nil, blacklistedAt, today); d == nil {
			t.Errorf("appeal on %s must be rejected", s)
		}
	}
	if d := CanAppeal(blacklisted(-1), student, nil, blacklistedAt, today); d == nil {
		t.Fatal("appeal on an ended blacklist must be rejected")
	}
}

func TestNoSecondAppeal(t *testing.T) {
	r := blacklisted(30)
	for _, s := range []models.PenaltyStatus{
		models.PenaltyAppealPending, models.PenaltyAppealMoreInfo, models.PenaltyAppealRejected,
	} {
		if d := CanAppeal(r, student, []models.BlacklistAppeal{appeal(s)}, blacklistedAt, today); d == nil {
			t.Errorf("with a %s appeal a new one must be rejected", s)
		}
	}
	// Blacklisted again after a reopen: the old, decided appeal does not count.
	old := appeal(models.PenaltyAppealRejected)
	old.BlacklistedAt = blacklistedAt.Add(-48 * time.Hour)
	if d := CanAppeal(r, student, []models.BlacklistAppeal{old}, blacklistedAt, today); d != nil {
		t.Fatalf("new blacklisting: %v", d)
	}
}

func TestAppealDecisions(t *testing.T) {
	cases := []struct {
		d    AppealDecision
		from models.PenaltyStatus
		to   models.PenaltyStatus
		ok   bool
	}{
		{AppealApprove, models.PenaltyAppealPending, models.PenaltyAppealApproved, true},
		{AppealApprove, models.PenaltyAppealMoreInfo, models.PenaltyAppealApproved, true},
		{AppealReject, models.PenaltyAppealPending, models.PenaltyAppealRejected, true},
		{AppealReject, models.PenaltyAppealMoreInfo, models.PenaltyAppealRejected, true},
		{AppealRequestInfo, models.PenaltyAppealPending, models.PenaltyAppealMoreInfo, true},
		{AppealRequestInfo, models.PenaltyAppealMoreInfo, "", false},
		{AppealApprove, models.PenaltyAppealApproved, "", false},
		{AppealReject, models.PenaltyAppealRejected, "", false},
		{AppealApprove, models.PenaltyAppealRejected, "", false},
	}
	for _, c := range cases {
		to, _, d := CheckAppealDecision(appeal(c.from), courseInst, c.d, "หมายเหตุ")
		if c.ok && (d != nil || to != c.to) {
			t.Errorf("%s from %s: want %s, got %s %v", c.d, c.from, c.to, to, d)
		}
		if !c.ok && d == nil {
			t.Errorf("%s from %s must be rejected", c.d, c.from)
		}
	}
	if _, _, d := CheckAppealDecision(appeal(models.PenaltyAppealPending), courseInst, AppealApprove, ""); d == nil {
		t.Fatal("a decision without a note must be rejected")
	}
	for _, who := range []Actor{otherInst, staffUser, student, peer} {
		if _, _, d := CheckAppealDecision(appeal(models.PenaltyAppealPending), who, AppealApprove, "x"); d == nil || !d.Forbidden {
			t.Errorf("%+v deciding: want forbidden, got %v", who, d)
		}
	}
	if _, _, d := CheckAppealDecision(appeal(models.PenaltyAppealPending), adminUser, AppealReject, "x"); d != nil {
		t.Fatalf("admin decide: %v", d)
	}
}

func TestAppealInfoOnlyWhenAsked(t *testing.T) {
	if d := CanAddAppealInfo(appeal(models.PenaltyAppealMoreInfo), student); d != nil {
		t.Fatalf("student info: %v", d)
	}
	if d := CanAddAppealInfo(appeal(models.PenaltyAppealPending), student); d == nil {
		t.Fatal("no edits while the appeal is pending")
	}
	if d := CanAddAppealInfo(appeal(models.PenaltyAppealMoreInfo), otherStu); d == nil || !d.Forbidden {
		t.Fatalf("other student: %v", d)
	}
}

func TestAppealHiddenFromStudentReporter(t *testing.T) {
	r := peerReport(models.ReportConfirmed)
	if CanViewAppeal(r, peer) || CanViewAppeal(r, otherInst) || CanViewAppeal(r, staffUser) {
		t.Fatal("appeal visible to someone outside it")
	}
	if !CanViewAppeal(r, student) || !CanViewAppeal(r, courseInst) || !CanViewAppeal(r, adminUser) {
		t.Fatal("appeal hidden from someone in it")
	}
}

func TestPenaltyStatus(t *testing.T) {
	r := blacklisted(30)
	if s := models.PenaltyOf(r, nil); s != models.PenaltyBlacklisted {
		t.Fatalf("no appeal: %s", s)
	}
	pending := appeal(models.PenaltyAppealPending)
	if s := models.PenaltyOf(r, &pending); s != models.PenaltyAppealPending {
		t.Fatalf("pending: %s", s)
	}
	lifted := instReport(models.ReportNotSubstantiated)
	lifted.BlacklistedAt = r.BlacklistedAt
	approved := appeal(models.PenaltyAppealApproved)
	if s := models.PenaltyOf(lifted, &approved); s != models.PenaltyAppealApproved {
		t.Fatalf("approved: %s", s)
	}
	if s := models.PenaltyOf(instReport(models.ReportSubmitted), nil); s != "" {
		t.Fatalf("never blacklisted: %s", s)
	}
}
