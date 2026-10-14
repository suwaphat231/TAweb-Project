package database

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrStaleAppeal means the appeal (or its blacklisting) changed between the
// caller loading it and trying to write — the caller should reload.
var ErrStaleAppeal = errors.New("appeal was changed by someone else")

// ErrAppealExists means the blacklisting already has an appeal.
var ErrAppealExists = errors.New("appeal already filed")

const appealAuditEntity = "blacklist_appeal"

func enrichAppeal(a models.BlacklistAppeal) models.BlacklistAppeal {
	if u, ok := UserByID(a.StudentID); ok {
		a.StudentName = u.FullName
		if u.StudentID != nil {
			a.StudentCode = *u.StudentID
		}
	}
	if a.DecidedByID != nil {
		a.DecidedByName = userName(*a.DecidedByID)
	}
	var r models.LabBoyReport
	if DB.Select("id, course_id").First(&r, a.ReportID).Error == nil {
		a.CourseID = r.CourseID
		if c, ok := CourseByID(r.CourseID); ok {
			a.CourseCode, a.CourseTitle, a.CourseSection = c.Code, c.Title, c.Section
			a.CourseSemester, a.CourseYear = c.Semester, c.AcademicYear
		}
	}
	var n int64
	DB.Model(&models.LabBoyReport{}).Where("student_id = ? AND blacklisted_at IS NOT NULL", a.StudentID).Count(&n)
	a.BlacklistCount = int(n)
	return a
}

func writeAppealAudit(tx *gorm.DB, appealID uint, action string, actorID uint, oldValue, newValue, note string) error {
	return tx.Create(&models.StaffAuditLog{
		EntityType: appealAuditEntity,
		EntityID:   appealID,
		Action:     action,
		ActorID:    actorID,
		ActorName:  userName(actorID),
		OldValue:   oldValue,
		NewValue:   newValue,
		Reason:     truncateRunes(note, 500),
	}).Error
}

// AppealByID loads one appeal with its display fields.
func AppealByID(id uint) (models.BlacklistAppeal, bool) {
	var a models.BlacklistAppeal
	if DB.First(&a, id).Error != nil {
		return a, false
	}
	return enrichAppeal(a), true
}

// AppealsForReport lists every appeal against a report, oldest first.
func AppealsForReport(reportID uint) ([]models.BlacklistAppeal, error) {
	rows := make([]models.BlacklistAppeal, 0)
	if err := DB.Where("report_id = ?", reportID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i] = enrichAppeal(rows[i])
	}
	return rows, nil
}

// AppealEvents is an appeal's timeline, oldest first.
func AppealEvents(appealID uint) ([]models.BlacklistAppealEvent, error) {
	rows := make([]models.BlacklistAppealEvent, 0)
	if err := DB.Where("appeal_id = ?", appealID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		if u, ok := UserByID(rows[i].ActorID); ok {
			rows[i].ActorName, rows[i].ActorRole = u.FullName, string(u.Role)
		}
	}
	return rows, nil
}

// appealStepTx appends one event with its files and audit row.
func appealStepTx(tx *gorm.DB, a models.BlacklistAppeal, ev models.BlacklistAppealEvent, files []models.LabBoyReportEvidence) error {
	ev.ID = 0
	ev.AppealID = a.ID
	if err := tx.Create(&ev).Error; err != nil {
		return err
	}
	for i := range files {
		f := files[i]
		f.ID = 0
		f.ReportID = a.ReportID
		f.UploadedByID = ev.ActorID
		f.AppealEventID = &ev.ID
		if err := tx.Create(&f).Error; err != nil {
			return err
		}
	}
	from := ""
	if ev.FromStatus != nil {
		from = string(*ev.FromStatus)
	}
	return writeAppealAudit(tx, a.ID, strings.ToLower(string(ev.Kind)), ev.ActorID, from,
		fmt.Sprintf("%s (%d files)", ev.ToStatus, len(files)), ev.Note)
}

// NewAppeal is a student's appeal with its files and the notifications it
// sends.
type NewAppeal struct {
	Appeal        models.BlacklistAppeal
	Files         []models.LabBoyReportEvidence
	Notifications []models.Notification
}

// CreateAppeal files an appeal against the report's current blacklisting.
// The report row is locked so the blacklisting cannot change, and a second
// appeal cannot slip in, between the handler's check and the insert.
func CreateAppeal(n NewAppeal) (models.BlacklistAppeal, error) {
	a := n.Appeal
	err := DB.Transaction(func(tx *gorm.DB) error {
		var r models.LabBoyReport
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&r, a.ReportID).Error; err != nil {
			return err
		}
		if r.Status != models.ReportConfirmed || !r.BlacklistedSince().Equal(a.BlacklistedAt) {
			return ErrStaleAppeal
		}
		var n64 int64
		if err := tx.Model(&models.BlacklistAppeal{}).
			Where("report_id = ? AND (blacklisted_at = ? OR status IN ?)", a.ReportID, a.BlacklistedAt,
				[]models.PenaltyStatus{models.PenaltyAppealPending, models.PenaltyAppealMoreInfo}).
			Count(&n64).Error; err != nil {
			return err
		}
		if n64 > 0 {
			return ErrAppealExists
		}
		a.ID = 0
		a.Status = models.PenaltyAppealPending
		if err := tx.Create(&a).Error; err != nil {
			return err
		}
		from := models.PenaltyBlacklisted
		note := a.Reason
		if a.Details != "" {
			note += "\n" + a.Details
		}
		if err := appealStepTx(tx, a, models.BlacklistAppealEvent{
			Kind: models.AppealEventSubmit, FromStatus: &from, ToStatus: a.Status, Note: note, ActorID: a.StudentID,
		}, n.Files); err != nil {
			return err
		}
		return createNotificationsTx(tx, n.Notifications)
	})
	if err != nil {
		return models.BlacklistAppeal{}, err
	}
	return enrichAppeal(a), nil
}

