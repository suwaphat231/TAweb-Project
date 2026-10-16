package database

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrStaleReport means the report changed (usually its status) between the
// caller loading it and trying to write — the caller should reload.
var ErrStaleReport = errors.New("report was changed by someone else")

// ErrDuplicateReport means an open report already covers the same Lab Boy
// job, incident date and category.
var ErrDuplicateReport = errors.New("duplicate report")

const reportAuditEntity = "labboy_report"

func enrichReport(r models.LabBoyReport) models.LabBoyReport {
	if u, ok := UserByID(r.StudentID); ok {
		r.StudentName = u.FullName
		if u.StudentID != nil {
			r.StudentCode = *u.StudentID
		}
	}
	if u, ok := UserByID(r.ReporterID); ok {
		r.ReporterName = u.FullName
	}
	if c, ok := CourseByID(r.CourseID); ok {
		r.CourseCode = c.Code
		r.CourseTitle = c.Title
		r.CourseSection = c.Section
		r.CourseSemester = c.Semester
		r.CourseYear = c.AcademicYear
	}
	return r
}

func userName(id uint) string {
	if u, ok := UserByID(id); ok {
		return u.FullName
	}
	return ""
}

// writeReportAudit appends to the shared staff_audit_logs table — the same
// append-only trail the staff document workflow uses — so report activity
// is never stored somewhere that can be edited from the app.
func writeReportAudit(tx *gorm.DB, reportID uint, action string, actorID uint, oldValue, newValue, reason string) error {
	return tx.Create(&models.StaffAuditLog{
		EntityType: reportAuditEntity,
		EntityID:   reportID,
		Action:     action,
		ActorID:    actorID,
		ActorName:  userName(actorID),
		OldValue:   oldValue,
		NewValue:   newValue,
		Reason:     truncateRunes(reason, 500),
	}).Error
}

// LogSensitiveAccess records that a user looked at data that can affect a
// student's job applications (confirmed history, evidence files). It is
// best-effort like CreateActivityLog: a failed audit write must not block
// the read, so the error is returned for the caller to log.
func LogSensitiveAccess(entityType string, entityID uint, action string, actorID uint, detail string) error {
	return DB.Create(&models.StaffAuditLog{
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		ActorName:  userName(actorID),
		NewValue:   detail,
	}).Error
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func reportSnapshot(r models.LabBoyReport) string {
	b, _ := json.Marshal(map[string]any{
		"application_id": r.ApplicationID,
		"incident_date":  r.IncidentDate.Format("2006-01-02"),
		"category":       r.Category,
		"description":    r.Description,
		"impact":         r.Impact,
	})
	return string(b)
}

// hasOpenDuplicateTx reports whether another non-withdrawn report covers the
// same application, incident date and category.
func hasOpenDuplicateTx(tx *gorm.DB, r models.LabBoyReport) (bool, error) {
	var n int64
	err := tx.Model(&models.LabBoyReport{}).
		Where("application_id = ? AND incident_date = ? AND category = ? AND status <> ? AND id <> ?",
			r.ApplicationID, r.IncidentDate.Format("2006-01-02"), r.Category, models.ReportWithdrawn, r.ID).
		Count(&n).Error
	return n > 0, err
}

// CreateReportDraft saves a new DRAFT report with its first timeline entry
// and audit row, all or nothing.
func CreateReportDraft(r *models.LabBoyReport) error {
	r.ID = 0
	r.Status = models.ReportDraft
	r.SubmittedAt = nil
	return DB.Transaction(func(tx *gorm.DB) error {
		// Lock the application row so two concurrent creates for the same
		// incident cannot both pass the duplicate check.
		var app models.Application
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").First(&app, r.ApplicationID).Error; err != nil {
			return err
		}
		dup, err := hasOpenDuplicateTx(tx, *r)
		if err != nil {
			return err
		}
		if dup {
			return ErrDuplicateReport
		}
		if err := tx.Create(r).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.LabBoyReportStatusHistory{
			ReportID: r.ID, ToStatus: models.ReportDraft, ActorID: r.ReporterID,
		}).Error; err != nil {
			return err
		}
		return writeReportAudit(tx, r.ID, "create_draft", r.ReporterID, "", reportSnapshot(*r), "")
	})
}

