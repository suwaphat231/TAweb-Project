package reports

import (
	"time"

	"labassist/models"
)

// AppealWindow is how long after being blacklisted a student may appeal.
const AppealWindow = 15 * 24 * time.Hour

// DefaultBlacklistDays is how long the "เคยโดนรีพอร์ท" flag shows when the
// instructor does not pick an end date; MaxBlacklistDays caps a chosen one.
const (
	DefaultBlacklistDays = 180
	MaxBlacklistDays     = 730
)

// AppealDecision is what the course's instructor decides on an appeal.
type AppealDecision string

const (
	AppealApprove     AppealDecision = "approve"
	AppealReject      AppealDecision = "reject"
	AppealRequestInfo AppealDecision = "request_info"
)

var appealDecisionRules = map[AppealDecision]struct {
	from []models.PenaltyStatus
	to   models.PenaltyStatus
	kind models.AppealEventKind
}{
	AppealApprove: {
		from: []models.PenaltyStatus{models.PenaltyAppealPending, models.PenaltyAppealMoreInfo},
		to:   models.PenaltyAppealApproved, kind: models.AppealEventApprove,
	},
	AppealReject: {
		from: []models.PenaltyStatus{models.PenaltyAppealPending, models.PenaltyAppealMoreInfo},
		to:   models.PenaltyAppealRejected, kind: models.AppealEventReject,
	},
	AppealRequestInfo: {
		from: []models.PenaltyStatus{models.PenaltyAppealPending},
		to:   models.PenaltyAppealMoreInfo, kind: models.AppealEventRequestInfo,
	},
}

// AppealDeadline is the last moment the student may appeal r.
func AppealDeadline(r models.LabBoyReport) time.Time {
	return r.BlacklistedSince().Add(AppealWindow)
}

// BlacklistActive is whether r is a blacklisting whose flag still shows on
// day today (a date in Asia/Bangkok, at midnight UTC like BlacklistUntil).
func BlacklistActive(r models.LabBoyReport, today time.Time) bool {
	return r.Status == models.ReportConfirmed && (r.BlacklistUntil == nil || !r.BlacklistUntil.Before(today))
}

// CanAppeal decides whether actor may appeal r now. appeals are the
// existing appeals against r, any status.
func CanAppeal(r models.LabBoyReport, actor Actor, appeals []models.BlacklistAppeal, now, today time.Time) *Denial {
	if !actor.isStudent() || r.StudentID != actor.ID {
		return &Denial{Forbidden: true, Message: "ยื่นอุทธรณ์ได้เฉพาะนักศึกษาที่ถูก Blacklist"}
	}
	if r.Status != models.ReportConfirmed {
		return &Denial{Message: "ยื่นอุทธรณ์ได้เฉพาะรายงานที่ถูก Blacklist อยู่"}
	}
	since := r.BlacklistedSince()
	for _, a := range appeals {
		if !a.BlacklistedAt.Equal(since) && !a.Status.Open() {
			continue // an appeal against an earlier blacklisting of this report
		}
		if a.Status.Open() {
			return &Denial{Message: "มีคำอุทธรณ์ที่รอพิจารณาอยู่ ไม่สามารถยื่นซ้ำได้"}
		}
		return &Denial{Message: "ยื่นอุทธรณ์ได้ครั้งเดียวต่อการ Blacklist หนึ่งครั้ง"}
	}
	if !BlacklistActive(r, today) {
		return &Denial{Message: "Blacklist นี้สิ้นสุดแล้ว"}
	}
	if now.After(AppealDeadline(r)) {
		return &Denial{Message: "พ้นกำหนดยื่นอุทธรณ์ 15 วันนับจากวันที่ถูก Blacklist แล้ว"}
	}
	return nil
}

// CanViewAppeal: the appealing student, the course's instructor and admin —
// never a fellow student who filed the report.
func CanViewAppeal(r models.LabBoyReport, actor Actor) bool {
	return actor.isReviewer() || (actor.isStudent() && r.StudentID == actor.ID)
}

// CanAddAppealInfo: the student, only while the instructor asked for more.
func CanAddAppealInfo(a models.BlacklistAppeal, actor Actor) *Denial {
	if !actor.isStudent() || a.StudentID != actor.ID {
		return &Denial{Forbidden: true, Message: "เพิ่มข้อมูลได้เฉพาะนักศึกษาผู้ยื่นอุทธรณ์"}
	}
	if a.Status != models.PenaltyAppealMoreInfo {
		return &Denial{Message: "เพิ่มข้อมูลได้เฉพาะเมื่ออาจารย์ขอข้อมูลเพิ่มเติม"}
	}
	return nil
}

// CheckAppealDecision decides whether actor may decide a, and returns the
// status and event kind it leads to. actor must have ManagesCourse filled in
// for the appeal's report.
func CheckAppealDecision(a models.BlacklistAppeal, actor Actor, d AppealDecision, note string) (models.PenaltyStatus, models.AppealEventKind, *Denial) {
	rule, ok := appealDecisionRules[d]
	if !ok {
		return "", "", &Denial{Message: "ไม่รู้จักการตัดสินนี้"}
	}
	if !actor.isReviewer() {
		return "", "", &Denial{Forbidden: true, Message: "เฉพาะอาจารย์ประจำวิชาเท่านั้นที่พิจารณาอุทธรณ์ได้"}
	}
	if !penaltyIn(a.Status, rule.from) {
		return "", "", &Denial{Message: "ไม่สามารถทำรายการนี้ในสถานะปัจจุบันของอุทธรณ์ได้"}
	}
	if note == "" {
		return "", "", &Denial{Message: "กรุณาระบุหมายเหตุ"}
	}
	return rule.to, rule.kind, nil
}

func penaltyIn(s models.PenaltyStatus, list []models.PenaltyStatus) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
