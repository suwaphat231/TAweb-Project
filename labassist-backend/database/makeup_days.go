package database

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// A work day that falls on a holiday (status cancelled_holiday) needs a
// makeup decision: either a makeup occurrence (RescheduledFromOccurrenceID
// points back to the clash) or NoMakeup. The clash itself keeps its
// cancelled_holiday status so documents still show the holiday, and the
// makeup day counts in whichever month it falls.

var (
	ErrNotHolidayClash  = errors.New("occurrence is not a work day cancelled by a holiday")
	ErrMakeupWorked     = errors.New("the makeup day has already been worked")
	ErrMakeupTime       = errors.New("invalid makeup time")
	ErrMakeupTooLong    = errors.New("makeup hours exceed the original work day")
	ErrMakeupOutOfRange = errors.New("makeup date is outside the work plan")
	ErrMakeupHoliday    = errors.New("makeup date is a holiday")
	ErrMakeupDateTaken  = errors.New("the group already works on the makeup date")
)

const (
	MakeupPending = "pending"
	MakeupChosen  = "makeup"
	MakeupNone    = "no_makeup"
)

// MakeupDay is one holiday clash with its makeup decision, as shown to the
// instructor and staff.
type MakeupDay struct {
	OccurrenceID    uint   `json:"occurrence_id"`
	StaffCaseID     uint   `json:"staff_case_id"`
	ScheduleGroupID uint   `json:"schedule_group_id"`
	CourseID        uint   `json:"course_id"`
	CourseCode      string `json:"course_code"`
	CourseTitle     string `json:"course_title"`
	Section         int    `json:"section"`
	Semester        string `json:"semester"`
	AcademicYear    int    `json:"academic_year"`
	Date            string `json:"date"`
	StartTime       string `json:"start_time"`
	EndTime         string `json:"end_time"`
	HolidayName     string `json:"holiday_name"`
	Status          string `json:"status"` // pending | makeup | no_makeup
	// Makeup is the chosen makeup occurrence when Status = makeup.
	Makeup *models.WorkOccurrence `json:"makeup,omitempty"`
	// MinDate/MaxDate bound the makeup date; BlockedDates are holidays and
	// days the group already works inside that range.
	MinDate      string   `json:"min_date"`
	MaxDate      string   `json:"max_date"`
	BlockedDates []string `json:"blocked_dates"`
}

// hhmmMinutes parses "HH:MM" into minutes since midnight.
func hhmmMinutes(s string) (int, bool) {
	if len(s) != 5 || s[2] != ':' {
		return 0, false
	}
	h, err1 := strconv.Atoi(s[:2])
	m, err2 := strconv.Atoi(s[3:])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// checkMakeupTime reports whether start–end is a valid makeup time no longer
// than the original start–end.
func checkMakeupTime(origStart, origEnd, start, end string) error {
	s, ok1 := hhmmMinutes(start)
	e, ok2 := hhmmMinutes(end)
	if !ok1 || !ok2 || e <= s {
		return ErrMakeupTime
	}
	os, ok3 := hhmmMinutes(origStart)
	oe, ok4 := hhmmMinutes(origEnd)
	if ok3 && ok4 && e-s > oe-os {
		return ErrMakeupTooLong
	}
	return nil
}

// makeupWindow is the range a makeup date may fall in: from the first planned
// month to the end of the month after the last one, so a holiday late in the
// plan can still be made up just after it.
func makeupWindow(months []models.ScheduleGroupMonth) (from, to time.Time, ok bool) {
	if len(months) == 0 {
		return time.Time{}, time.Time{}, false
	}
	first, last := months[0], months[0]
	for _, m := range months[1:] {
		if m.Year*12+m.Month < first.Year*12+first.Month {
			first = m
		}
		if m.Year*12+m.Month > last.Year*12+last.Month {
			last = m
		}
	}
	from = time.Date(first.Year, time.Month(first.Month), 1, 0, 0, 0, 0, time.UTC)
	to = time.Date(last.Year, time.Month(last.Month), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 2, -1)
	return from, to, true
}

// makeupChildren returns the makeup occurrences of the given clashes keyed by
// the clash ID.
func makeupChildren(db *gorm.DB, clashIDs []uint) (map[uint]models.WorkOccurrence, error) {
	out := map[uint]models.WorkOccurrence{}
	if len(clashIDs) == 0 {
		return out, nil
	}
	var rows []models.WorkOccurrence
	if err := db.Where("rescheduled_from_occurrence_id IN ?", clashIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[*r.RescheduledFromOccurrenceID] = r
	}
	return out, nil
}

// decidedClashIDs returns the clashes among occs that already have a makeup
// decision; regenerating a month must keep them.
func decidedClashIDs(tx *gorm.DB, groupID uint, from, to time.Time) ([]uint, error) {
	var clashes []models.WorkOccurrence
	if err := tx.Where("schedule_group_id = ? AND scheduled_date >= ? AND scheduled_date <= ? AND status = ?",
		groupID, from.Format("2006-01-02"), to.Format("2006-01-02"), models.OccurrenceCancelledHoliday).
		Find(&clashes).Error; err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(clashes))
	for _, c := range clashes {
		ids = append(ids, c.ID)
	}
	children, err := makeupChildren(tx, ids)
	if err != nil {
		return nil, err
	}
	decided := []uint{}
	for _, c := range clashes {
		if _, has := children[c.ID]; has || c.NoMakeup {
			decided = append(decided, c.ID)
		}
	}
	return decided, nil
}

