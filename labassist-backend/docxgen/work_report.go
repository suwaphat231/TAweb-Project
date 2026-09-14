package docxgen

import (
	"fmt"
	"strings"

	"labassist/models"
)

func renderWorkReport(doc models.StaffDocument, course models.Course) ([]byte, error) {
	period := models.DocumentPeriod{}
	if doc.Period != nil {
		period = *doc.Period
	}

	sessionTime := buildSessionTime(doc)
	sessionDesc := fmt.Sprintf("ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับรายวิชา %s %s", course.Code, course.Title)

	sessionRows := make([]map[string]string, 0, len(doc.SessionDates))
	for _, day := range doc.SessionDates {
		sessionRows = append(sessionRows, map[string]string{
			"{{SESSION_DATE}}": thaiShortDate(day, period.Month, period.Year),
			"{{SESSION_TIME}}": sessionTime,
			"{{SESSION_DESC}}": sessionDesc,
		})
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

	hoursLabel := fmt.Sprintf("รวม %s ชั่วโมง", formatInt(doc.HoursPerSession))
	parts = append(parts, hoursLabel)

	return strings.Join(parts, " ")
}
