package database

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrStaffCaseExists is returned by CreateStaffCaseTx when a case already
// exists for the given posting. Callers should treat this as a no-op success.
var ErrStaffCaseExists = errors.New("staff case already exists for this posting")

// ErrPeriodAlreadyClosed is returned by CloseMonthlyPeriod when the period
// is already in closed state.
var ErrPeriodAlreadyClosed = errors.New("monthly period is already closed")

// PostingByIDExported provides exported access to a posting by primary key,
// including archived postings. Use ActivePostingForCourse for the current round.
func PostingByIDExported(id uint) (models.Posting, bool) {
	return postingByID(id)
}

// AcceptedStudentsForPosting returns accepted Lab Boy applications for a
// specific posting, including archived postings (for Staff Case enrichment
// after the posting may no longer be active).
func AcceptedStudentsForPosting(postingID uint) []models.Application {
	out := make([]models.Application, 0)
	var apps []models.Application
	DB.Where("posting_id = ? AND status = ?", postingID, models.AppAccepted).Find(&apps)
	for _, a := range apps {
		out = append(out, enrichApplication(a))
	}
	return out
}

// --- StaffCase ---

// CreateStaffCaseTx creates a new StaffCase inside the provided transaction.
// Returns ErrStaffCaseExists (not an error to propagate) if a case already
// exists for that posting — callers should then fetch the existing row.
// The unique index on posting_id guarantees idempotency even under concurrent requests.
func CreateStaffCaseTx(tx *gorm.DB, sc models.StaffCase) (models.StaffCase, error) {
	sc.ID = 0
	if err := tx.Create(&sc).Error; err != nil {
		// MySQL error 1062 = duplicate entry (unique index violation).
		if isDuplicateErr(err) {
			// Fetch the existing case to return it to the caller.
			var existing models.StaffCase
			if fetchErr := tx.Where("posting_id = ?", sc.PostingID).First(&existing).Error; fetchErr != nil {
				return models.StaffCase{}, fetchErr
			}
			return existing, ErrStaffCaseExists
		}
		return models.StaffCase{}, err
	}
	return sc, nil
}

// isDuplicateErr reports whether the error comes from a MySQL unique constraint.
func isDuplicateErr(err error) bool {
	if err == nil {
		return false
	}
	return containsCode1062(err.Error())
}

func containsCode1062(msg string) bool {
	return len(msg) >= 4 && (
		msg == "Error 1062: Duplicate entry" ||
		(len(msg) > 14 && msg[:14] == "Error 1062 (23") ||
		contains1062(msg))
}

func contains1062(s string) bool {
	needle := "1062"
	for i := 0; i+4 <= len(s); i++ {
		if s[i:i+4] == needle {
			return true
		}
	}
	return false
}

// EnsureStaffCase creates a StaffCase for the given posting if one does not
// already exist, and returns the case (new or existing). Safe to call after
// every instructor confirmation — the unique index on posting_id makes it
// idempotent.
// DefaultHourlyRateSatang is the system-wide default pay rate: 50 THB/hr × 100 satang.
const DefaultHourlyRateSatang int64 = 5000

func EnsureStaffCase(postingID, courseID uint, semester string, academicYear int, createdByID uint) (models.StaffCase, error) {
	var sc models.StaffCase
	err := DB.Transaction(func(tx *gorm.DB) error {
		created, err := CreateStaffCaseTx(tx, models.StaffCase{
			PostingID:    postingID,
			CourseID:     courseID,
			Semester:     semester,
			AcademicYear: academicYear,
			RatePerHour:  DefaultHourlyRateSatang,
			CreatedByID:  createdByID,
		})
		if err != nil && err != ErrStaffCaseExists {
			return err
		}
		sc = created
		return nil
	})
	return sc, err
}

// StaffCaseByID returns a StaffCase by primary key.
func StaffCaseByID(id uint) (models.StaffCase, bool) {
	var sc models.StaffCase
	if DB.First(&sc, id).Error != nil {
		return models.StaffCase{}, false
	}
	return sc, true
}

// StaffCaseByPostingID returns the StaffCase for a given posting.
func StaffCaseByPostingID(postingID uint) (models.StaffCase, bool) {
	var sc models.StaffCase
	if DB.Where("posting_id = ?", postingID).First(&sc).Error != nil {
		return models.StaffCase{}, false
	}
	return sc, true
}

// ListStaffCases returns all staff cases, optionally filtered by status.
func ListStaffCases(statusFilter string) []models.StaffCase {
	q := DB.Order("id DESC")
	if statusFilter != "" {
		q = q.Where("status = ?", statusFilter)
	}
	var out []models.StaffCase
	q.Find(&out)
	return out
}