// occupiedDates returns the dates the group already has an occurrence on
// between from and to.
func occupiedDates(tx *gorm.DB, groupID uint, from, to time.Time) (map[string]bool, error) {
	var dates []time.Time
	if err := tx.Model(&models.WorkOccurrence{}).
		Where("schedule_group_id = ? AND scheduled_date >= ? AND scheduled_date <= ?",
			groupID, from.Format("2006-01-02"), to.Format("2006-01-02")).
		Pluck("scheduled_date", &dates).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(dates))
	for _, d := range dates {
		out[d.Format("2006-01-02")] = true
	}
	return out, nil
}

// PendingMakeupCount counts the case's holiday clashes still waiting for a
// makeup decision.
func PendingMakeupCount(caseID uint) (int, error) {
	var clashes []models.WorkOccurrence
	// Only group clashes can get a makeup day (MakeupDaysForCases, lockClash);
	// counting group-less ones would block the documents with no way out.
	if err := DB.Where("staff_case_id = ? AND status = ? AND no_makeup = ? AND schedule_group_id IS NOT NULL",
		caseID, models.OccurrenceCancelledHoliday, false).Find(&clashes).Error; err != nil {
		return 0, err
	}
	ids := make([]uint, 0, len(clashes))
	for _, c := range clashes {
		ids = append(ids, c.ID)
	}
	children, err := makeupChildren(DB, ids)
	if err != nil {
		return 0, err
	}
	return len(clashes) - len(children), nil
}

