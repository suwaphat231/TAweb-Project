package docxgen

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"labassist/models"
)

// ErrIncompleteDocumentData is returned when a document's frozen data lacks
// what its template needs (e.g. a memo with no work dates).
var ErrIncompleteDocumentData = errors.New("docxgen: document data is incomplete")

var thaiWeekdayAbbrevs = [...]string{"อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."}

// thaiLongDate renders "3 ธันวาคม 2568".
func thaiLongDate(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), thaiMonthName(int(t.Month())), t.Year()+543)
}

// thaiFiscalYear is the Thai government budget year (1 Oct – 30 Sep, B.E.)
// a date falls in: work starting December 2568 is budget year 2569.
func thaiFiscalYear(t time.Time) int {
	y := t.Year() + 543
	if t.Month() >= time.October {
		y++
	}
	return y
}

// dotTime turns "10:20" into "10.20", the way the department writes times.
func dotTime(s string) string { return strings.Replace(s, ":", ".", 1) }

// renderApprovalMemo fills approval_memo.docx — "บันทึกข้อความ เรื่อง
// ขออนุมัติจ้างนักศึกษาปฏิบัติงาน" — entirely from the document's frozen
// roster and data snapshot, so re-downloading always gives the issued text.
//
// Hours and money follow the department's sample memo: every listed
// student works every planned session, so total hours = per-student hours ×
// students and total pay = total hours × hourly rate.
func renderApprovalMemo(doc models.StaffDocument, course models.Course) ([]byte, error) {
	var snap models.DocumentDataSnapshot
	if doc.DataSnapshot == "" || json.Unmarshal([]byte(doc.DataSnapshot), &snap) != nil {
		return nil, fmt.Errorf("%w: no work-plan snapshot", ErrIncompleteDocumentData)
	}
	type session struct {
		date       time.Time
		start, end string
		hours      float64
	}
	var sessions []session
	for _, o := range snap.Occurrences {
		if o.Status != string(models.OccurrenceScheduled) && o.Status != string(models.OccurrenceCompleted) {
			continue
		}
		d, err := time.Parse("2006-01-02", o.Date)
		if err != nil {
			continue
		}
		h := o.Hours
		if h <= 0 {
			h = hoursFromTime(o.StartTime, o.EndTime)
		}
		sessions = append(sessions, session{date: d, start: o.StartTime, end: o.EndTime, hours: h})
	}
	if len(sessions) == 0 || len(doc.Roster) == 0 || snap.RatePerHourBaht <= 0 {
		return nil, fmt.Errorf("%w: needs work dates, students and an hourly rate", ErrIncompleteDocumentData)
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].date.Before(sessions[j].date) })

	var perStudentHours float64
	for _, s := range sessions {
		perStudentHours += s.hours
	}
	totalHours := perStudentHours * float64(len(doc.Roster))
	total := math.Round(totalHours*snap.RatePerHourBaht*100) / 100

	courseText := strings.TrimSpace(course.Code + " " + course.Title)
	if c := strings.TrimSpace(course.Credits); c != "" {
		courseText += " " + c
	}
	courseText += fmt.Sprintf(" (กลุ่ม %d)", course.Section)

	students := make([]map[string]string, 0, len(doc.Roster))
	for i, r := range doc.Roster {
		students = append(students, map[string]string{
			"{{STUDENT_NO}}":   fmt.Sprintf("%d", i+1),
			"{{STUDENT_NAME}}": r.StudentName,
		})
	}
	dates := make([]map[string]string, 0, len(sessions))
	for _, s := range sessions {
		dates = append(dates, map[string]string{
			"{{WORK_DATE_LINE}}": fmt.Sprintf("%s %s เวลา %s – %s น.",
				thaiWeekdayAbbrevs[int(s.date.Weekday())], thaiLongDate(s.date), dotTime(s.start), dotTime(s.end)),
		})
	}

	// The memo is dated in the month it was created; the day is left blank
	// for the signer, as on the paper form.
	created := doc.CreatedAt.In(time.FixedZone("Asia/Bangkok", 7*60*60))
	scalars := map[string]string{
		"{{REF_NUMBER}}":         doc.RefNumber,
		"{{MONTH_THAI}}":         thaiMonthName(int(created.Month())),
		"{{YEAR_BE}}":            fmt.Sprintf("%d", created.Year()+543),
		"{{COURSE_TEXT}}":        courseText,
		"{{TOTAL_HOURS}}":        formatDecimal(math.Round(totalHours*100) / 100),
		"{{RATE}}":               formatThousands(snap.RatePerHourBaht),
		"{{TOTAL_AMOUNT}}":       formatThousands(total),
		"{{TOTAL_AMOUNT_TEXT}}":  BahtText(total),
		"{{START_DATE}}":         thaiLongDate(sessions[0].date),
		"{{END_DATE}}":           thaiLongDate(sessions[len(sessions)-1].date),
		"{{BUDGET_YEAR_BE}}":     fmt.Sprintf("%d", thaiFiscalYear(sessions[0].date)),
		"{{STAFF_OFFICER_NAME}}": doc.StaffOfficerName,
		"{{DEPT_HEAD_NAME}}":     doc.DeptHeadName,
	}
	return Render(RenderInput{
		TemplateFile: "approval_memo.docx",
		ParagraphGroups: []RowGroup{
			{Anchor: "{{STUDENT_NAME}}", Rows: students},
			{Anchor: "{{WORK_DATE_LINE}}", Rows: dates},
		},
		Scalars: scalars,
	})
}
