package database

import (
	"errors"
	"fmt"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrDocumentExists means the course offering already has an active
// (not cancelled / superseded) document of this workflow step.
var ErrDocumentExists = errors.New("document already exists for this step")

// ErrPrerequisiteMissing means the previous workflow step has no active
// document yet, so this step cannot be created.
var ErrPrerequisiteMissing = errors.New("previous workflow step has no document")

// ErrDocumentInactive means the document was cancelled or superseded and can
// no longer change.
var ErrDocumentInactive = errors.New("document is cancelled or superseded")

// ErrDocumentHasDependents means a later workflow step was built from this
// document, so cancelling it would leave that step pointing at nothing.
var ErrDocumentHasDependents = errors.New("a later workflow document depends on this document")

const staffDocumentAuditEntity = "staff_document"

// IsActiveDocStatus: cancelled and superseded documents are kept for history
// but no longer count as the step's document.
func IsActiveDocStatus(s models.DocStatus) bool {
	return s != models.DocCancelled && s != models.DocSuperseded
}

func activeDocTx(tx *gorm.DB, postingID uint, t models.DocType) (models.StaffDocument, bool, error) {
	var d models.StaffDocument
	err := tx.Where("posting_id = ? AND type = ? AND status NOT IN ?", postingID, t,
		[]models.DocStatus{models.DocCancelled, models.DocSuperseded}).
		Order("version DESC, id DESC").First(&d).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return d, false, nil
	}
	return d, err == nil, err
}

// StaffDocumentsForPosting returns every document of one course offering,
// including cancelled and superseded versions, oldest first.
func StaffDocumentsForPosting(postingID uint) ([]models.StaffDocument, error) {
	out := make([]models.StaffDocument, 0)
	err := DB.Omit("signed_file_data").Where("posting_id = ?", postingID).Order("id").Find(&out).Error
	return out, err
}

// NewWorkflowDocument describes one workflow-step document to create.
type NewWorkflowDocument struct {
	Doc models.StaffDocument
	// Requires is the previous step's type; its active document must exist
	// and becomes Doc.BasedOnDocumentID.
	Requires *models.DocType
	// Replace allows superseding the step's current active document with a
	// new version; otherwise an existing one is ErrDocumentExists.
	Replace bool
	Reason  string
	ActorID uint
}

// CreateWorkflowDocument creates a workflow-step document for a course
// offering, all in one transaction: the posting row is locked so two
// clicks cannot both pass the duplicate check, the prerequisite step is
// verified, a replaced version is marked superseded (never deleted), and
// the audit trail is written with it.
func CreateWorkflowDocument(n NewWorkflowDocument) (models.StaffDocument, error) {
	doc := n.Doc
	if doc.PostingID == nil {
		return doc, errors.New("workflow document needs a posting")
	}
	postingID := *doc.PostingID
	err := DB.Transaction(func(tx *gorm.DB) error {
		var p models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").First(&p, postingID).Error; err != nil {
			return err
		}
		if n.Requires != nil {
			prev, ok, err := activeDocTx(tx, postingID, *n.Requires)
			if err != nil {
				return err
			}
			if !ok {
				return ErrPrerequisiteMissing
			}
			doc.BasedOnDocumentID = &prev.ID
			inheritStepData(&doc, prev)
		}
		current, exists, err := activeDocTx(tx, postingID, doc.Type)
		if err != nil {
			return err
		}
		if exists && !n.Replace {
			return ErrDocumentExists
		}
		doc.ID = 0
		doc.Version = 1
		if exists {
			doc.Version = current.Version + 1
		}
		if err := tx.Create(&doc).Error; err != nil {
			return err
		}
		if exists {
			if err := tx.Model(&models.StaffDocument{}).Where("id = ?", current.ID).
				Updates(map[string]any{"status": models.DocSuperseded, "superseded_by_id": doc.ID}).Error; err != nil {
				return err
			}
			if err := writeDocAuditTx(tx, current, "supersede", n.ActorID, string(current.Status), string(models.DocSuperseded), n.Reason); err != nil {
				return err
			}
		}
		return writeDocAuditTx(tx, doc, "create", n.ActorID, "", fmt.Sprintf("%s v%d", doc.Type, doc.Version), n.Reason)
	})
	return doc, err
}

// inheritStepData makes a step carry exactly what the step it is based on
// issued — Lab Boy roster, weekly work days, sessions per month and the
// frozen work plan — so a memo always matches the hiring notice it follows,
// even if the live plan changed in between.
func inheritStepData(doc *models.StaffDocument, prev models.StaffDocument) {
	doc.Roster = prev.Roster
	doc.WorkSchedule = prev.WorkSchedule
	doc.SessionsPerMonth = prev.SessionsPerMonth
	doc.DataSnapshot = prev.DataSnapshot
	doc.SnapshotVersion = prev.SnapshotVersion
}

func writeDocAuditTx(tx *gorm.DB, d models.StaffDocument, action string, actorID uint, oldValue, newValue, reason string) error {
	return tx.Create(&models.StaffAuditLog{
		StaffCaseID: d.StaffCaseID,
		EntityType:  staffDocumentAuditEntity,
		EntityID:    d.ID,
		Action:      action,
		ActorID:     actorID,
		ActorName:   userName(actorID),
		OldValue:    oldValue,
		NewValue:    newValue,
		Reason:      truncateRunes(reason, 500),
	}).Error
}

// ChangeStaffDocumentStatus updates a document's status with an audit row.
// Cancelled and superseded documents are frozen.
func ChangeStaffDocumentStatus(id uint, status models.DocStatus, actorID uint) (models.StaffDocument, error) {
	var out models.StaffDocument
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&out, id).Error; err != nil {
			return err
		}
		if !IsActiveDocStatus(out.Status) {
			return ErrDocumentInactive
		}
		if out.Status == status {
			return nil
		}
		old := out.Status
		if err := tx.Model(&models.StaffDocument{}).Where("id = ?", id).Update("status", status).Error; err != nil {
			return err
		}
		out.Status = status
		return writeDocAuditTx(tx, out, "status_change", actorID, string(old), string(status), "")
	})
	return out, err
}

// CancelStaffDocument replaces the old hard delete: the row stays (status
// cancelled) with an audit entry. A document that a later active workflow
// document was built from cannot be cancelled until that one is.
func CancelStaffDocument(id, actorID uint, reason string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var d models.StaffDocument
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&d, id).Error; err != nil {
			return err
		}
		if !IsActiveDocStatus(d.Status) {
			return ErrDocumentInactive
		}
		var dependents int64
		if err := tx.Model(&models.StaffDocument{}).
			Where("based_on_document_id = ? AND status NOT IN ?", id, []models.DocStatus{models.DocCancelled, models.DocSuperseded}).
			Count(&dependents).Error; err != nil {
			return err
		}
		if dependents > 0 {
			return ErrDocumentHasDependents
		}
		if err := tx.Model(&models.StaffDocument{}).Where("id = ?", id).Update("status", models.DocCancelled).Error; err != nil {
			return err
		}
		return writeDocAuditTx(tx, d, "cancel", actorID, string(d.Status), string(models.DocCancelled), reason)
	})
}
