package database

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"labassist/models"
)

var (
	// ErrRosterEmpty is returned when the instructor confirms a roster with
	// no accepted Lab Boy.
	ErrRosterEmpty = errors.New("no accepted Lab Boy to confirm")
	// ErrRosterInUse is returned when the instructor tries to reopen a roster
	// that staff already started working on.
	ErrRosterInUse = errors.New("staff already started on this roster")
)

// SetLabBoyRosterConfirmed confirms (or reopens) the instructor's final
// Lab Boy roster for a posting. Confirming needs at least one accepted Lab
// Boy; reopening is refused once staff created a document or a staff case
// for the posting. Returns the updated posting.
func SetLabBoyRosterConfirmed(postingID uint, confirmed bool) (models.Posting, error) {
	var p models.Posting
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&p, postingID).Error; err != nil {
			return err
		}
		if !p.IsActive {
			return ErrPostingArchived
		}
		if confirmed {
			if p.LabBoyRosterConfirmedAt != nil {
				return nil
			}
			if p.LabBoyAccepted < 1 {
				return ErrRosterEmpty
			}
			now := time.Now()
			p.LabBoyRosterConfirmedAt = &now
		} else {
			if p.LabBoyRosterConfirmedAt == nil {
				return nil
			}
			inUse, err := postingHasStaffWork(tx, p.ID)
			if err != nil {
				return err
			}
			if inUse || p.LabBoyScheduleConfirmed {
				return ErrRosterInUse
			}
			p.LabBoyRosterConfirmedAt = nil
		}
		return tx.Model(&p).Update("lab_boy_roster_confirmed_at", p.LabBoyRosterConfirmedAt).Error
	})
	return p, err
}

// postingHasStaffWork reports whether staff already created a live document
// or a staff case for the posting.
func postingHasStaffWork(tx *gorm.DB, postingID uint) (bool, error) {
	var n int64
	if err := tx.Model(&models.StaffDocument{}).
		Where("posting_id = ? AND status NOT IN ?", postingID, []string{string(models.DocCancelled), string(models.DocSuperseded)}).
		Count(&n).Error; err != nil {
		return false, err
	}
	if n > 0 {
		return true, nil
	}
	if err := tx.Model(&models.StaffCase{}).Where("posting_id = ?", postingID).Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}