// MakeupDaysForCases lists every holiday clash in the given staff cases.
func MakeupDaysForCases(caseIDs []uint) ([]MakeupDay, error) {
	out := []MakeupDay{}
	if len(caseIDs) == 0 {
		return out, nil
	}
	var clashes []models.WorkOccurrence
	if err := DB.Where("staff_case_id IN ? AND status = ? AND schedule_group_id IS NOT NULL",
		caseIDs, models.OccurrenceCancelledHoliday).
		Order("scheduled_date ASC, id ASC").Find(&clashes).Error; err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(clashes))
	for _, c := range clashes {
		ids = append(ids, c.ID)
	}
	children, err := makeupChildren(DB, ids)
	if err != nil {
		return nil, err
	}

	type groupInfo struct {
		from, to time.Time
		ok       bool
		blocked  []string
	}
	groups := map[uint]*groupInfo{}
	cases := map[uint]models.StaffCase{}
	courses := map[uint]models.Course{}
	holidays := map[uint]string{}

	for _, o := range clashes {
		sc, ok := cases[o.StaffCaseID]
		if !ok {
			if sc, ok = StaffCaseByID(o.StaffCaseID); !ok {
				continue
			}
			cases[sc.ID] = sc
		}
		course, ok := courses[sc.CourseID]
		if !ok {
			if course, ok = CourseByID(sc.CourseID); !ok {
				continue
			}
			courses[course.ID] = course
		}
		gid := *o.ScheduleGroupID
		gi := groups[gid]
		if gi == nil {
			gi = &groupInfo{}
			months, err := ListScheduleGroupMonths(gid)
			if err != nil {
				return nil, err
			}
			gi.from, gi.to, gi.ok = makeupWindow(months)
			if gi.ok {
				if gi.blocked, err = blockedMakeupDates(sc, gid, gi.from, gi.to); err != nil {
					return nil, err
				}
			}
			groups[gid] = gi
		}
		if o.CalendarDateID != nil {
			if _, seen := holidays[*o.CalendarDateID]; !seen {
				if cd, ok := CalendarDateByID(*o.CalendarDateID); ok {
					holidays[cd.ID] = cd.Name
				}
			}
		}

		d := MakeupDay{
			OccurrenceID: o.ID, StaffCaseID: sc.ID, ScheduleGroupID: gid,
			CourseID: course.ID, CourseCode: course.Code, CourseTitle: course.Title, Section: course.Section,
			Semester: course.Semester, AcademicYear: course.AcademicYear,
			Date: o.ScheduledDate.Format("2006-01-02"), StartTime: o.StartTime, EndTime: o.EndTime,
			Status: MakeupPending, BlockedDates: gi.blocked,
		}
		if o.CalendarDateID != nil {
			d.HolidayName = holidays[*o.CalendarDateID]
		}
		if gi.ok {
			d.MinDate, d.MaxDate = gi.from.Format("2006-01-02"), gi.to.Format("2006-01-02")
		}
		if child, has := children[o.ID]; has {
			c := child
			d.Status, d.Makeup = MakeupChosen, &c
		} else if o.NoMakeup {
			d.Status = MakeupNone
		}
		out = append(out, d)
	}
	return out, nil
}

// blockedMakeupDates lists the holidays and the group's existing work days
// between from and to, sorted.
func blockedMakeupDates(sc models.StaffCase, groupID uint, from, to time.Time) ([]string, error) {
	taken, err := occupiedDates(DB, groupID, from, to)
	if err != nil {
		return nil, err
	}
	cds, err := ListCalendarDates(sc.ID, sc.Semester, sc.AcademicYear, &from, &to)
	if err != nil {
		return nil, err
	}
	for _, cd := range cds {
		if cd.AffectsWork != nil && *cd.AffectsWork {
			taken[cd.Date.Format("2006-01-02")] = true
		}
	}
	out := make([]string, 0, len(taken))
	for d := range taken {
		out = append(out, d)
	}
	sort.Strings(out)
	return out, nil
}

// MakeupDaysForInstructor lists the holiday clashes of the courses the
// instructor manages (all courses for an admin).
func MakeupDaysForInstructor(instructorID uint, isAdmin bool) ([]MakeupDay, error) {
	q := DB.Model(&models.StaffCase{})
	if !isAdmin {
		q = q.Joins("JOIN course_instructors ci ON ci.course_id = staff_cases.course_id AND ci.instructor_id = ? AND ci.source = 'imported' AND ci.archived_at IS NULL", instructorID)
	}
	var caseIDs []uint
	if err := q.Distinct().Pluck("staff_cases.id", &caseIDs).Error; err != nil {
		return nil, err
	}
	return MakeupDaysForCases(caseIDs)
}

// lockClash loads and locks a holiday clash inside tx.
func lockClash(tx *gorm.DB, id uint) (models.WorkOccurrence, error) {
	var o models.WorkOccurrence
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&o, id).Error; err != nil {
		return o, err
	}
	if o.Status != models.OccurrenceCancelledHoliday || o.ScheduleGroupID == nil {
		return o, ErrNotHolidayClash
	}
	return o, nil
}

// dropMakeupChild deletes the clash's makeup occurrence unless it has been
// worked already.
func dropMakeupChild(tx *gorm.DB, clashID uint) error {
	children, err := makeupChildren(tx, []uint{clashID})
	if err != nil {
		return err
	}
	child, has := children[clashID]
	if !has {
		return nil
	}
	if child.Status == models.OccurrenceCompleted || child.Status == models.OccurrenceAbsent {
		return ErrMakeupWorked
	}
	return tx.Delete(&models.WorkOccurrence{}, child.ID).Error
}