// UpdateReportDraft overwrites the editable fields of a report that is still
// a DRAFT. The previous values go to the audit log, so even draft edits
// leave a trail.
func UpdateReportDraft(id, actorID uint, apply func(r *models.LabBoyReport)) (models.LabBoyReport, error) {
	var out models.LabBoyReport
	err := DB.Transaction(func(tx *gorm.DB) error {
		var r models.LabBoyReport
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&r, id).Error; err != nil {
			return err
		}
		if r.Status != models.ReportDraft {
			return ErrStaleReport
		}
		before := reportSnapshot(r)
		apply(&r)
		dup, err := hasOpenDuplicateTx(tx, r)
		if err != nil {
			return err
		}
		if dup {
			return ErrDuplicateReport
		}
		if err := tx.Model(&models.LabBoyReport{}).Where("id = ? AND status = ?", id, models.ReportDraft).
			Updates(map[string]any{
				"application_id": r.ApplicationID,
				"student_id":     r.StudentID,
				"course_id":      r.CourseID,
				"incident_date":  r.IncidentDate,
				"category":       r.Category,
				"description":    r.Description,
				"impact":         r.Impact,
			}).Error; err != nil {
			return err
		}
		out = r
		return writeReportAudit(tx, id, "update_draft", actorID, before, reportSnapshot(r), "")
	})
	if err != nil {
		return models.LabBoyReport{}, err
	}
	return enrichReport(out), nil
}

func ReportByID(id uint) (models.LabBoyReport, bool) {
	var r models.LabBoyReport
	if DB.First(&r, id).Error != nil {
		return r, false
	}
	return enrichReport(r), true
}

// ReportTransition is one status change and everything that must be saved
// with it.
type ReportTransition struct {
	ReportID uint
	From     models.ReportStatus
	To       models.ReportStatus
	ActorID  uint
	Reason   string
	// Action names the audit entry (submit, confirm, ...).
	Action string
	// Review is saved when a reviewer made a decision.
	Review *models.ReviewDecision
	// ClearReconsideration resets the student's pending reconsideration
	// request (when a reviewer reopens or declines it).
	ClearReconsideration bool
	Notifications        []models.Notification
}

// ApplyReportTransition moves a report from t.From to t.To in one
// transaction: the status update only succeeds if the report is still in
// t.From (so two reviewers clicking at once cannot both win), and the
// timeline, review, audit row and notifications are saved with it or not at
// all. From == To is allowed for decisions that do not change the status
// (declining a reconsideration request); then no timeline row is written.
func ApplyReportTransition(t ReportTransition) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{"status": t.To, "updated_at": time.Now()}
		if t.To == models.ReportSubmitted && t.From == models.ReportDraft {
			updates["submitted_at"] = time.Now()
		}
		if t.ClearReconsideration {
			updates["reconsideration_requested_at"] = nil
		}
		res := tx.Model(&models.LabBoyReport{}).Where("id = ? AND status = ?", t.ReportID, t.From).Updates(updates)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrStaleReport
		}
		if t.From != t.To {
			from := t.From
			if err := tx.Create(&models.LabBoyReportStatusHistory{
				ReportID: t.ReportID, FromStatus: &from, ToStatus: t.To, ActorID: t.ActorID, Reason: t.Reason,
			}).Error; err != nil {
				return err
			}
		}
		if t.Review != nil {
			if err := tx.Create(&models.LabBoyReportReview{
				ReportID: t.ReportID, ReviewerID: t.ActorID, Decision: *t.Review, Reason: t.Reason,
			}).Error; err != nil {
				return err
			}
		}
		if err := writeReportAudit(tx, t.ReportID, t.Action, t.ActorID, string(t.From), string(t.To), t.Reason); err != nil {
			return err
		}
		return createNotificationsTx(tx, t.Notifications)
	})
}

func createNotificationsTx(tx *gorm.DB, notifs []models.Notification) error {
	if len(notifs) == 0 {
		return nil
	}
	for i := range notifs {
		notifs[i].ID = 0
		notifs[i].CreatedAt = time.Now()
	}
	return tx.Create(&notifs).Error
}

// NewReportResponse is a response plus its attachments and the side effects
// it triggers.
type NewReportResponse struct {
	Response models.LabBoyReportResponse
	Files    []models.LabBoyReportEvidence
	// ExpectStatus guards against the report moving on while the author was
	// typing; the insert fails with ErrStaleReport if it did.
	ExpectStatus models.ReportStatus
	// ResumeReview moves AWAITING_RESPONSE back to UNDER_REVIEW now that the
	// requested information has arrived.
	ResumeReview bool
	// RequestReconsideration flags a CONFIRMED report for another look.
	RequestReconsideration bool
}

