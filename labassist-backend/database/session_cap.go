package database

import (
	"fmt"
	"sort"

	"gorm.io/gorm"

	"labassist/models"
)

// ErrSessionCap is returned when a change would give a schedule group more
// than models.MaxLabSessionsPerTerm lab sessions in its term.
var ErrSessionCap = fmt.Errorf("ใน 1 ภาคเรียนมี lab ได้ไม่เกิน %d ครั้ง", models.MaxLabSessionsPerTerm)

// countedSessions counts the session slots of a schedule group, or of a
// case's group-less occurrences when groupID is nil: every lab day, plus
// every holiday clash that has no makeup day yet (the makeup day, a
// scheduled row pointing back at the clash, counts in its place).
func countedSessions(tx *gorm.DB, staffCaseID uint, groupID *uint) (int, error) {
	q := tx.Model(&models.WorkOccurrence{}).Where(
		"status IN ? OR (status = ? AND NOT EXISTS (SELECT 1 FROM work_occurrences mk WHERE mk.rescheduled_from_occurrence_id = work_occurrences.id))",
		[]string{string(models.OccurrenceScheduled), string(models.OccurrenceCompleted), string(models.OccurrenceAbsent)},
		string(models.OccurrenceCancelledHoliday),
	)
	if groupID != nil {
		q = q.Where("schedule_group_id = ?", *groupID)
	} else {
		q = q.Where("staff_case_id = ? AND schedule_group_id IS NULL", staffCaseID)
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return int(n), nil
}

// checkSessionCap returns ErrSessionCap when the group already holds more lab
// sessions than allowed. Call it inside the transaction after the write so
// the write is rolled back.
func checkSessionCap(tx *gorm.DB, staffCaseID uint, groupID *uint) error {
	n, err := countedSessions(tx, staffCaseID, groupID)
	if err != nil {
		return err
	}
	if n > models.MaxLabSessionsPerTerm {
		return ErrSessionCap
	}
	return nil
}

// trimToSessionCap sorts generated occurrences by date and drops the rows past
// the cap, so weekly expansion stops at the term's last allowed session. A
// generated holiday clash has no makeup day yet, so it takes a slot too.
func trimToSessionCap(tx *gorm.DB, staffCaseID uint, groupID *uint, occs []models.WorkOccurrence) ([]models.WorkOccurrence, error) {
	n, err := countedSessions(tx, staffCaseID, groupID)
	if err != nil {
		return nil, err
	}
	left := models.MaxLabSessionsPerTerm - n
	sort.SliceStable(occs, func(i, j int) bool { return occs[i].ScheduledDate.Before(occs[j].ScheduledDate) })
	out := occs[:0]
	for _, o := range occs {
		if o.Status.CountsAsSession() || o.Status == models.OccurrenceCancelledHoliday {
			if left <= 0 {
				break
			}
			left--
		}
		out = append(out, o)
	}
	return out, nil
}