// ChooseMakeupDay sets (or replaces) the makeup day of a holiday clash. The
// date must be inside the plan window, not a holiday and not a day the group
// already works; the hours may not exceed the original day's. A makeup day in
// a month the group has no plan for yet adds that month.
func ChooseMakeupDay(clashID uint, date time.Time, start, end string, actorID uint) (models.WorkOccurrence, models.WorkOccurrence, error) {
	var clash, makeup models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		if clash, err = lockClash(tx, clashID); err != nil {
			return err
		}
		if err := checkMakeupTime(clash.StartTime, clash.EndTime, start, end); err != nil {
			return err
		}
		sc, ok := StaffCaseByID(clash.StaffCaseID)
		if !ok {
			return gorm.ErrRecordNotFound
		}
		gid := *clash.ScheduleGroupID
		var months []models.ScheduleGroupMonth
		if err := tx.Where("schedule_group_id = ?", gid).Find(&months).Error; err != nil {
			return err
		}
		from, to, ok := makeupWindow(months)
		if !ok || date.Before(from) || date.After(to) {
			return ErrMakeupOutOfRange
		}
		cds, err := ListCalendarDates(sc.ID, sc.Semester, sc.AcademicYear, &date, &date)
		if err != nil {
			return err
		}
		for _, cd := range cds {
			if cd.AffectsWork != nil && *cd.AffectsWork {
				return ErrMakeupHoliday
			}
		}
		if err := dropMakeupChild(tx, clash.ID); err != nil {
			return err
		}
		taken, err := occupiedDates(tx, gid, date, date)
		if err != nil {
			return err
		}
		if taken[date.Format("2006-01-02")] {
			return ErrMakeupDateTaken
		}

		hasMonth := false
		for _, m := range months {
			if m.Year == date.Year() && m.Month == int(date.Month()) {
				hasMonth = true
			}
		}
		if !hasMonth {
			if err := tx.Create(&models.ScheduleGroupMonth{
				ScheduleGroupID: gid, Year: date.Year(), Month: int(date.Month()), IsManual: true,
			}).Error; err != nil {
				return err
			}
		}

		makeup = models.WorkOccurrence{
			StaffCaseID: clash.StaffCaseID, ScheduleGroupID: &gid,
			ScheduledDate: date, StartTime: start, EndTime: end,
			Status:                      models.OccurrenceScheduled,
			RescheduledFromOccurrenceID: &clash.ID,
			Reason:                      "ชดเชยวันหยุด " + ThaiShortDate(clash.ScheduledDate),
			UpdatedByID:                 &actorID,
		}
		if err := tx.Create(&makeup).Error; err != nil {
			return err
		}
		if err := checkSessionCap(tx, clash.StaffCaseID, &gid); err != nil {
			return err
		}
		clash.NoMakeup = false
		clash.UpdatedByID = &actorID
		return tx.Save(&clash).Error
	})
	return clash, makeup, err
}

// DeclineMakeupDay records that a holiday clash is not made up, removing a
// makeup day chosen earlier.
func DeclineMakeupDay(clashID, actorID uint) (models.WorkOccurrence, error) {
	var clash models.WorkOccurrence
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		if clash, err = lockClash(tx, clashID); err != nil {
			return err
		}
		if err := dropMakeupChild(tx, clash.ID); err != nil {
			return err
		}
		clash.NoMakeup = true
		clash.UpdatedByID = &actorID
		return tx.Save(&clash).Error
	})
	return clash, err
}

