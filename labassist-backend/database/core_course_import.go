package database

import (
	"regexp"
	"strings"

	"labassist/models"

	"gorm.io/gorm/clause"
)

// leadingCourseCode matches the 6-digit course code at the start of a cell.
// Anything after it (a curriculum suffix such as "-165") is ignored.
var leadingCourseCode = regexp.MustCompile(`^(\d{6})(?:\D|$)`)

// CatalogCodeFromCell returns the 6-digit course code at the start of a
// spreadsheet or stored code, or "" when the cell does not start with one.
func CatalogCodeFromCell(cell string) string {
	m := leadingCourseCode.FindStringSubmatch(strings.TrimSpace(cell))
	if m == nil {
		return ""
	}
	return m[1]
}

// UpsertCoreCourses saves courses into core_courses, the catalog the OCR
// matches transcripts against. A row already there for the same program and
// code gets its title and credits refreshed.
func UpsertCoreCourses(courses []models.CoreCourse) error {
	if len(courses) == 0 {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "program"}, {Name: "code"}},
		DoUpdates: clause.AssignmentColumns([]string{"title", "credits"}),
	}).Create(&courses).Error
}
