package reports

import "labassist/models"

// Actor is the logged-in user as the auth middleware resolved it — never
// anything the client sent in the body.
type Actor struct {
	ID   uint
	Role string
	// ManagesCourse is whether the actor teaches the course of the report
	// being checked (always true for admin). The handler fills it in per
	// report; there is no staff step — the course's instructor decides.
	ManagesCourse bool
}

func (a Actor) isAdmin() bool    { return a.Role == string(models.RoleAdmin) }
func (a Actor) isStudent() bool  { return a.Role == string(models.RoleStudent) }
func (a Actor) isReviewer() bool { return a.ManagesCourse || a.isAdmin() }

// Action is a step a user can take on a report.
type Action string

const (
	ActionSubmit           Action = "submit"
	ActionBlacklist        Action = "blacklist"
	ActionWithdraw         Action = "withdraw"
	ActionRequestInfo      Action = "request_info"
	ActionConfirm          Action = "confirm"
	ActionNotSubstantiated Action = "not_substantiated"
	ActionReopen           Action = "reopen"
)

type actorKind int

const (
	byReporter actorKind = iota
	byReviewer
)

type transitionRule struct {
	from []models.ReportStatus
	to   models.ReportStatus // empty = status stays the same
	by   actorKind
	// studentReporter / instructorReporter limit a reporter action to
	// reports filed by a student (sent to the instructor) or by the
	// course's own instructor (who decides on the spot).
	studentReporter    bool
	instructorReporter bool
	needsReason        bool
	review             *models.ReviewDecision
}

func decision(d models.ReviewDecision) *models.ReviewDecision { return &d }

// open statuses are the ones a report can still be withdrawn from or
// commented on — the instructor has not decided yet.
var openStatuses = []models.ReportStatus{
	models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
}

// rules is the whole state machine. Anything not listed here is rejected,
// which is what stops e.g. a student blacklisting someone or DRAFT → CONFIRMED
// on a student's report.
//
// Two ways in, no staff step:
//   - a Lab Boy reports a fellow Lab Boy: DRAFT → SUBMITTED, then the
//     course's instructor blacklists (CONFIRMED) or dismisses it.
//   - the course's instructor blacklists directly: DRAFT → CONFIRMED.
var rules = map[Action]transitionRule{
	ActionSubmit: {
		from: []models.ReportStatus{models.ReportDraft}, to: models.ReportSubmitted, by: byReporter, studentReporter: true,
	},
	ActionBlacklist: {
		from: []models.ReportStatus{models.ReportDraft}, to: models.ReportConfirmed, by: byReporter, instructorReporter: true,
		review: decision(models.DecisionConfirm),
	},
	ActionWithdraw: {
		from: append([]models.ReportStatus{models.ReportDraft}, openStatuses...), to: models.ReportWithdrawn,
		by: byReporter, needsReason: true,
	},
	ActionRequestInfo: {
		from: []models.ReportStatus{models.ReportSubmitted, models.ReportUnderReview}, to: models.ReportAwaitingResponse,
		by: byReviewer, needsReason: true, review: decision(models.DecisionRequestInfo),
	},
	ActionConfirm: {
		from: openStatuses, to: models.ReportConfirmed,
		by: byReviewer, needsReason: true, review: decision(models.DecisionConfirm),
	},
	ActionNotSubstantiated: {
		from: openStatuses, to: models.ReportNotSubstantiated,
		by: byReviewer, needsReason: true, review: decision(models.DecisionNotSubstantiated),
	},
	ActionReopen: {
		// Correcting a final decision goes back through review instead of
		// editing the old result — the earlier decision stays on record.
		from: []models.ReportStatus{models.ReportConfirmed, models.ReportNotSubstantiated}, to: models.ReportUnderReview,
		by: byReviewer, needsReason: true, review: decision(models.DecisionReopen),
	},
}

// Denial explains why an action is not allowed. Forbidden means the actor
// may never do it; otherwise the report is just in the wrong state.
type Denial struct {
	Forbidden bool
	Message   string
}

func (d *Denial) Error() string { return d.Message }

