package docxgen

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"
)

// ErrNoTemplate is returned by RenderDocument for a DocType with no
// registered template (currently DocApprovalMemo).
var ErrNoTemplate = errors.New("docxgen: no template registered for this document type")

// RenderDocument dispatches a StaffDocument to its type's builder and
// returns the generated .docx bytes plus a suggested filename.
func RenderDocument(doc models.StaffDocument) (data []byte, filename string, err error) {
	var course models.Course
	if doc.CourseID != nil {
		var ok bool
		course, ok = database.CourseByID(*doc.CourseID)
		if !ok {
			return nil, "", fmt.Errorf("docxgen: course %d not found", *doc.CourseID)
		}
	}

	switch doc.Type {
	case models.DocHiringNotice:
		data, err = renderHiringNotice(doc, course)
	case models.DocPaymentEvidence:
		data, err = renderPaymentEvidence(doc, course)
	case models.DocPaymentRequest:
		data, err = renderPaymentRequest(doc, course)
	case models.DocWorkReport:
		data, err = renderWorkReport(doc, course)
	default:
		return nil, "", ErrNoTemplate
	}
	if err != nil {
		return nil, "", err
	}
	return data, doc.Name + ".docx", nil
}

func renderHiringNotice(doc models.StaffDocument, course models.Course) ([]byte, error) {
	students := make([]HiringNoticeStudent, 0, len(doc.Roster))
	for _, r := range doc.Roster {
		students = append(students, HiringNoticeStudent{
			StudentCode: r.StudentCode,
			StudentName: r.StudentName,
		})
	}

	semNum := 1
	switch course.Semester {
	case "2":
		semNum = 2
	case "3":
		semNum = 3
	}

	now := time.Now()
	formDate := fmt.Sprintf("%d %s %d", now.Day(), thaiMonthName(int(now.Month())), now.Year()+543)



	workSchedule := make([]WorkDayEntry, 0, len(doc.WorkSchedule))
	for _, s := range doc.WorkSchedule {
		workSchedule = append(workSchedule, WorkDayEntry{
			Day:             s.Day,
			TimeStart:       s.TimeStart,
			TimeEnd:         s.TimeEnd,
			HoursPerSession: hoursFromTime(s.TimeStart, s.TimeEnd),
		})
	}

	var globalHoursPerSession float64
	if len(workSchedule) > 0 {
		globalHoursPerSession = workSchedule[0].HoursPerSession
	}

	// Build work dates, monthly plan, and totals — prefer frozen snapshot if present,
	// fall back to live query for documents created before snapshot support.
	var workDates []WorkDateItem
	var monthlyPlan []MonthPlanEntry
	var totalSessions int
	var rateBaht float64

	if doc.DataSnapshot != "" {
		workDates, monthlyPlan, totalSessions, rateBaht = occurrencesFromSnapshot(doc.DataSnapshot)
		// Prefer snapshot work schedule over stored doc.WorkSchedule.
		if ws := workScheduleFromSnapshot(doc.DataSnapshot); len(ws) > 0 {
			workSchedule = ws
			if len(workSchedule) > 0 {
				globalHoursPerSession = workSchedule[0].HoursPerSession
			}
		}
	} else if doc.StaffCaseID != nil {
		occs := database.WorkOccurrencesForCase(*doc.StaffCaseID)
		workDates, monthlyPlan, totalSessions = occurrencesFromSlice(occs)
		if sc, ok := database.StaffCaseByID(*doc.StaffCaseID); ok && sc.RatePerHour > 0 {
			rateBaht = float64(sc.RatePerHour) / 100.0
		}
	}

	return RenderLabBoyHiringNotice(LabBoyHiringNoticeInput{
		FormDate:        formDate,
		CourseCode:      course.Code,
		CourseTitle:     course.Title,
		InstructorName:  course.InstructorName,
		Semester:        semNum,
		AcademicYear:    strconv.Itoa(course.AcademicYear),
		Students:        students,
		WorkSchedule:    workSchedule,
		WorkDates:       workDates,
		LabBoyCount:     len(doc.Roster),
		MonthlyPlan:     monthlyPlan,
		TotalSessions:   totalSessions,
		HoursPerSession: globalHoursPerSession,
		RateBaht:        rateBaht,
	})
}

