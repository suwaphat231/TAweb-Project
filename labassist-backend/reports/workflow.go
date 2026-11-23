package reports

import "labassist/models"

// Actor is the logged-in user as the auth middleware resolved it — never
// anything the client sent in the body.
type Actor struct {
	ID   uint
	Role string
	// CourseInstructor is set by the handler, per report, when the actor
	// teaches the report's course. Only then may they review it.
	CourseInstructor bool
}

func (a Actor) isAdmin() bool      { return a.Role == string(models.RoleAdmin) }
func (a Actor) isInstructor() bool { return a.Role == string(models.RoleInstructor) }
func (a Actor) isStudent() bool    { return a.Role == string(models.RoleStudent) }

// Action is a step a user can take on a report.
//
// A report an instructor files takes effect (CONFIRMED) as soon as they
// submit it. A report a student sends in about another Lab Boy of the same
// course starts SUBMITTED and has no effect until the course's instructor
// confirms it — or rejects it, with a reason. Admin may only look.
type Action string

const (
	ActionSubmit           Action = "submit"
	ActionWithdraw         Action = "withdraw"
	ActionConfirm          Action = "confirm"
	ActionNotSubstantiated Action = "not_substantiated"
)

type actorKind int

const (
	byReporter actorKind = iota
	byReviewer
)

type transitionRule struct {
	from        []models.ReportStatus
	to          models.ReportStatus
	by          actorKind
	needsReason bool
	review      *models.ReviewDecision
}

func decision(d models.ReviewDecision) *models.ReviewDecision { return &d }

// openStatuses are reports waiting for a decision. New student reports wait
// in SUBMITTED; the other two only exist on reports from before the review
// step was removed.
var openStatuses = []models.ReportStatus{
	models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
}

// rules is the whole state machine. Anything not listed here is rejected.
var rules = map[Action]transitionRule{
	ActionSubmit: {
		// Only instructors have drafts; students send in directly.
		from: []models.ReportStatus{models.ReportDraft}, to: models.ReportConfirmed, by: byReporter,
	},
	ActionWithdraw: {
		from:        append([]models.ReportStatus{models.ReportDraft, models.ReportConfirmed}, openStatuses...),
		to:          models.ReportWithdrawn,
		by:          byReporter,
		needsReason: true,
	},
	ActionConfirm: {
		from: []models.ReportStatus{models.ReportSubmitted}, to: models.ReportConfirmed,
		by: byReviewer, review: decision(models.DecisionConfirm),
	},
	ActionNotSubstantiated: {
		from: []models.ReportStatus{models.ReportSubmitted}, to: models.ReportNotSubstantiated,
		by: byReviewer, needsReason: true, review: decision(models.DecisionNotSubstantiated),
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
		if r.ReporterID != actor.ID {
			return "", &Denial{Forbidden: true, Message: "เฉพาะผู้รายงานเท่านั้นที่ทำรายการนี้ได้"}
		}
		// A student may take back a report only while it is still waiting;
		// once the instructor has decided, the decision stands.
		if actor.isStudent() && r.Status != models.ReportSubmitted {
			return "", &Denial{Message: "ถอนรายงานได้เฉพาะระหว่างรออาจารย์ตรวจสอบ"}
		}
	case byReviewer:
		if !actor.isInstructor() || !actor.CourseInstructor || r.ReporterID == actor.ID || r.ReporterRole != string(models.RoleStudent) {
			return "", &Denial{Forbidden: true, Message: "พิจารณารายงานได้เฉพาะอาจารย์ผู้สอนของรายวิชานั้น"}
		}
	}
	if !statusIn(r.Status, rule.from) {
		return "", &Denial{Message: "ไม่สามารถทำรายการนี้ในสถานะปัจจุบันของรายงานได้"}
	}
	if rule.needsReason && reason == "" {
		return "", &Denial{Message: "กรุณาระบุเหตุผล"}
	}
	return rule.to, nil
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
	for _, a := range []Action{ActionSubmit, ActionWithdraw, ActionConfirm, ActionNotSubstantiated} {
		if _, d := CheckAction(r, actor, a, "x"); d == nil {
			out = append(out, a)
		}
	}
	return out
}

// CanView decides who may open a report (and its evidence): whoever filed
// it, admin (read-only), and — for a report a student sent in — the
// instructors of its course, who review it. Other instructors learn a
// student was reported only through the applicant list (ConfirmedHistory).
// The reported student never sees reports, nor who filed them.
func CanView(r models.LabBoyReport, actor Actor) bool {
	switch {
	case actor.isAdmin():
		return true
	case r.ReporterID == actor.ID:
		return true
	case actor.isInstructor():
		return actor.CourseInstructor && r.ReporterRole == string(models.RoleStudent) && r.Status != models.ReportDraft
	}
	return false
}

// CanEditDraft: only the reporter, only while it is a draft.
func CanEditDraft(r models.LabBoyReport, actor Actor) bool {
	return r.ReporterID == actor.ID && r.Status == models.ReportDraft
}

// CanAddEvidence: the reporter, while the report is a draft or in force.
func CanAddEvidence(r models.LabBoyReport, actor Actor) bool {
	// Students send a report in one go, without attachments.
	return r.ReporterID == actor.ID && !actor.isStudent() && statusIn(r.Status, EvidenceStatuses())
}

// EvidenceStatuses is what CanAddEvidence allows, for the database guard.
func EvidenceStatuses() []models.ReportStatus {
	return append([]models.ReportStatus{models.ReportDraft, models.ReportConfirmed}, openStatuses...)
}