// UpdateStaffCase applies fn to a staff case inside a SELECT FOR UPDATE transaction
// and saves the result. Returns the updated case and false on not-found or save error.
func UpdateStaffCase(id uint, fn func(sc *models.StaffCase)) (models.StaffCase, bool) {
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

// --- ScheduleGroup ---

// ScheduleGroupsForCase returns all schedule groups for a staff case.
func ScheduleGroupsForCase(staffCaseID uint) []models.ScheduleGroup {
	var out []models.ScheduleGroup
	DB.Where("staff_case_id = ?", staffCaseID).Order("id ASC").Find(&out)
	return out
}

// UpsertScheduleGroup creates a new schedule group.
func UpsertScheduleGroup(sg models.ScheduleGroup) (models.ScheduleGroup, error) {
	sg.ID = 0
	if err := DB.Create(&sg).Error; err != nil {
		return models.ScheduleGroup{}, err
	}
	return sg, nil
}

// DeleteScheduleGroup removes a schedule group and all its months/occurrences.
// Returns false if no matching row was found or the transaction fails.
func DeleteScheduleGroup(id, staffCaseID uint) bool {
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("schedule_group_id = ?", id).Delete(&models.WorkOccurrence{}).Error; err != nil {
			return err
		}
		if err := tx.Where("schedule_group_id = ?", id).Delete(&models.ScheduleGroupMonth{}).Error; err != nil {
			return err
		}
		result := tx.Where("id = ? AND staff_case_id = ?", id, staffCaseID).Delete(&models.ScheduleGroup{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("schedule group not found")
		}
		return nil
	})
	return err == nil
}

// UpdateScheduleGroupByID applies fn to a draft schedule group inside a transaction.
// Returns false if the group is not found, is already locked, or the save fails.
func UpdateScheduleGroupByID(id, staffCaseID uint, fn func(sg *models.ScheduleGroup)) (models.ScheduleGroup, bool) {
	var sg models.ScheduleGroup
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND staff_case_id = ?", id, staffCaseID).
			First(&sg).Error; err != nil {
			return err
		}
		if sg.LockedAt != nil {
			return errors.New("schedule group is locked")
		}
		fn(&sg)
		return tx.Save(&sg).Error
	})
	if err != nil {
		return models.ScheduleGroup{}, false
	}
	return sg, true
}

// LockScheduleGroup sets LockedAt/LockedByID on a schedule group to freeze its plan.
// Returns the updated group and false if not found.
func LockScheduleGroup(id, staffCaseID, lockedByID uint) (models.ScheduleGroup, bool) {
	var sg models.ScheduleGroup
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND staff_case_id = ?", id, staffCaseID).
			First(&sg).Error; err != nil {
			return err
		}
		now := time.Now()
		sg.LockedAt = &now
		sg.LockedByID = &lockedByID
		return tx.Save(&sg).Error
	})
	if err != nil {
		return models.ScheduleGroup{}, false
	}
	return sg, true
}

// --- CalendarDate ---

// CreateCalendarDate persists a new calendar date exception.
func CreateCalendarDate(cd models.CalendarDate) (models.CalendarDate, error) {
	cd.ID = 0
	if err := DB.Create(&cd).Error; err != nil {
		return models.CalendarDate{}, err
	}
	return cd, nil
}

// CalendarDateByID returns a calendar date by primary key.
func CalendarDateByID(id uint) (models.CalendarDate, bool) {
	var cd models.CalendarDate
	if DB.First(&cd, id).Error != nil {
		return models.CalendarDate{}, false
	}
	return cd, true
}

// ListCalendarDates returns calendar dates applicable to a staff case.
// It returns dates matching any of: (a) scope=global, (b) scope=semester with
// matching semester/academic_year, (c) scope=case with matching staff_case_id.
// If from/to are non-nil the results are further bounded by that date range.
func ListCalendarDates(staffCaseID uint, semester string, academicYear int, from, to *time.Time) []models.CalendarDate {
	q := DB.Where(
		"scope = ? OR (scope = ? AND semester = ? AND academic_year = ?) OR (scope = ? AND staff_case_id = ?)",
		models.DateScopeGlobal,
		models.DateScopeSemester, semester, academicYear,
		models.DateScopeCase, staffCaseID,
	)
	if from != nil {
		q = q.Where("date >= ?", from.Format("2006-01-02"))
	}
	if to != nil {
		q = q.Where("date <= ?", to.Format("2006-01-02"))
	}
	var out []models.CalendarDate
	q.Order("date ASC").Find(&out)
	return out
}

// UpdateCalendarDate applies fn to a calendar date inside a transaction.
func UpdateCalendarDate(id uint, fn func(cd *models.CalendarDate)) (models.CalendarDate, bool) {
	var cd models.CalendarDate
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&cd, id).Error; err != nil {
			return err
		}
		fn(&cd)
		return tx.Save(&cd).Error
	})
	if err != nil {
		return models.CalendarDate{}, false
	}
	return cd, true
}

// DeleteCalendarDate removes a calendar date by ID.
func DeleteCalendarDate(id uint) bool {
	result := DB.Delete(&models.CalendarDate{}, id)
	return result.Error == nil && result.RowsAffected > 0
}

// --- ScheduleGroupAssignment ---

