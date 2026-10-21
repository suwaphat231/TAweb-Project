package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm"
)

// calendarKey identifies a holiday row for duplicate checks: the same name on
// the same date in the same term counts as already imported.
func calendarKey(d time.Time, semester, name string) string {
	return d.Format("2006-01-02") + "|" + semester + "|" + name
}

// existingCalendarKeys returns the keys of every calendar date that applies
// to a term of the academic year: semester-scoped rows of that year, plus
// global rows (keyed once per semester, since they apply to all of them).
func existingCalendarKeys(tx *gorm.DB, academicYear int, semesters []string) (map[string]bool, error) {
	var rows []models.CalendarDate
	if err := tx.Where("(scope = ? AND academic_year = ?) OR scope = ?",
		models.DateScopeSemester, academicYear, models.DateScopeGlobal).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	keys := make(map[string]bool, len(rows))
	for _, r := range rows {
		if r.Scope == models.DateScopeGlobal {
			for _, s := range semesters {
				keys[calendarKey(r.Date, s, r.Name)] = true
			}
			continue
		}
		keys[calendarKey(r.Date, r.Semester, r.Name)] = true
	}
	return keys, nil
}

// ExistingCalendarKeys is existingCalendarKeys outside a transaction, for
// marking preview rows that are already in the system.
func ExistingCalendarKeys(academicYear int, semesters []string) (map[string]bool, error) {
	return existingCalendarKeys(DB, academicYear, semesters)
}

// CalendarKey exposes the duplicate-check key to the admin import handler.
func CalendarKey(d time.Time, semester, name string) string {
	return calendarKey(d, semester, name)
}

// ImportCalendarDates saves semester-scoped calendar dates for one academic
// year, skipping any whose (date, semester, name) is already in the system or
// repeated earlier in rows. It returns the rows it created and how many it
// skipped. Every row must have Scope=semester and AcademicYear=academicYear.
func ImportCalendarDates(academicYear int, rows []models.CalendarDate) ([]models.CalendarDate, int, error) {
	semesters := map[string]bool{}
	for _, r := range rows {
		semesters[r.Semester] = true
	}
	semList := make([]string, 0, len(semesters))
	for s := range semesters {
		semList = append(semList, s)
	}

	var created []models.CalendarDate
	skipped := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		keys, err := existingCalendarKeys(tx, academicYear, semList)
		if err != nil {
			return err
		}
		for _, r := range rows {
			k := calendarKey(r.Date, r.Semester, r.Name)
			if keys[k] {
				skipped++
				continue
			}
			keys[k] = true
			r.ID = 0
			if err := tx.Create(&r).Error; err != nil {
				return err
			}
			created = append(created, r)
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return created, skipped, nil
}
