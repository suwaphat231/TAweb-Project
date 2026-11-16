package database

import (
	"log"
	"regexp"
	"strings"
	"time"

	"labassist/models"

	"gorm.io/gorm"
)

// ListAcademicEventsForYears returns the saved academic events of the given
// academic years (พ.ศ.), earliest first.
func ListAcademicEventsForYears(years []int) ([]models.AcademicEvent, error) {
	var out []models.AcademicEvent
	err := DB.Where("academic_year IN ?", years).Order("start_date ASC, id ASC").Find(&out).Error
	return out, err
}

// CountAcademicEvents is how many events are saved for an academic year.
func CountAcademicEvents(academicYear int) (int, error) {
	var n int64
	err := DB.Model(&models.AcademicEvent{}).Where("academic_year = ?", academicYear).Count(&n).Error
	return int(n), err
}

// ReplaceAcademicEvents swaps every event saved for the academic year for the
// given ones, in one transaction, so importing the calendar again corrects it
// instead of duplicating it.
func ReplaceAcademicEvents(academicYear int, events []models.AcademicEvent) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("academic_year = ?", academicYear).Delete(&models.AcademicEvent{}).Error; err != nil {
			return err
		}
		if len(events) == 0 {
			return nil
		}
		now := time.Now()
		for i := range events {
			events[i].ID, events[i].CreatedAt = 0, now
		}
		return tx.Create(&events).Error
	})
}

// Any dash-like character (hyphen, non-breaking hyphen, en/em dash, minus) or
// none at all may sit between เพิ่ม and ถอน; word order is not otherwise varied.
var addDropNameRe = regexp.MustCompile(`เพิ่ม\s*[-\x{2010}-\x{2015}\x{2212}/]?\s*ถอน`)

// addDropLateRe marks the late / fine-paying add/drop periods, which run past
// the normal deadline and must not extend the lock date.
var addDropLateRe = regexp.MustCompile(`ล่าช้า|ค่าปรับ|ชำระค่าปรับ`)

// normalizeSemester maps the student term code ("3") to the calendar's ("S").
func normalizeSemester(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	if s == "3" {
		return "S"
	}
	return s
}

// AddDropWindow returns the add/drop period of a term, read from the imported
// academic calendar. ok is false when the calendar has no such event, so
// callers must not lock anything in that case. A query failure is returned as
// err (never as ok=false) so callers can't mistake it for "no event".
func AddDropWindow(academicYear int, semester string) (start, end time.Time, ok bool, err error) {
	var events []models.AcademicEvent
	if err = DB.Where("academic_year = ? AND category IN ?", academicYear,
		[]string{models.EventRegistration, models.EventDeadline}).
		Find(&events).Error; err != nil {
		log.Printf("add/drop window: query academic_events failed: %v", err)
		return
	}
	want := normalizeSemester(semester)
	for _, e := range events {
		if normalizeSemester(e.Semester) != want || !addDropNameRe.MatchString(e.Name) || addDropLateRe.MatchString(e.Name) {
			continue
		}
		if !ok || e.EndDate.After(end) {
			end = e.EndDate
		}
		if !ok || e.StartDate.Before(start) {
			start = e.StartDate
		}
		ok = true
	}
	return
}

// AddDropClosed reports whether the term's add/drop period has ended (today in
// Bangkok is after its last day), with that last day.
func AddDropClosed(academicYear int, semester string) (closed bool, end time.Time, ok bool, err error) {
	_, end, ok, err = AddDropWindow(academicYear, semester)
	if err != nil || !ok {
		return false, time.Time{}, false, err
	}
	now := time.Now().In(bangkokLoc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	last := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)
	return today.After(last), end, true, nil
}