// AssignStudentsToGroup replaces all student assignments for a schedule group.
func AssignStudentsToGroup(groupID uint, studentIDs []uint) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("schedule_group_id = ?", groupID).Delete(&models.ScheduleGroupAssignment{}).Error; err != nil {
			return err
		}
		if len(studentIDs) == 0 {
			return nil
		}
		rows := make([]models.ScheduleGroupAssignment, len(studentIDs))
		for i, sid := range studentIDs {
			rows[i] = models.ScheduleGroupAssignment{ScheduleGroupID: groupID, StudentID: sid}
		}
		return tx.Create(&rows).Error
	})
}

// GroupStudentIDs returns the student user IDs assigned to a schedule group.
func GroupStudentIDs(groupID uint) []uint {
	var rows []models.ScheduleGroupAssignment
	DB.Where("schedule_group_id = ?", groupID).Find(&rows)
	ids := make([]uint, len(rows))
	for i, r := range rows {
		ids[i] = r.StudentID
	}
	return ids
}

// WorkOccurrencesForGroup returns all occurrences linked to a schedule group, date ascending.
func WorkOccurrencesForGroup(groupID uint) []models.WorkOccurrence {
	var out []models.WorkOccurrence
	DB.Where("schedule_group_id = ?", groupID).Order("scheduled_date ASC, start_time ASC").Find(&out)
	return out
}

// WorkOccurrencesForGroupInMonth returns occurrences for a group in a specific calendar month.
func WorkOccurrencesForGroupInMonth(groupID uint, year, month int) []models.WorkOccurrence {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, -1)
	var out []models.WorkOccurrence
	DB.Where("schedule_group_id = ? AND scheduled_date >= ? AND scheduled_date <= ?",
		groupID, start.Format("2006-01-02"), end.Format("2006-01-02")).
		Order("scheduled_date ASC").Find(&out)
	return out
}

// --- WorkOccurrence ---

// GenerateWorkOccurrences expands a weekly schedule into individual occurrence
// records between startDate and endDate (inclusive). Dates in cancelledDates
// (keyed "YYYY-MM-DD" → CalendarDate.ID) are created with status=cancelled_holiday.
// Existing occurrences for the same staff case and date are NOT replaced —
// callers should clear them first if regenerating.
// scheduleGroupID is optional (nil = case-level occurrence).
func GenerateWorkOccurrences(
	staffCaseID uint,
	scheduleGroupID *uint,
	weekDay, startTime, endTime string,
	startDate, endDate time.Time,
	cancelledDates map[string]uint,
) ([]models.WorkOccurrence, error) {
	occurrences, err := buildOccurrenceSlice(staffCaseID, scheduleGroupID, weekDay, startTime, endTime, startDate, endDate, cancelledDates)
	if err != nil {
		return nil, err
	}
	if len(occurrences) == 0 {
		return []models.WorkOccurrence{}, nil
	}
	if err := DB.Create(&occurrences).Error; err != nil {
		return nil, err
	}
	return occurrences, nil
}

// WorkOccurrencesForCase returns all occurrences for a staff case, date ascending.
func WorkOccurrencesForCase(staffCaseID uint) []models.WorkOccurrence {
	var out []models.WorkOccurrence
	DB.Where("staff_case_id = ?", staffCaseID).Order("scheduled_date ASC, start_time ASC").Find(&out)
	return out
}

// WorkOccurrencesForMonth returns occurrences for a staff case in a specific
// calendar month (CE year/month).
func WorkOccurrencesForMonth(staffCaseID uint, year, month int) []models.WorkOccurrence {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, -1)
	var out []models.WorkOccurrence
	DB.Where("staff_case_id = ? AND scheduled_date >= ? AND scheduled_date <= ?",
		staffCaseID, start.Format("2006-01-02"), end.Format("2006-01-02")).
		Order("scheduled_date ASC").Find(&out)
	return out
}

// UpdateOccurrenceStatus changes the status of a work occurrence and records who changed it.
func UpdateOccurrenceStatus(id uint, status models.OccurrenceStatus, reason string, updatedByID uint) (models.WorkOccurrence, bool) {
	var occ models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&occ, id).Error; err != nil {
			return err
		}
		occ.Status = status
		occ.Reason = reason
		occ.UpdatedByID = &updatedByID
		return tx.Save(&occ).Error
	})
	if err != nil {
		return models.WorkOccurrence{}, false
	}
	return occ, true
}

