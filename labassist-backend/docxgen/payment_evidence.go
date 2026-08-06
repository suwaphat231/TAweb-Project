package docxgen

import (
	"fmt"

	"labassist/models"
)

func renderPaymentEvidence(doc models.StaffDocument, course models.Course) ([]byte, error) {
	period := models.DocumentPeriod{}
	if doc.Period != nil {
		period = *doc.Period
	}

	daySet := make(map[int]bool, len(doc.SessionDates))
	for _, d := range doc.SessionDates {
		daySet[d] = true
	}

	rows := make([]map[string]string, 0, len(doc.Roster))
	var totalHours, totalAmount float64
	for _, s := range doc.Roster {
		row := map[string]string{
			"{{STUDENT_NAME}}": s.StudentName,
			"{{STUDENT_CODE}}": s.StudentCode,
			"{{RATE}}":         formatInt(doc.Rate),
			"{{ROW_HOURS}}":    formatInt(s.Hours),
			"{{ROW_AMOUNT}}":   formatThousands(s.Amount),
		}
		for day := 1; day <= 31; day++ {
			key := fmt.Sprintf("{{DAY_%d}}", day)
			if daySet[day] {
				row[key] = formatInt(doc.HoursPerSession)
			} else {
				row[key] = ""
			}
		}
		rows = append(rows, row)
		totalHours += s.Hours
		totalAmount += s.Amount
	}

	scalars := map[string]string{
		"{{MONTH_THAI}}":        thaiMonthName(period.Month),
		"{{YEAR_BE}}":           fmt.Sprintf("%d", period.Year),
		"{{TOTAL_AMOUNT_TEXT}}": BahtText(totalAmount),
		"{{TOTAL_HOURS}}":       formatInt(totalHours),
		"{{TOTAL_AMOUNT}}":      formatThousands(totalAmount),
	}

	return Render(RenderInput{
		TemplateFile: "payment_evidence.docx",
		RowGroups: []RowGroup{
			{Anchor: "{{STUDENT_NAME}}", Rows: rows},
		},
		Scalars: scalars,
	})
}
