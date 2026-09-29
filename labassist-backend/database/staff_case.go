package database

import (
	"errors"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrStaffCaseExists is returned when a staff case already exists for a posting.
var ErrStaffCaseExists = errors.New("staff case already exists for this posting")

// CreateStaffCaseTx creates a StaffCase inside a caller-supplied transaction.
// Returns (existing, ErrStaffCaseExists) if one already exists — idempotent check.
func CreateStaffCaseTx(tx *gorm.DB, sc models.StaffCase) (models.StaffCase, error) {
	var existing models.StaffCase
	err := tx.Where("posting_id = ?", sc.PostingID).First(&existing).Error
	if err == nil {
		return existing, ErrStaffCaseExists
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.StaffCase{}, err
	}
	sc.ID = 0
	if err := tx.Create(&sc).Error; err != nil {
		return models.StaffCase{}, err
	}
	return sc, nil
}

// StaffCaseByPostingID returns the staff case for a posting, if one exists.
func StaffCaseByPostingID(postingID uint) (models.StaffCase, bool) {
	var sc models.StaffCase
	if DB.Where("posting_id = ?", postingID).First(&sc).Error != nil {
		return models.StaffCase{}, false
	}
	return sc, true
}

// StaffCaseByID returns a staff case by primary key.
func StaffCaseByID(id uint) (models.StaffCase, bool) {
	var sc models.StaffCase
	if DB.First(&sc, id).Error != nil {
		return models.StaffCase{}, false
	}
	return sc, true
}

// ListStaffCases returns all staff cases, optionally filtered by status, newest first.
func ListStaffCases(statusFilter string) []models.StaffCase {
	q := DB.Order("id DESC")
	if statusFilter != "" {
		q = q.Where("status = ?", statusFilter)
	}
	var out []models.StaffCase
	q.Find(&out)
	return out
}

// UpdateStaffCase updates a staff case using a mutation callback inside a transaction.
func UpdateStaffCase(id uint, fn func(*models.StaffCase)) (models.StaffCase, bool) {
	var sc models.StaffCase
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&sc, id).Error; err != nil {
			return err
		}
		fn(&sc)
		return tx.Save(&sc).Error
	})
	if err != nil {
		return models.StaffCase{}, false
	}
	return sc, true
}

// ScheduleGroupsForCase returns all schedule groups for a staff case, ordered by ID.
func ScheduleGroupsForCase(staffCaseID uint) []models.ScheduleGroup {
	var out []models.ScheduleGroup
	DB.Where("staff_case_id = ?", staffCaseID).Order("id ASC").Find(&out)
	return out
}

// CreateScheduleGroup persists a new schedule group for a staff case.
func CreateScheduleGroup(sg models.ScheduleGroup) (models.ScheduleGroup, error) {
	sg.ID = 0
	if err := DB.Create(&sg).Error; err != nil {
		return models.ScheduleGroup{}, err
	}
	return sg, nil
}

// DeleteScheduleGroup removes a schedule group only if it belongs to the given case.
func DeleteScheduleGroup(id, staffCaseID uint) bool {
	return DB.Where("id = ? AND staff_case_id = ?", id, staffCaseID).
		Delete(&models.ScheduleGroup{}).Error == nil
}
