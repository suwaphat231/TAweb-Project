package reports

import "labassist/models"

// Actor is the logged-in user as the auth middleware resolved it — never
// anything the client sent in the body.
type Actor struct {
	ID   uint
	Role string
}

func (a Actor) isAdmin() bool        { return a.Role == string(models.RoleAdmin) }
func (a Actor) isStaff() bool        { return a.Role == string(models.RoleStaff) }
func (a Actor) isStaffOrAdmin() bool { return a.isStaff() || a.isAdmin() }

// isReviewer returns true only for admin — staff is read-only on reports
// and may not take any workflow actions.
func (a Actor) isReviewer() bool { return a.isAdmin() }

// Action is a step a user can take on a report.
type Action string

const (
	ActionSubmit                 Action = "submit"
	ActionWithdraw               Action = "withdraw"
	ActionStartReview            Action = "start_review"
	ActionRequestInfo            Action = "request_info"
	ActionConfirm                Action = "confirm"
	ActionNotSubstantiated       Action = "not_substantiated"
	ActionReopen                 Action = "reopen"
	ActionDeclineReconsideration Action = "decline_reconsideration"
)

type actorKind int

const (
	byReporter actorKind = iota
	byReviewer
)

type transitionRule struct {
	from        []models.ReportStatus
	to          models.ReportStatus // empty = status stays the same
	by          actorKind
	needsReason bool
	review      *models.ReviewDecision
	needsRecons bool // only while a reconsideration request is pending
	clearRecons bool
}

func decision(d models.ReviewDecision) *models.ReviewDecision { return &d }

// open statuses are the ones a report can still be withdrawn from or
// commented on — it has not reached a reviewer's final decision.
var openStatuses = []models.ReportStatus{
	models.ReportSubmitted, models.ReportUnderReview, models.ReportAwaitingResponse,
}

// rules is the whole state machine. Anything not listed here is rejected,
// which is what stops e.g. DRAFT → CONFIRMED or a reporter confirming.
var rules = map[Action]transitionRule{
	ActionSubmit: {
		from: []models.ReportStatus{models.ReportDraft}, to: models.ReportSubmitted, by: byReporter,
	},
	ActionWithdraw: {
		from: append([]models.ReportStatus{models.ReportDraft}, openStatuses...), to: models.ReportWithdrawn,
		by: byReporter, needsReason: true,
	},
	ActionStartReview: {
		// AWAITING_RESPONSE → UNDER_REVIEW lets the reviewer carry on when
		// nobody answers the request for information.
		from: []models.ReportStatus{models.ReportSubmitted, models.ReportAwaitingResponse}, to: models.ReportUnderReview,
		by: byReviewer,
	},
	ActionRequestInfo: {
		from: []models.ReportStatus{models.ReportUnderReview}, to: models.ReportAwaitingResponse,
		by: byReviewer, needsReason: true, review: decision(models.DecisionRequestInfo),
	},
	ActionConfirm: {
		// No reason required: the reporter's description already says why.
		from: []models.ReportStatus{models.ReportUnderReview}, to: models.ReportConfirmed,
		by: byReviewer, review: decision(models.DecisionConfirm),
	},
	ActionNotSubstantiated: {
		from: []models.ReportStatus{models.ReportUnderReview}, to: models.ReportNotSubstantiated,
		by: byReviewer, needsReason: true, review: decision(models.DecisionNotSubstantiated),
	},
	ActionReopen: {
		// Correcting a final decision goes back through review instead of
		// editing the old result — the earlier decision stays on record.
		from: []models.ReportStatus{models.ReportConfirmed, models.ReportNotSubstantiated}, to: models.ReportUnderReview,
		by: byReviewer, needsReason: true, review: decision(models.DecisionReopen), clearRecons: true,
	},
	ActionDeclineReconsideration: {
		from: []models.ReportStatus{models.ReportConfirmed}, by: byReviewer, needsReason: true,
		review: decision(models.DecisionDeclineReconsideration), needsRecons: true, clearRecons: true,
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
	case byReviewer:
		if !actor.isReviewer() {
			return "", &Denial{Forbidden: true, Message: "เฉพาะผู้ดูแลระบบ (admin) เท่านั้น"}
		}
		if r.ReporterID == actor.ID {
			return "", &Denial{Forbidden: true, Message: "ผู้รายงานไม่สามารถพิจารณารายงานของตนเองได้"}
		}
	}
	if !statusIn(r.Status, rule.from) {
		return "", &Denial{Message: "ไม่สามารถทำรายการนี้ในสถานะปัจจุบันของรายงานได้"}
	}
	if rule.needsRecons && r.ReconsiderationRequestedAt == nil {
		return "", &Denial{Message: "ไม่มีคำขอทบทวนที่รอการพิจารณา"}
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
		ActionSubmit, ActionStartReview, ActionRequestInfo, ActionConfirm, ActionNotSubstantiated,
		ActionReopen, ActionDeclineReconsideration, ActionWithdraw,
	} {
		if _, d := CheckAction(r, actor, a, "x"); d == nil {
			out = append(out, a)
		}
	}
	return out
}

// CanView decides who may open a report (and its evidence). Students see
// only their own reports once submitted; instructors only the reports they
// filed; staff every submitted report; admin everything.
func CanView(r models.LabBoyReport, actor Actor) bool {
	switch {
	case actor.isAdmin():
		return true
	case r.ReporterID == actor.ID:
		return true
	case actor.Role == string(models.RoleStaff):
		// Staff only need to know who is blacklisted; reviewing is admin's job.
		return r.Status == models.ReportConfirmed
	case actor.Role == string(models.RoleStudent):
		return r.StudentID == actor.ID && r.Status != models.ReportDraft
	}
	return false
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
// a denial. The student explains while the report is open and may ask for
// reconsideration once it is CONFIRMED; the reporter adds information while
// it is open.
func ResponseKindFor(r models.LabBoyReport, actor Actor, reconsideration bool) (models.ReportResponseKind, *Denial) {
	switch {
	case actor.Role == string(models.RoleStudent) && r.StudentID == actor.ID:
		if reconsideration {
			if r.Status != models.ReportConfirmed {
				return "", &Denial{Message: "ขอทบทวนได้เฉพาะรายงานที่ยืนยันแล้ว"}
			}
			if r.ReconsiderationRequestedAt != nil {
				return "", &Denial{Message: "ส่งคำขอทบทวนไปแล้ว กรุณารอผลการพิจารณา"}
			}
			return models.ResponseReconsideration, nil
		}
		if !statusIn(r.Status, openStatuses) {
			return "", &Denial{Message: "ไม่สามารถส่งคำชี้แจงในสถานะปัจจุบันของรายงานได้"}
		}
		return models.ResponseExplanation, nil
	case r.ReporterID == actor.ID && !reconsideration:
		if !statusIn(r.Status, openStatuses) {
			return "", &Denial{Message: "ไม่สามารถเพิ่มข้อมูลในสถานะปัจจุบันของรายงานได้"}
		}
		return models.ResponseReporterInfo, nil
	}
	return "", &Denial{Forbidden: true, Message: "forbidden"}
}