// RescheduleOccurrence marks the original occurrence as rescheduled and creates
// a new occurrence on newDate. Returns (original, new, error).
func RescheduleOccurrence(
	id uint,
	newDate time.Time,
	newStart, newEnd string,
	reason string,
	updatedByID uint,
) (models.WorkOccurrence, models.WorkOccurrence, error) {
	var orig models.WorkOccurrence
	var newOcc models.WorkOccurrence

	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&orig, id).Error; err != nil {
			return err
		}
		orig.Status = models.OccurrenceRescheduled
		orig.Reason = reason
		orig.UpdatedByID = &updatedByID
		if err := tx.Save(&orig).Error; err != nil {
			return err
		}

		newOcc = models.WorkOccurrence{
			StaffCaseID:                 orig.StaffCaseID,
			ScheduleGroupID:             orig.ScheduleGroupID,
			ScheduledDate:               newDate,
			StartTime:                   newStart,
			EndTime:                     newEnd,
			Status:                      models.OccurrenceScheduled,
			RescheduledFromOccurrenceID: &orig.ID,
		}
		return tx.Create(&newOcc).Error
	})
	if err != nil {
		return models.WorkOccurrence{}, models.WorkOccurrence{}, err
	}
	return orig, newOcc, nil
}

// --- MonthlyPeriod ---

