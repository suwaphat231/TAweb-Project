package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm/clause"
)

// ListAcademicTerms returns the saved semester dates of an academic year (พ.ศ.),
// ordered 1, 2, S.
func ListAcademicTerms(academicYear int) ([]models.AcademicTerm, error) {
	var out []models.AcademicTerm
	err := DB.Where("academic_year = ?", academicYear).
		Order("FIELD(semester, '1', '2', 'S')").Find(&out).Error
	return out, err
}

// ListAcademicTermsForYears is ListAcademicTerms for several academic years.
func ListAcademicTermsForYears(years []int) ([]models.AcademicTerm, error) {
	var out []models.AcademicTerm
	err := DB.Where("academic_year IN ?", years).
		Order("academic_year ASC, FIELD(semester, '1', '2', 'S')").Find(&out).Error
	return out, err
}

// UpsertAcademicTerms saves each term, replacing the dates of one already
// saved for the same academic year and semester.
func UpsertAcademicTerms(terms []models.AcademicTerm) error {
	if len(terms) == 0 {
		return nil
	}
	now := time.Now()
	for i := range terms {
		terms[i].CreatedAt, terms[i].UpdatedAt = now, now
	}
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "academic_year"}, {Name: "semester"}},
		DoUpdates: clause.AssignmentColumns([]string{"open_date", "close_date", "created_by_id", "updated_at"}),
	}).Create(&terms).Error
}
