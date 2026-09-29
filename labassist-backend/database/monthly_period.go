package database

import (
	"errors"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrPeriodAlreadyClosed is returned when trying to close an already-closed period.
var ErrPeriodAlreadyClosed = errors.New("monthly period already closed")

// ErrPeriodNotFound is returned when the requested period does not exist.
var ErrPeriodNotFound = errors.New("monthly period not found")

// OpenMonthlyPeriod creates a period for the given month, or returns the existing one.
// Idempotent: calling it twice for the same case/month/year returns the same record.
func OpenMonthlyPeriod(staffCaseID uint, month, year int) (models.MonthlyPeriod, error) {
	var p models.MonthlyPeriod
	err := DB.Where("staff_case_id = ? AND month = ? AND year = ?", staffCaseID, month, year).First(&p).Error
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.MonthlyPeriod{}, err
	}
	p = models.MonthlyPeriod{
		StaffCaseID: staffCaseID,
		Month:       month,
		Year:        year,
		Status:      models.PeriodOpen,
	}
	if err := DB.Create(&p).Error; err != nil {
		return models.MonthlyPeriod{}, err
	}
	return p, nil
}

// CloseMonthlyPeriod marks a period as closed. Returns ErrPeriodAlreadyClosed if
// it is already closed. Uses SELECT FOR UPDATE to prevent double-close races.
func CloseMonthlyPeriod(id, closedByID uint) (models.MonthlyPeriod, error) {
	var p models.MonthlyPeriod
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&p, id).Error; err != nil {
			return ErrPeriodNotFound
		}
		if p.Status == models.PeriodClosed {
			return ErrPeriodAlreadyClosed
		}
		now := time.Now()
		p.Status = models.PeriodClosed
		p.ClosedAt = &now
		p.ClosedByID = &closedByID
		return tx.Save(&p).Error
	})
	return p, err
}

// MonthlyPeriodsForCase returns all monthly periods for a staff case, chronologically.
func MonthlyPeriodsForCase(staffCaseID uint) []models.MonthlyPeriod {
	var out []models.MonthlyPeriod
	DB.Where("staff_case_id = ?", staffCaseID).Order("year ASC, month ASC").Find(&out)
	return out
}

// MonthlyPeriodByID returns a period by primary key.
func MonthlyPeriodByID(id uint) (models.MonthlyPeriod, bool) {
	var p models.MonthlyPeriod
	if DB.First(&p, id).Error != nil {
		return models.MonthlyPeriod{}, false
	}
	return p, true
}