// AppealStep is one status change on an appeal: a decision by the course's
// instructor or the student's extra information.
type AppealStep struct {
	AppealID uint
	From     models.PenaltyStatus
	To       models.PenaltyStatus
	Kind     models.AppealEventKind
	ActorID  uint
	Note     string
	Files    []models.LabBoyReportEvidence
	// LiftBlacklist moves the report out of CONFIRMED (approved appeal).
	LiftBlacklist bool
	Notifications []models.Notification
}

// ApplyAppealStep saves the step in one transaction: it only succeeds if the
// appeal is still in s.From (two people deciding at once cannot both win);
// event, files, audit, the lifted blacklisting and notifications are saved
// with it or not at all. Nothing earlier is overwritten or deleted.
func ApplyAppealStep(s AppealStep) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var a models.BlacklistAppeal
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&a, s.AppealID).Error; err != nil {
			return err
		}
		if a.Status != s.From {
			return ErrStaleAppeal
		}
		updates := map[string]any{"status": s.To, "updated_at": time.Now()}
		if s.Kind == models.AppealEventApprove || s.Kind == models.AppealEventReject {
			updates["decided_at"] = time.Now()
			updates["decided_by_id"] = s.ActorID
			updates["decision_note"] = s.Note
		}
		if err := tx.Model(&a).Updates(updates).Error; err != nil {
			return err
		}
		from := s.From
		if err := appealStepTx(tx, a, models.BlacklistAppealEvent{
			Kind: s.Kind, FromStatus: &from, ToStatus: s.To, Note: s.Note, ActorID: s.ActorID,
		}, s.Files); err != nil {
			return err
		}
		if s.LiftBlacklist {
			if err := liftBlacklistTx(tx, a.ReportID, s.ActorID, s.Note); err != nil {
				return err
			}
		}
		return createNotificationsTx(tx, s.Notifications)
	})
}

// liftBlacklistTx ends a blacklisting on an approved appeal the same way an
// instructor's own decision does — CONFIRMED → NOT_SUBSTANTIATED with a
// timeline row, a review and an audit entry — so the report's history reads
// in one place. BlacklistedAt/Until are kept as history.
func liftBlacklistTx(tx *gorm.DB, reportID, actorID uint, note string) error {
	res := tx.Model(&models.LabBoyReport{}).Where("id = ? AND status = ?", reportID, models.ReportConfirmed).
		Updates(map[string]any{"status": models.ReportNotSubstantiated, "updated_at": time.Now()})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return ErrStaleAppeal
	}
	reason := "อนุมัติอุทธรณ์ ยกเลิก Blacklist: " + note
	from := models.ReportConfirmed
	if err := tx.Create(&models.LabBoyReportStatusHistory{
		ReportID: reportID, FromStatus: &from, ToStatus: models.ReportNotSubstantiated, ActorID: actorID, Reason: reason,
	}).Error; err != nil {
		return err
	}
	if err := tx.Create(&models.LabBoyReportReview{
		ReportID: reportID, ReviewerID: actorID, Decision: models.DecisionNotSubstantiated, Reason: reason,
	}).Error; err != nil {
		return err
	}
	return writeReportAudit(tx, reportID, "appeal_approved", actorID, string(from), string(models.ReportNotSubstantiated), note)
}

// HasOpenAppeal is whether the report has an appeal waiting on a decision.
func HasOpenAppeal(reportID uint) (bool, error) {
	var n int64
	err := DB.Model(&models.BlacklistAppeal{}).Where("report_id = ? AND status IN ?", reportID,
		[]models.PenaltyStatus{models.PenaltyAppealPending, models.PenaltyAppealMoreInfo}).Count(&n).Error
	return n > 0, err
}

// AppealFilter narrows ListAppeals; the scope comes from the caller's
// account, never from the request.
type AppealFilter struct {
	AllCourses bool
	CourseIDs  []uint
	Statuses   []models.PenaltyStatus
	Page       int
	Limit      int
}

// ListAppeals returns one page of appeals against blacklistings in the
// given courses, newest activity first.
func ListAppeals(f AppealFilter) ([]models.BlacklistAppeal, int64, error) {
	rows := make([]models.BlacklistAppeal, 0)
	if !f.AllCourses && len(f.CourseIDs) == 0 {
		return rows, 0, nil
	}
	q := DB.Model(&models.BlacklistAppeal{}).Joins("JOIN labboy_reports r ON r.id = blacklist_appeals.report_id")
	if !f.AllCourses {
		q = q.Where("r.course_id IN ?", f.CourseIDs)
	}
	if len(f.Statuses) > 0 {
		q = q.Where("blacklist_appeals.status IN ?", f.Statuses)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := q.Select("blacklist_appeals.*").Order("blacklist_appeals.updated_at DESC, blacklist_appeals.id DESC").
		Offset((f.Page - 1) * f.Limit).Limit(f.Limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	for i := range rows {
		rows[i] = enrichAppeal(rows[i])
	}
	return rows, total, nil
}