// OpenMonthlyPeriod creates a new monthly period for a staff case.
// If an open period for that month/year already exists, it is returned unchanged.
func OpenMonthlyPeriod(staffCaseID uint, month, year int) (models.MonthlyPeriod, error) {
	var existing models.MonthlyPeriod
	err := DB.Where("staff_case_id = ? AND month = ? AND year = ?", staffCaseID, month, year).
		First(&existing).Error
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.MonthlyPeriod{}, err
	}
	p := models.MonthlyPeriod{
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

// CloseMonthlyPeriod marks a monthly period as closed.
// Returns ErrPeriodAlreadyClosed if already closed; record-not-found propagates as an error.
func CloseMonthlyPeriod(id, closedByID uint) (models.MonthlyPeriod, error) {
	var p models.MonthlyPeriod
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&p, id).Error; err != nil {
			return err
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

// MonthlyPeriodsForCase returns all monthly periods for a staff case, month ascending.
func MonthlyPeriodsForCase(staffCaseID uint) []models.MonthlyPeriod {
	var out []models.MonthlyPeriod
	DB.Where("staff_case_id = ?", staffCaseID).Order("year ASC, month ASC").Find(&out)
	return out
}

// MonthlyPeriodByID returns a monthly period by primary key.
func MonthlyPeriodByID(id uint) (models.MonthlyPeriod, bool) {
	var p models.MonthlyPeriod
	if DB.First(&p, id).Error != nil {
		return models.MonthlyPeriod{}, false
	}
	return p, true
}

// --- StaffAuditLog ---

// CreateStaffAuditLog persists an audit log entry. Fire-and-forget; errors are silently dropped.
func CreateStaffAuditLog(log models.StaffAuditLog) {
	log.ID = 0
	DB.Create(&log)
}

// StaffAuditLogsForCase returns all audit log entries for a staff case, newest first.
func StaffAuditLogsForCase(staffCaseID uint) []models.StaffAuditLog {
	var out []models.StaffAuditLog
	DB.Where("staff_case_id = ?", staffCaseID).Order("id DESC").Find(&out)
	return out
}

// --- ScheduleGroupMonth ---

// ListScheduleGroupMonths returns all months registered for a schedule group.
func ListScheduleGroupMonths(groupID uint) []models.ScheduleGroupMonth {
	var out []models.ScheduleGroupMonth
	DB.Where("schedule_group_id = ?", groupID).Order("year ASC, month ASC").Find(&out)
	return out
}

// AddScheduleGroupMonth adds a new month to a schedule group.
// Returns an error if the (group_id, year, month) combination already exists.
func AddScheduleGroupMonth(m models.ScheduleGroupMonth) (models.ScheduleGroupMonth, error) {
	m.ID = 0
	if err := DB.Create(&m).Error; err != nil {
		if isDuplicateErr(err) {
			return models.ScheduleGroupMonth{}, errors.New("เดือนนี้มีอยู่แล้วในกลุ่มนี้")
		}
		return models.ScheduleGroupMonth{}, err
	}
	return m, nil
}

// DeleteScheduleGroupMonthByKey removes the month entry identified by (groupID, year, month).
func DeleteScheduleGroupMonthByKey(groupID uint, year, month int) bool {
	result := DB.Where(
		"schedule_group_id = ? AND year = ? AND month = ?", groupID, year, month,
	).Delete(&models.ScheduleGroupMonth{})
	return result.Error == nil && result.RowsAffected > 0
}

// --- Multi-day occurrence generation ---

// ParseGroupWeekDaySlots decodes the WeekDaysJSON field of a ScheduleGroup.
func ParseGroupWeekDaySlots(weekDaysJSON string) ([]models.GroupWeekDaySlot, error) {
	if weekDaysJSON == "" {
		return nil, nil
	}
	var slots []models.GroupWeekDaySlot
	if err := json.Unmarshal([]byte(weekDaysJSON), &slots); err != nil {
		return nil, err
	}
	return slots, nil
}

// buildOccurrenceSlice returns WorkOccurrence rows for one weekday slot over
// [startDate, endDate] without touching the database. Shared by
// GenerateWorkOccurrences and RegenerateGroupMonthOccurrences.
func buildOccurrenceSlice(
	staffCaseID uint, scheduleGroupID *uint,
	weekDay, startTime, endTime string,
	startDate, endDate time.Time,
	cancelledDates map[string]uint,
) ([]models.WorkOccurrence, error) {
	dayMap := map[string]time.Weekday{
		"MON": time.Monday, "TUE": time.Tuesday, "WED": time.Wednesday,
		"THU": time.Thursday, "FRI": time.Friday, "SAT": time.Saturday,
		"SUN": time.Sunday,
	}
	target, ok := dayMap[weekDay]
	if !ok {
		return nil, errors.New("invalid week_day: use MON TUE WED THU FRI SAT SUN")
	}
	var occs []models.WorkOccurrence
	for cur := startDate; !cur.After(endDate); cur = cur.AddDate(0, 0, 1) {
		if cur.Weekday() == target {
			dateStr := cur.Format("2006-01-02")
			status := models.OccurrenceScheduled
			var calDateID *uint
			if cdID, cancelled := cancelledDates[dateStr]; cancelled {
				status = models.OccurrenceCancelledHoliday
				calDateID = &cdID
			}
			occs = append(occs, models.WorkOccurrence{
				StaffCaseID:     staffCaseID,
				ScheduleGroupID: scheduleGroupID,
				ScheduledDate:   cur,
				StartTime:       startTime,
				EndTime:         endTime,
				Status:          status,
				CalendarDateID:  calDateID,
			})
		}
	}
	return occs, nil
}

// RegenerateGroupMonthOccurrences is an idempotent operation that:
//  1. Deletes all scheduled/cancelled_holiday occurrences for the group in the month
//     (completed/absent/terminal occurrences are preserved).
//  2. Creates fresh occurrences for every GroupWeekDaySlot within the month boundaries.
//
// This must only be called for unlocked schedule groups.
func RegenerateGroupMonthOccurrences(
	staffCaseID uint,
	groupID uint,
	slots []models.GroupWeekDaySlot,
	sgMonth models.ScheduleGroupMonth,
	cancelledDates map[string]uint,
) ([]models.WorkOccurrence, error) {
	// Compute the effective date range for this month.
	firstDay := time.Date(sgMonth.Year, time.Month(sgMonth.Month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)
	startDate, endDate := firstDay, lastDay
	if sgMonth.MonthStartDate != nil {
		startDate = *sgMonth.MonthStartDate
	}
	if sgMonth.MonthEndDate != nil {
		endDate = *sgMonth.MonthEndDate
	}

	gid := groupID
	var result []models.WorkOccurrence

	err := DB.Transaction(func(tx *gorm.DB) error {
		// Remove only draft occurrences (no terminal status, no replacement rows).
		draftStatuses := []string{
			string(models.OccurrenceScheduled),
			string(models.OccurrenceCancelledHoliday),
		}
		if err := tx.Where(
			"schedule_group_id = ? AND scheduled_date >= ? AND scheduled_date <= ? "+
				"AND status IN ? AND rescheduled_from_occurrence_id IS NULL",
			groupID,
			startDate.Format("2006-01-02"),
			endDate.Format("2006-01-02"),
			draftStatuses,
		).Delete(&models.WorkOccurrence{}).Error; err != nil {
			return err
		}

		// Generate fresh rows for each slot.
		for _, slot := range slots {
			occs, err := buildOccurrenceSlice(staffCaseID, &gid, slot.Day, slot.StartTime, slot.EndTime, startDate, endDate, cancelledDates)
			if err != nil {
				return err
			}
			if len(occs) == 0 {
				continue
			}
			if err := tx.Create(&occs).Error; err != nil {
				return err
			}
			result = append(result, occs...)
		}
		return nil
	})
	return result, err
}

// ComputeMonthOccurrenceSummary aggregates occurrence statistics for one month.
// effectiveRateSatang is per-hour in satang; labBoyCount is used for total pay.
func ComputeMonthOccurrenceSummary(
	occs []models.WorkOccurrence,
	year, month int,
	effectiveRateSatang int64,
	labBoyCount int,
) models.MonthOccurrenceSummary {
	s := models.MonthOccurrenceSummary{Year: year, Month: month}
	for _, o := range occs {
		s.Total++
		switch o.Status {
		case models.OccurrenceCancelledHoliday:
			s.CancelledHoliday++
		case models.OccurrenceCancelledOther:
			s.CancelledOther++
		case models.OccurrenceRescheduled:
			s.Rescheduled++
		default:
			// scheduled, completed, absent all count as "valid plan days"
			if o.Status != models.OccurrenceAbsent {
				s.Valid++
				// Compute duration in minutes.
				var durMins int64
				if len(o.StartTime) >= 5 && len(o.EndTime) >= 5 {
					var sh, sm, eh, em int
					fmt.Sscanf(o.StartTime, "%d:%d", &sh, &sm)
					fmt.Sscanf(o.EndTime, "%d:%d", &eh, &em)
					durMins = int64((eh*60+em)-(sh*60+sm))
					if durMins < 0 {
						durMins = 0
					}
				}
				s.ValidMinutes += durMins
			}
		}
	}
	s.LabBoyCount = labBoyCount
	s.RatePerHourBaht = float64(effectiveRateSatang) / 100.0
	if s.ValidMinutes > 0 {
		s.ValidHours = float64(s.ValidMinutes) / 60.0
		s.PayPerPersonBaht = float64(s.ValidMinutes) * float64(effectiveRateSatang) / 100.0 / 60.0
		s.TotalPayBaht = s.PayPerPersonBaht * float64(labBoyCount)
	}
	return s
}

// ErrDuplicateOccurrence is returned when an occurrence already exists on a
// given date within the same schedule group.
var ErrDuplicateOccurrence = errors.New("occurrence already exists on this date for the group")

// ErrTerminalOccurrence is returned when a caller tries to delete or patch
// date/time on a completed, absent, or rescheduled occurrence.
var ErrTerminalOccurrence = errors.New("cannot modify a completed, absent, or rescheduled occurrence")

// AddSingleGroupOccurrence inserts one occurrence for a specific date, setting
// status=cancelled_holiday if the date appears in cancelledDates.
// Returns ErrDuplicateOccurrence if a non-rescheduled occurrence already exists
// for the same group/date (enforced by the unique index idx_wo_group_date).
func AddSingleGroupOccurrence(
	staffCaseID, groupID uint,
	date time.Time,
	startTime, endTime string,
	cancelledDates map[string]uint,
) (models.WorkOccurrence, error) {
	gid := groupID
	dateStr := date.Format("2006-01-02")
	status := models.OccurrenceScheduled
	var calDateID *uint
	if cdID, cancelled := cancelledDates[dateStr]; cancelled {
		status = models.OccurrenceCancelledHoliday
		calDateID = &cdID
	}
	occ := models.WorkOccurrence{
		StaffCaseID:     staffCaseID,
		ScheduleGroupID: &gid,
		ScheduledDate:   time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC),
		StartTime:       startTime,
		EndTime:         endTime,
		Status:          status,
		CalendarDateID:  calDateID,
	}
	if err := DB.Create(&occ).Error; err != nil {
		if isDuplicateErr(err) {
			return models.WorkOccurrence{}, ErrDuplicateOccurrence
		}
		return models.WorkOccurrence{}, err
	}
	return occ, nil
}

// OccurrencePatch carries the fields that may be updated via PatchOccurrenceFields.
// Nil fields are left unchanged.
type OccurrencePatch struct {
	Date      *time.Time
	StartTime *string
	EndTime   *string
	Status    *models.OccurrenceStatus
	Reason    *string
}

// PatchOccurrenceFields applies a partial update to a work occurrence inside a
// transaction. Rules:
//   - Patching date/time on a completed, absent, or rescheduled occurrence returns ErrTerminalOccurrence.
//   - Setting status to rescheduled returns an error (use RescheduleOccurrence instead).
func PatchOccurrenceFields(id uint, patch OccurrencePatch, updatedByID uint) (models.WorkOccurrence, error) {
	var occ models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&occ, id).Error; err != nil {
			return err
		}
		// Terminal statuses block date/time moves and all further edits.
		if occ.Status == models.OccurrenceRescheduled ||
			occ.Status == models.OccurrenceCompleted ||
			occ.Status == models.OccurrenceAbsent {
			if patch.Date != nil || patch.StartTime != nil || patch.EndTime != nil {
				return ErrTerminalOccurrence
			}
		}
		if patch.Status != nil && *patch.Status == models.OccurrenceRescheduled {
			return errors.New("use the reschedule endpoint to set rescheduled status")
		}
		if patch.Date != nil {
			d := *patch.Date
			occ.ScheduledDate = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		}
		if patch.StartTime != nil {
			occ.StartTime = *patch.StartTime
		}
		if patch.EndTime != nil {
			occ.EndTime = *patch.EndTime
		}
		if patch.Status != nil {
			occ.Status = *patch.Status
		}
		if patch.Reason != nil {
			occ.Reason = *patch.Reason
		}
		occ.UpdatedByID = &updatedByID
		return tx.Save(&occ).Error
	})
	if err != nil {
		return models.WorkOccurrence{}, err
	}
	return occ, nil
}