// AddReportResponse saves an append-only response with its files, and the
// status change it implies, in one transaction.
func AddReportResponse(n NewReportResponse) (models.LabBoyReportResponse, error) {
	resp := n.Response
	err := DB.Transaction(func(tx *gorm.DB) error {
		var r models.LabBoyReport
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&r, resp.ReportID).Error; err != nil {
			return err
		}
		if r.Status != n.ExpectStatus {
			return ErrStaleReport
		}
		if n.RequestReconsideration && r.ReconsiderationRequestedAt != nil {
			return ErrStaleReport
		}
		resp.ID = 0
		if err := tx.Create(&resp).Error; err != nil {
			return err
		}
		for i := range n.Files {
			f := n.Files[i]
			f.ID = 0
			f.ReportID = resp.ReportID
			f.UploadedByID = resp.AuthorID
			f.ResponseID = &resp.ID
			if err := tx.Create(&f).Error; err != nil {
				return err
			}
		}
		if err := writeReportAudit(tx, r.ID, "add_response", resp.AuthorID, "", fmt.Sprintf("%s (%d files)", resp.Kind, len(n.Files)), ""); err != nil {
			return err
		}
		if n.RequestReconsideration {
			if err := tx.Model(&models.LabBoyReport{}).Where("id = ?", r.ID).
				Update("reconsideration_requested_at", time.Now()).Error; err != nil {
				return err
			}
			if err := writeReportAudit(tx, r.ID, "request_reconsideration", resp.AuthorID, "", "", resp.Message); err != nil {
				return err
			}
		}
		if n.ResumeReview && r.Status == models.ReportAwaitingResponse {
			if err := tx.Model(&models.LabBoyReport{}).Where("id = ?", r.ID).
				Updates(map[string]any{"status": models.ReportUnderReview, "updated_at": time.Now()}).Error; err != nil {
				return err
			}
			from := models.ReportAwaitingResponse
			if err := tx.Create(&models.LabBoyReportStatusHistory{
				ReportID: r.ID, FromStatus: &from, ToStatus: models.ReportUnderReview, ActorID: resp.AuthorID,
				Reason: "ได้รับข้อมูลเพิ่มเติมแล้ว",
			}).Error; err != nil {
				return err
			}
			if err := writeReportAudit(tx, r.ID, "resume_review", resp.AuthorID, string(from), string(models.ReportUnderReview), ""); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return models.LabBoyReportResponse{}, err
	}
	resp.AuthorName = userName(resp.AuthorID)
	return resp, nil
}

// AddReportEvidence attaches the reporter's files while the report is still
// in one of the allowed statuses.
func AddReportEvidence(reportID, actorID uint, allowed []models.ReportStatus, files []models.LabBoyReportEvidence) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var r models.LabBoyReport
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&r, reportID).Error; err != nil {
			return err
		}
		ok := false
		for _, s := range allowed {
			if r.Status == s {
				ok = true
			}
		}
		if !ok {
			return ErrStaleReport
		}
		names := make([]string, 0, len(files))
		for i := range files {
			f := files[i]
			f.ID = 0
			f.ReportID = reportID
			f.UploadedByID = actorID
			if err := tx.Create(&f).Error; err != nil {
				return err
			}
			names = append(names, f.FileName)
		}
		return writeReportAudit(tx, reportID, "add_evidence", actorID, "", strings.Join(names, ", "), "")
	})
}

// CountReportEvidence is used to cap how many files one report can hold.
func CountReportEvidence(reportID uint) (int64, error) {
	var n int64
	err := DB.Model(&models.LabBoyReportEvidence{}).Where("report_id = ?", reportID).Count(&n).Error
	return n, err
}

// ReportEvidenceList returns the file metadata (never the bytes).
func ReportEvidenceList(reportID uint) ([]models.LabBoyReportEvidence, error) {
	rows := make([]models.LabBoyReportEvidence, 0)
	if err := DB.Omit("data").Where("report_id = ?", reportID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].UploadedByName = userName(rows[i].UploadedByID)
	}
	return rows, nil
}

// ReportEvidenceFile loads one file, only if it belongs to the given report
// — so a caller authorized for report A cannot fetch report B's file by
// changing the evidence ID.
func ReportEvidenceFile(reportID, evidenceID uint) (models.LabBoyReportEvidence, bool) {
	var e models.LabBoyReportEvidence
	if DB.Where("id = ? AND report_id = ?", evidenceID, reportID).First(&e).Error != nil {
		return e, false
	}
	return e, true
}

func ReportResponses(reportID uint) ([]models.LabBoyReportResponse, error) {
	rows := make([]models.LabBoyReportResponse, 0)
	if err := DB.Where("report_id = ?", reportID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		if u, ok := UserByID(rows[i].AuthorID); ok {
			rows[i].AuthorName = u.FullName
			rows[i].AuthorRole = string(u.Role)
		}
	}
	return rows, nil
}

func ReportReviews(reportID uint) ([]models.LabBoyReportReview, error) {
	rows := make([]models.LabBoyReportReview, 0)
	if err := DB.Where("report_id = ?", reportID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].ReviewerName = userName(rows[i].ReviewerID)
	}
	return rows, nil
}

