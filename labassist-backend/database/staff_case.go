package database

import (
	"encoding/json"
	"errors"
	"fmt"
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

// DeleteScheduleGroup removes a schedule group from a staff case.
// Returns false if no matching row was found.
func DeleteScheduleGroup(id, staffCaseID uint) bool {
	result := DB.Where("id = ? AND staff_case_id = ?", id, staffCaseID).Delete(&models.ScheduleGroup{})
	return result.Error == nil && result.RowsAffected > 0
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
	if s.ValidMinutes > 0 {
		s.ValidHours = float64(s.ValidMinutes) / 60.0
		s.PayPerPersonBaht = float64(s.ValidMinutes) * float64(effectiveRateSatang) / 100.0 / 60.0
		s.TotalPayBaht = s.PayPerPersonBaht * float64(labBoyCount)
	}
	return s
}