// MakeupNotifications tells the group's Lab Boys about a makeup decision,
// and the instructors too when staff made it on their behalf.
func MakeupNotifications(clash models.WorkOccurrence, makeup *models.WorkOccurrence, byStaff bool) []models.Notification {
	sc, ok := StaffCaseByID(clash.StaffCaseID)
	if !ok || clash.ScheduleGroupID == nil {
		return nil
	}
	course, ok := CourseByID(sc.CourseID)
	if !ok {
		return nil
	}
	ref := fmt.Sprintf("%s ตอน %d", course.Code, course.Section)
	title := "วันชดเชย " + ref
	var body string
	if makeup != nil {
		body = fmt.Sprintf("วันทำงาน %s (%s–%s) ตรงกับวันหยุด ชดเชยเป็นวันที่ %s เวลา %s–%s",
			ThaiShortDate(clash.ScheduledDate), clash.StartTime, clash.EndTime,
			ThaiShortDate(makeup.ScheduledDate), makeup.StartTime, makeup.EndTime)
	} else {
		body = fmt.Sprintf("วันทำงาน %s (%s–%s) ตรงกับวันหยุด และไม่มีการชดเชย",
			ThaiShortDate(clash.ScheduledDate), clash.StartTime, clash.EndTime)
	}
	courseID := course.ID
	var out []models.Notification
	students, _ := GroupStudentIDs(*clash.ScheduleGroupID)
	for _, id := range students {
		out = append(out, models.Notification{UserID: id, CourseID: &courseID, Title: title, Body: body})
	}
	if byStaff {
		instructors, _ := InstructorsForCourse(course)
		for _, u := range instructors {
			out = append(out, models.Notification{UserID: u.ID, CourseID: &courseID, Title: title,
				Body: "เจ้าหน้าที่กำหนดแทน: " + body})
		}
	}
	return out
}

// HolidayClashNotifications asks the instructors of every course whose work
// days the holiday cancelled to choose makeup days.
func HolidayClashNotifications(cd models.CalendarDate) ([]models.Notification, error) {
	var caseIDs []uint
	if err := DB.Model(&models.WorkOccurrence{}).
		Where("calendar_date_id = ? AND status = ?", cd.ID, models.OccurrenceCancelledHoliday).
		Distinct().Pluck("staff_case_id", &caseIDs).Error; err != nil {
		return nil, err
	}
	var out []models.Notification
	for _, id := range caseIDs {
		sc, ok := StaffCaseByID(id)
		if !ok {
			continue
		}
		course, ok := CourseByID(sc.CourseID)
		if !ok {
			continue
		}
		courseID := course.ID
		instructors, err := InstructorsForCourse(course)
		if err != nil {
			return nil, err
		}
		for _, u := range instructors {
			out = append(out, models.Notification{
				UserID: u.ID, CourseID: &courseID,
				Title: fmt.Sprintf("วันทำงานชนวันหยุด %s ตอน %d", course.Code, course.Section),
				Body: fmt.Sprintf("วันที่ %s (%s) ตรงกับวันทำงานของ Lab Boy กรุณาเลือกวันชดเชยที่เมนู \"วันชดเชย\"",
					ThaiShortDate(cd.Date), cd.Name),
			})
		}
	}
	return out, nil
}

// MakeupErrorText is the message shown for a makeup decision that was
// refused, or "" when err is not a makeup rule.
func MakeupErrorText(err error) string {
	switch {
	case errors.Is(err, ErrNotHolidayClash):
		return "วันนี้ไม่ใช่วันทำงานที่ชนวันหยุด"
	case errors.Is(err, ErrMakeupWorked):
		return "วันชดเชยเดิมทำงานไปแล้ว เปลี่ยนไม่ได้"
	case errors.Is(err, ErrMakeupTime):
		return "เวลาไม่ถูกต้อง (HH:MM และเวลาเลิกต้องหลังเวลาเริ่ม)"
	case errors.Is(err, ErrMakeupTooLong):
		return "ชั่วโมงวันชดเชยต้องไม่เกินชั่วโมงของวันเดิม"
	case errors.Is(err, ErrMakeupOutOfRange):
		return "วันชดเชยต้องอยู่ในช่วงแผนปฏิบัติงาน"
	case errors.Is(err, ErrMakeupHoliday):
		return "วันที่เลือกเป็นวันหยุด"
	case errors.Is(err, ErrMakeupDateTaken):
		return "วันที่เลือกมีวันทำงานอยู่แล้ว"
	case errors.Is(err, ErrSessionCap):
		return ErrSessionCap.Error()
	}
	return ""
}

var thaiShortMonths = [...]string{"", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."}

// ThaiShortDate formats a date like "12 ส.ค. 2569".
func ThaiShortDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), thaiShortMonths[t.Month()], t.Year()+543)
}