func ReportStatusHistory(reportID uint) ([]models.LabBoyReportStatusHistory, error) {
	rows := make([]models.LabBoyReportStatusHistory, 0)
	if err := DB.Where("report_id = ?", reportID).Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].ActorName = userName(rows[i].ActorID)
	}
	return rows, nil
}

// ReportFilter narrows ListReports. Scope fields (ReporterID, StudentID,
// ExcludeDraft) are set by the handler from the caller's account, never
// from the request.
type ReportFilter struct {
	ReporterID   *uint
	StudentID    *uint
	ExcludeDraft bool
	Statuses     []models.ReportStatus
	Category     models.ReportCategory
	CourseID     uint
	Search       string
	DateFrom     *time.Time
	DateTo       *time.Time
	Page         int
	Limit        int
}

// ListReports returns one page of reports matching f, newest activity first,
// with the total count for pagination.
func ListReports(f ReportFilter) ([]models.LabBoyReport, int64, error) {
	q := DB.Model(&models.LabBoyReport{})
	if f.ReporterID != nil {
		q = q.Where("labboy_reports.reporter_id = ?", *f.ReporterID)
	}
	if f.StudentID != nil {
		q = q.Where("labboy_reports.student_id = ?", *f.StudentID)
	}
	if f.ExcludeDraft {
		q = q.Where("labboy_reports.status <> ?", models.ReportDraft)
	}
	if len(f.Statuses) > 0 {
		q = q.Where("labboy_reports.status IN ?", f.Statuses)
	}
	if f.Category != "" {
		q = q.Where("labboy_reports.category = ?", f.Category)
	}
	if f.CourseID != 0 {
		q = q.Where("labboy_reports.course_id = ?", f.CourseID)
	}
	if f.DateFrom != nil {
		q = q.Where("labboy_reports.incident_date >= ?", f.DateFrom.Format("2006-01-02"))
	}
	if f.DateTo != nil {
		q = q.Where("labboy_reports.incident_date <= ?", f.DateTo.Format("2006-01-02"))
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		like := "%" + s + "%"
		q = q.Joins("JOIN users su ON su.id = labboy_reports.student_id").
			Where("su.full_name LIKE ? OR su.student_id LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]models.LabBoyReport, 0)
	if err := q.Select("labboy_reports.*").Order("labboy_reports.updated_at DESC, labboy_reports.id DESC").
		Offset((f.Page - 1) * f.Limit).Limit(f.Limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	for i := range rows {
		rows[i] = enrichReport(rows[i])
	}
	return rows, total, nil
}

// ConfirmedRecordsForStudent returns only CONFIRMED reports — the history
// another course's instructor may see. Anything still under review, not
// substantiated or withdrawn is never included.
func ConfirmedRecordsForStudent(studentID uint) ([]models.ConfirmedRecord, error) {
	var reports []models.LabBoyReport
	if err := DB.Where("student_id = ? AND status = ?", studentID, models.ReportConfirmed).
		Order("incident_date DESC").Find(&reports).Error; err != nil {
		return nil, err
	}
	out := make([]models.ConfirmedRecord, 0, len(reports))
	for _, r := range reports {
		r = enrichReport(r)
		rec := models.ConfirmedRecord{
			ReportID:       r.ID,
			Category:       r.Category,
			IncidentDate:   r.IncidentDate,
			CourseCode:     r.CourseCode,
			CourseTitle:    r.CourseTitle,
			CourseSemester: r.CourseSemester,
			CourseYear:     r.CourseYear,
			Description:    r.Description,
			ConfirmedAt:    r.UpdatedAt,
		}
		// The latest CONFIRM decision carries the reviewer's reasoning and
		// the actual confirmation time.
		var rev models.LabBoyReportReview
		if DB.Where("report_id = ? AND decision = ?", r.ID, models.DecisionConfirm).Order("id DESC").First(&rev).Error == nil {
			rec.ReviewReason = rev.Reason
			rec.ConfirmedAt = rev.CreatedAt
		}
		var n int64
		DB.Model(&models.LabBoyReportResponse{}).Where("report_id = ? AND author_id = ?", r.ID, r.StudentID).Count(&n)
		rec.StudentResponded = n > 0
		out = append(out, rec)
	}
	return out, nil
}

// ConfirmedRecordCounts maps student ID → number of CONFIRMED reports, for
// flagging applicants in one query.
func ConfirmedRecordCounts(studentIDs []uint) (map[uint]int, error) {
	out := make(map[uint]int)
	if len(studentIDs) == 0 {
		return out, nil
	}
	var rows []struct {
		StudentID uint
		N         int
	}
	if err := DB.Model(&models.LabBoyReport{}).Select("student_id, COUNT(*) AS n").
		Where("status = ? AND student_id IN ?", models.ReportConfirmed, studentIDs).
		Group("student_id").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.StudentID] = r.N
	}
	return out, nil
}