// occurrencesFromSnapshot deserialises the DataSnapshot JSON and returns
// the same derived values as occurrencesFromSlice.
func occurrencesFromSnapshot(raw string) (workDates []WorkDateItem, monthlyPlan []MonthPlanEntry, totalSessions int, rateBaht float64) {
	var ds models.DocumentDataSnapshot
	if err := json.Unmarshal([]byte(raw), &ds); err != nil {
		return
	}
	rateBaht = ds.RatePerHourBaht

	type mKey struct{ year, month int }
	monthData := make(map[mKey]*MonthPlanEntry)

	for _, o := range ds.Occurrences {
		date, err := time.Parse("2006-01-02", o.Date)
		if err != nil {
			continue
		}
		isHol := o.Status == string(models.OccurrenceCancelledHoliday)
		dateStr := fmt.Sprintf("%d %s %d", date.Day(), thaiMonthName(int(date.Month())), date.Year()+543)
		workDates = append(workDates, WorkDateItem{
			Date:      dateStr,
			TimeStart: o.StartTime,
			TimeEnd:   o.EndTime,
			IsHoliday: isHol,
		})
		if o.Status == string(models.OccurrenceScheduled) || o.Status == string(models.OccurrenceCompleted) {
			k := mKey{date.Year(), int(date.Month())}
			entry := monthData[k]
			if entry == nil {
				entry = &MonthPlanEntry{MonthTH: thaiMonthName(int(date.Month())), BeYear: date.Year() + 543}
				monthData[k] = entry
			}
			entry.Count++
			entry.DateNums = append(entry.DateNums, date.Day())
			totalSessions++
		}
	}
	keys := make([]mKey, 0, len(monthData))
	for k := range monthData {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].year != keys[j].year {
			return keys[i].year < keys[j].year
		}
		return keys[i].month < keys[j].month
	})
	for _, k := range keys {
		monthlyPlan = append(monthlyPlan, *monthData[k])
	}
	return
}

// workScheduleFromSnapshot returns WorkDayEntry slice from a snapshot's WorkSchedule.
func workScheduleFromSnapshot(raw string) []WorkDayEntry {
	var ds models.DocumentDataSnapshot
	if err := json.Unmarshal([]byte(raw), &ds); err != nil {
		return nil
	}
	entries := make([]WorkDayEntry, 0, len(ds.WorkSchedule))
	for _, s := range ds.WorkSchedule {
		entries = append(entries, WorkDayEntry{
			Day:             s.Day,
			TimeStart:       s.TimeStart,
			TimeEnd:         s.TimeEnd,
			HoursPerSession: hoursFromTime(s.TimeStart, s.TimeEnd),
		})
	}
	return entries
}

// occurrencesFromSlice builds the same derived values from live WorkOccurrence records.
func occurrencesFromSlice(occs []models.WorkOccurrence) (workDates []WorkDateItem, monthlyPlan []MonthPlanEntry, totalSessions int) {
	type mKey struct{ year, month int }
	monthData := make(map[mKey]*MonthPlanEntry)

	for _, o := range occs {
		isHol := o.Status == models.OccurrenceCancelledHoliday
		dateStr := fmt.Sprintf("%d %s %d", o.ScheduledDate.Day(), thaiMonthName(int(o.ScheduledDate.Month())), o.ScheduledDate.Year()+543)
		workDates = append(workDates, WorkDateItem{
			Date:      dateStr,
			TimeStart: o.StartTime,
			TimeEnd:   o.EndTime,
			IsHoliday: isHol,
		})
		if o.Status == models.OccurrenceScheduled || o.Status == models.OccurrenceCompleted {
			k := mKey{o.ScheduledDate.Year(), int(o.ScheduledDate.Month())}
			entry := monthData[k]
			if entry == nil {
				entry = &MonthPlanEntry{MonthTH: thaiMonthName(int(o.ScheduledDate.Month())), BeYear: o.ScheduledDate.Year() + 543}
				monthData[k] = entry
			}
			entry.Count++
			entry.DateNums = append(entry.DateNums, o.ScheduledDate.Day())
			totalSessions++
		}
	}
	keys := make([]mKey, 0, len(monthData))
	for k := range monthData {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].year != keys[j].year {
			return keys[i].year < keys[j].year
		}
		return keys[i].month < keys[j].month
	})
	for _, k := range keys {
		monthlyPlan = append(monthlyPlan, *monthData[k])
	}
	return
}

// hoursFromTime parses two "HH:MM" strings and returns the duration in hours.
func hoursFromTime(start, end string) float64 {
	var sh, sm, eh, em int
	fmt.Sscanf(start, "%d:%d", &sh, &sm)
	fmt.Sscanf(end, "%d:%d", &eh, &em)
	mins := (eh*60 + em) - (sh*60 + sm)
	if mins <= 0 {
		return 0
	}
	return float64(mins) / 60.0
}

// formatInt renders a whole-number float without a trailing ".0".
// Use only for quantities known to always be integers (session counts, etc.).
func formatInt(f float64) string {
	return strconv.FormatInt(int64(math.Round(f)), 10)
}

// formatDecimal preserves fractional hours and rates without trailing zeros.
func formatDecimal(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// formatThousands formats a monetary baht amount with comma thousands
// separators, showing satang digits only when non-zero.
// Examples: 3300 → "3,300"  |  3300.5 → "3,300.50"
func formatThousands(f float64) string {
	// Round to nearest satang before formatting.
	rounded := math.Round(f*100) / 100
	neg := rounded < 0
	if neg {
		rounded = -rounded
	}
	intPart := int64(rounded)
	fracCents := int64(math.Round((rounded - float64(intPart)) * 100))

	s := strconv.FormatInt(intPart, 10)
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	result := string(out)
	if fracCents != 0 {
		result += fmt.Sprintf(".%02d", fracCents)
	}
	if neg {
		result = "-" + result
	}
	return result
}