// DeleteOccurrence removes a non-terminal occurrence by ID.
// Returns (true, nil) on success.
// Returns (false, ErrTerminalOccurrence) if the occurrence is completed or absent.
// Returns (false, nil) if the occurrence was not found.
func DeleteOccurrence(id uint) (bool, error) {
	var occ models.WorkOccurrence
	if err := DB.First(&occ, id).Error; err != nil {
		return false, nil // not found
	}
	if occ.Status == models.OccurrenceCompleted || occ.Status == models.OccurrenceAbsent {
		return false, ErrTerminalOccurrence
	}
	result := DB.Delete(&models.WorkOccurrence{}, id)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// --- Manual date-picking ---

// validateAndNormaliseDates returns dates that fall within year/month, sorted
// ascending and deduplicated (same calendar day counted once). Returns an error
// if any date is outside the requested month.
func validateAndNormaliseDates(year, month int, dates []time.Time) ([]time.Time, error) {
	seen := make(map[string]struct{}, len(dates))
	out := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if d.Year() != year || int(d.Month()) != month {
			return nil, fmt.Errorf("วันที่ %s ไม่อยู่ในเดือน %d/%d",
				d.Format("2006-01-02"), month, year)
		}
		key := d.Format("2006-01-02")
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		// Normalise to midnight UTC so date comparisons are unambiguous.
		out = append(out, time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Before(out[j]) })
	return out, nil
}

