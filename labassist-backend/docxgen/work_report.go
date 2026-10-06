package docxgen

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"labassist/models"
)

func renderWorkReport(doc models.StaffDocument, course models.Course) ([]byte, error) {
	period := models.DocumentPeriod{}
	if doc.Period != nil {
		period = *doc.Period
	}

	sessionDesc := fmt.Sprintf("ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับรายวิชา %s %s", course.Code, course.Title)

	var sessionRows []map[string]string

	// Prefer frozen snapshot: one row per completed occurrence, each with its
	// own date/time so multi-slot days and variable schedules render correctly.
	if doc.DataSnapshot != "" {
		var ds models.DocumentDataSnapshot
		if err := json.Unmarshal([]byte(doc.DataSnapshot), &ds); err == nil {
			for _, o := range ds.Occurrences {
				if o.Status != string(models.OccurrenceCompleted) {
					continue
				}
				date, err := time.Parse("2006-01-02", o.Date)
				if err != nil {
					continue
				}
				sessionRows = append(sessionRows, map[string]string{
					"{{SESSION_DATE}}": thaiShortDate(date.Day(), int(date.Month()), date.Year()+543),
					"{{SESSION_TIME}}": buildSessionTimeFromOccurrence(o),
					"{{SESSION_DESC}}": sessionDesc,
				})
			}
		}
	}

	// Legacy fallback for documents without a snapshot.
	if len(sessionRows) == 0 {
		sessionTime := buildSessionTime(doc)
		for _, day := range doc.SessionDates {
			sessionRows = append(sessionRows, map[string]string{
				"{{SESSION_DATE}}": thaiShortDate(day, period.Month, period.Year),
				"{{SESSION_TIME}}": sessionTime,
				"{{SESSION_DESC}}": sessionDesc,
			})
		}
	}

	nameRows := make([]map[string]string, 0, len(doc.Roster))
	for _, s := range doc.Roster {
		nameRows = append(nameRows, map[string]string{
			"{{STUDENT_NAME}}": s.StudentName,
		})
	}

	scalars := map[string]string{
		"{{DEPT_HEAD_NAME}}": doc.DeptHeadName,
		"{{DEAN_NAME}}":      doc.DeanName,
	}

	return Render(RenderInput{
		TemplateFile: "work_report.docx",
		RowGroups: []RowGroup{
			{Anchor: "{{SESSION_DATE}}", Rows: sessionRows},
			{Anchor: "{{STUDENT_NAME}}", Rows: nameRows},
		},
		Scalars: scalars,
	})
}

// buildSessionTimeFromOccurrence formats the time/hours line for one occurrence row.
// Example: "เวลา 10:00 น. - 12:00 น. รวม 2 ชั่วโมง"
func buildSessionTimeFromOccurrence(o models.OccurrenceSnapshot) string {
	parts := make([]string, 0, 2)
	if o.StartTime != "" && o.EndTime != "" {
		parts = append(parts, fmt.Sprintf("เวลา %s น. - %s น.", o.StartTime, o.EndTime))
	}
	if o.Hours > 0 {
		parts = append(parts, fmt.Sprintf("รวม %s ชั่วโมง", formatDecimal(o.Hours)))
	}
	return strings.Join(parts, " ")
}

// buildSessionTime formats the session schedule description from the document's
// work schedule fields. Example output:
//
//	"วันพุธ เวลา 10:20 น. - 12:20 น. รวม 2 ชั่วโมง"
//
// Falls back to just the hour count when day/time fields are not filled in.
func buildSessionTime(doc models.StaffDocument) string {
	parts := make([]string, 0, 3)

	if doc.WorkDay != "" {
		parts = append(parts, "วัน"+doc.WorkDay)
	}
	if doc.WorkTimeStart != "" && doc.WorkTimeEnd != "" {
		parts = append(parts, fmt.Sprintf("เวลา %s น. - %s น.", doc.WorkTimeStart, doc.WorkTimeEnd))
	} else if doc.WorkTimeStart != "" {
		parts = append(parts, fmt.Sprintf("เวลา %s น.", doc.WorkTimeStart))
	}

	hoursLabel := fmt.Sprintf("รวม %s ชั่วโมง", formatDecimal(doc.HoursPerSession))
	parts = append(parts, hoursLabel)

	return strings.Join(parts, " ")
}