// CheckAction decides whether actor may take action on r right now, and
// returns the status it leads to. It is the single gate every status change
// goes through on the server.
func CheckAction(r models.LabBoyReport, actor Actor, action Action, reason string) (models.ReportStatus, *Denial) {
	rule, ok := rules[action]
	if !ok {
		return "", &Denial{Message: "ไม่รู้จักการดำเนินการนี้"}
	}
	switch rule.by {
	case byReporter:
		// Admin may withdraw on the reporter's behalf (e.g. a report filed
		// against the wrong student), but only the reporter submits.
		if r.ReporterID != actor.ID && !(action == ActionWithdraw && actor.isAdmin()) {
			return "", &Denial{Forbidden: true, Message: "เฉพาะผู้รายงานเท่านั้นที่ทำรายการนี้ได้"}
		}
		if rule.studentReporter && !r.FiledByStudent() {
			return "", &Denial{Forbidden: true, Message: "รายงานของอาจารย์ไม่ต้องส่งตรวจสอบ ใช้ปุ่ม Blacklist แทน"}
		}
		if rule.instructorReporter && (r.FiledByStudent() || !actor.isReviewer()) {
			return "", &Denial{Forbidden: true, Message: "เฉพาะอาจารย์ประจำวิชาเท่านั้นที่ Blacklist ได้"}
		}
	case byReviewer:
		if !actor.isReviewer() {
			return "", &Denial{Forbidden: true, Message: "เฉพาะอาจารย์ประจำวิชาเท่านั้น"}
		}
	}
	if !statusIn(r.Status, rule.from) {
		return "", &Denial{Message: "ไม่สามารถทำรายการนี้ในสถานะปัจจุบันของรายงานได้"}
	}
	if rule.needsReason && reason == "" {
		return "", &Denial{Message: "กรุณาระบุเหตุผล"}
	}
	to := rule.to
	if to == "" {
		to = r.Status
	}
	return to, nil
}

func statusIn(s models.ReportStatus, list []models.ReportStatus) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// AllowedActions lists what the actor can do on r right now, so the UI can
// show the right buttons. The server still re-checks every request.
func AllowedActions(r models.LabBoyReport, actor Actor) []Action {
	out := make([]Action, 0)
	for _, a := range []Action{
		ActionSubmit, ActionBlacklist, ActionConfirm, ActionNotSubstantiated, ActionRequestInfo,
		ActionReopen, ActionWithdraw,
	} {
		if _, d := CheckAction(r, actor, a, "x"); d == nil {
			out = append(out, a)
		}
	}
	return out
}

// CanView decides who may open a report (and its evidence): the reporter,
// the course's instructor and the reported student once it is no longer a
// draft, and admin. Staff are not part of this workflow.
func CanView(r models.LabBoyReport, actor Actor) bool {
	switch {
	case actor.isAdmin():
		return true
	case r.ReporterID == actor.ID:
		return true
	case r.Status == models.ReportDraft:
		return false
	case actor.ManagesCourse:
		return true
	case actor.isStudent():
		return r.StudentID == actor.ID
	}
	return false
}

// HidesReporter is whether actor must not learn who filed r: the reported
// student never sees which fellow Lab Boy reported them.
func HidesReporter(r models.LabBoyReport, actor Actor) bool {
	return r.FiledByStudent() && r.StudentID == actor.ID && r.ReporterID != actor.ID
}

// HidesStudentSide is whether actor is a student reporter, who sees the
// outcome of their report but not the reported student's explanations.
func HidesStudentSide(r models.LabBoyReport, actor Actor) bool {
	return r.FiledByStudent() && r.ReporterID == actor.ID
}

// CanEditDraft: only the reporter, only while it is a draft.
func CanEditDraft(r models.LabBoyReport, actor Actor) bool {
	return r.ReporterID == actor.ID && r.Status == models.ReportDraft
}

// CanAddEvidence: the reporter while the report is not yet decided.
// Students attach their files to a response instead.
func CanAddEvidence(r models.LabBoyReport, actor Actor) bool {
	return r.ReporterID == actor.ID && (r.Status == models.ReportDraft || statusIn(r.Status, openStatuses))
}

// EvidenceStatuses is what CanAddEvidence allows, for the database guard.
func EvidenceStatuses() []models.ReportStatus {
	return append([]models.ReportStatus{models.ReportDraft}, openStatuses...)
}

// ResponseKindFor works out which kind of response actor may post on r, or
// a denial. The student explains while the report is open — once
// blacklisted they appeal instead (appeal.go); the reporter adds information
// while it is open.
func ResponseKindFor(r models.LabBoyReport, actor Actor) (models.ReportResponseKind, *Denial) {
	switch {
	case actor.isStudent() && r.StudentID == actor.ID:
		if !statusIn(r.Status, openStatuses) {
			return "", &Denial{Message: "ไม่สามารถส่งคำชี้แจงในสถานะปัจจุบันของรายงานได้ หากถูก Blacklist ให้ยื่นอุทธรณ์แทน"}
		}
		return models.ResponseExplanation, nil
	case r.ReporterID == actor.ID:
		if !statusIn(r.Status, openStatuses) {
			return "", &Denial{Message: "ไม่สามารถเพิ่มข้อมูลในสถานะปัจจุบันของรายงานได้"}
		}
		return models.ResponseReporterInfo, nil
	}
	return "", &Denial{Forbidden: true, Message: "forbidden"}
}