// resolveSlotForDate picks the start/end time for a single occurrence date.
// When WeekDaysJSON is set, the slot whose Day matches the date's weekday is
// used; if no slot matches, the first slot is the fallback. When WeekDaysJSON
// is empty the group's primary StartTime/EndTime is returned.
func resolveSlotForDate(sg models.ScheduleGroup, date time.Time) (startTime, endTime string) {
	if sg.WeekDaysJSON == "" {
		return sg.StartTime, sg.EndTime
	}
	slots, err := ParseGroupWeekDaySlots(sg.WeekDaysJSON)
	if err != nil || len(slots) == 0 {
		return sg.StartTime, sg.EndTime
	}
	dayNames := map[time.Weekday]string{
		time.Monday: "MON", time.Tuesday: "TUE", time.Wednesday: "WED",
		time.Thursday: "THU", time.Friday: "FRI", time.Saturday: "SAT", time.Sunday: "SUN",
	}
	target := dayNames[date.Weekday()]
	for _, s := range slots {
		if s.Day == target {
			return s.StartTime, s.EndTime
		}
	}
	return slots[0].StartTime, slots[0].EndTime
}

// SetGroupMonthDates replaces the draft occurrences for a schedule group in one
// calendar month with occurrences at exactly the staff-picked dates. Terminal
// occurrences (completed, absent, cancelled_other) and replacement rows
// (rescheduled_from_occurrence_id IS NOT NULL) are never deleted.
//
// Idempotent: calling again with a new list safely replaces the previous set.
// After a successful call ScheduleGroupMonth.IsManual is set to true.
func SetGroupMonthDates(
	staffCaseID uint,
	groupID uint,
	sg models.ScheduleGroup,
	sgMonth models.ScheduleGroupMonth,
	pickedDates []time.Time,
	cancelledDates map[string]uint,
) ([]models.WorkOccurrence, error) {
	normalised, err := validateAndNormaliseDates(sgMonth.Year, sgMonth.Month, pickedDates)
	if err != nil {
		return nil, err
	}

	// Effective month boundaries (respect partial-month overrides on sgMonth).
	firstDay := time.Date(sgMonth.Year, time.Month(sgMonth.Month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)
	startBound, endBound := firstDay, lastDay
	if sgMonth.MonthStartDate != nil {
		startBound = time.Date(sgMonth.MonthStartDate.Year(), sgMonth.MonthStartDate.Month(),
			sgMonth.MonthStartDate.Day(), 0, 0, 0, 0, time.UTC)
	}
	if sgMonth.MonthEndDate != nil {
		endBound = time.Date(sgMonth.MonthEndDate.Year(), sgMonth.MonthEndDate.Month(),
			sgMonth.MonthEndDate.Day(), 0, 0, 0, 0, time.UTC)
	}

	// Drop dates outside the effective boundaries (e.g. partial-month start/end).
	clamped := normalised[:0]
	for _, d := range normalised {
		if !d.Before(startBound) && !d.After(endBound) {
			clamped = append(clamped, d)
		}
	}
	normalised = clamped

	gid := groupID
	var result []models.WorkOccurrence

	err = DB.Transaction(func(tx *gorm.DB) error {
		// Remove only draft occurrences; never touch terminal or replacement rows.
		draftStatuses := []string{
			string(models.OccurrenceScheduled),
			string(models.OccurrenceCancelledHoliday),
		}
		if err := tx.Where(
			"schedule_group_id = ? AND scheduled_date >= ? AND scheduled_date <= ?"+
				" AND status IN ? AND rescheduled_from_occurrence_id IS NULL",
			groupID,
			startBound.Format("2006-01-02"),
			endBound.Format("2006-01-02"),
			draftStatuses,
		).Delete(&models.WorkOccurrence{}).Error; err != nil {
			return err
		}

		// Build one occurrence per picked date.
		occs := make([]models.WorkOccurrence, 0, len(normalised))
		for _, d := range normalised {
			start, end := resolveSlotForDate(sg, d)
			dateStr := d.Format("2006-01-02")
			status := models.OccurrenceScheduled
			var calDateID *uint
			if cdID, cancelled := cancelledDates[dateStr]; cancelled {
				status = models.OccurrenceCancelledHoliday
				calDateID = &cdID
			}
			occs = append(occs, models.WorkOccurrence{
				StaffCaseID:     staffCaseID,
				ScheduleGroupID: &gid,
				ScheduledDate:   d,
				StartTime:       start,
				EndTime:         end,
				Status:          status,
				CalendarDateID:  calDateID,
			})
		}
		if len(occs) > 0 {
			if err := tx.Create(&occs).Error; err != nil {
				return err
			}
		}
		result = occs

		// Mark this month as staff-managed (manual dates).
		return tx.Model(&models.ScheduleGroupMonth{}).
			Where("schedule_group_id = ? AND year = ? AND month = ?",
				groupID, sgMonth.Year, sgMonth.Month).
			Update("is_manual", true).Error
	})
	return result, err
}

// weekDayThai maps short day codes to Thai day names for WorkDaySlot.Day.
var weekDayThai = map[string]string{
	"MON": "วันจันทร์",
	"TUE": "วันอังคาร",
	"WED": "วันพุธ",
	"THU": "วันพฤหัสบดี",
	"FRI": "วันศุกร์",
	"SAT": "วันเสาร์",
	"SUN": "วันอาทิตย์",
}

// groupWeekSlots returns the effective weekly slots for a schedule group.
// Prefers WeekDaysJSON when non-empty; falls back to WeekDay/StartTime/EndTime.
func groupWeekSlots(sg models.ScheduleGroup) []models.GroupWeekDaySlot {
	if sg.WeekDaysJSON != "" {
		var slots []models.GroupWeekDaySlot
		if err := json.Unmarshal([]byte(sg.WeekDaysJSON), &slots); err == nil && len(slots) > 0 {
			return slots
		}
	}
	if sg.WeekDay == "" {
		return nil
	}
	return []models.GroupWeekDaySlot{{Day: sg.WeekDay, StartTime: sg.StartTime, EndTime: sg.EndTime}}
}

// HiringNoticePlanSnapshot is a read-only view derived from WorkOccurrence data.
// The backend uses it to auto-populate hiring_notice documents so that
// sessions_per_month and work_schedule are always sourced from the confirmed plan.
type HiringNoticePlanSnapshot struct {
	WorkSchedule     []models.WorkDaySlot `json:"work_schedule"`
	SessionsPerMonth int                  `json:"sessions_per_month"`
	RatePerHourBaht  float64              `json:"rate_per_hour_baht"`
	TotalValidDays   int                  `json:"total_valid_days"`
	CanCreate        bool                 `json:"can_create"`
	BlockingReasons  []string             `json:"blocking_reasons"`
}

// BuildHiringNoticeSnapshot derives the hiring notice fields from confirmed
// WorkOccurrence data. BlockingReasons is non-empty and CanCreate is false
// when the plan is incomplete.
func BuildHiringNoticeSnapshot(caseID uint) HiringNoticePlanSnapshot {
	snap := HiringNoticePlanSnapshot{BlockingReasons: []string{}}

	sc, ok := StaffCaseByID(caseID)
	if !ok {
		snap.BlockingReasons = append(snap.BlockingReasons, "ไม่พบ Staff Case")
		return snap
	}

	effectiveRate := sc.RatePerHour
	if effectiveRate == 0 {
		effectiveRate = DefaultHourlyRateSatang
	}
	snap.RatePerHourBaht = float64(effectiveRate) / 100.0

	groups := ScheduleGroupsForCase(caseID)
	if len(groups) == 0 {
		snap.BlockingReasons = append(snap.BlockingReasons, "ยังไม่มีกลุ่มตารางทำงาน")
		return snap
	}

	// Build work schedule from all groups' weekly patterns.
	var workSchedule []models.WorkDaySlot
	for _, sg := range groups {
		for _, slot := range groupWeekSlots(sg) {
			th := weekDayThai[slot.Day]
			if th == "" {
				th = slot.Day
			}
			workSchedule = append(workSchedule, models.WorkDaySlot{
				Day:       th,
				TimeStart: slot.StartTime,
				TimeEnd:   slot.EndTime,
			})
		}
	}
	snap.WorkSchedule = workSchedule

	// Count valid occurrences and distinct active months across all groups.
	totalValid := 0
	monthKeys := make(map[string]struct{})
	for _, sg := range groups {
		for _, m := range ListScheduleGroupMonths(sg.ID) {
			for _, o := range WorkOccurrencesForGroupInMonth(sg.ID, m.Year, m.Month) {
				if o.Status == models.OccurrenceScheduled || o.Status == models.OccurrenceCompleted {
					totalValid++
					monthKeys[fmt.Sprintf("%d-%02d", m.Year, m.Month)] = struct{}{}
				}
			}
		}
	}

	snap.TotalValidDays = totalValid
	if totalValid == 0 {
		snap.BlockingReasons = append(snap.BlockingReasons, "ยังไม่มีวันทำงานที่นับได้ในแผน")
	}

	numMonths := len(monthKeys)
	if numMonths > 0 {
		snap.SessionsPerMonth = (totalValid + numMonths - 1) / numMonths // ceiling division
	}

	snap.CanCreate = len(snap.BlockingReasons) == 0
	return snap
}
