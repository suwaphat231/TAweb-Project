package docxgen

import (
	"fmt"

	"labassist/models"
)

func renderWorkReport(doc models.StaffDocument, course models.Course) ([]byte, error) {
	period := models.DocumentPeriod{}
	if doc.Period != nil {
		period = *doc.Period
	}

	sessionDesc := fmt.Sprintf("ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับรายวิชา %s %s", course.Code, course.Title)
	sessionTime := fmt.Sprintf("%s ชม.", formatInt(doc.HoursPerSession))

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
