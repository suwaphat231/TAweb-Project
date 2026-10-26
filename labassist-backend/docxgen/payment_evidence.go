package docxgen

import (
	"fmt"
	"strings"
	"time"

	"labassist/models"
)

// RenderPaymentRequestEvidence renders the ใบขวาง that goes with a step-3
// payment request: หลักฐานการจ่ายเงินค่าจ้างนักศึกษาปฏิบัติงาน, one page per
// month of the same frozen plan, as in the department's sample
// (ใบขวาง 517121 ก.1-อังคาร…doc). Each page bills what that month's memo
// page bills.
func RenderPaymentRequestEvidence(doc models.StaffDocument) (data []byte, filename string, err error) {
	if doc.Type != models.DocPaymentRequest {
		return nil, "", ErrNoTemplate
	}
	docXML, err := templateDocXML("payment_evidence.docx")
	if err != nil {
		return nil, "", err
	}
	if docXML, err = preparePaymentEvidenceDays(docXML); err != nil {
		return nil, "", err
	}
	bodyStart := strings.Index(docXML, "<w:body>") + len("<w:body>")
	bodyEnd := strings.LastIndex(docXML, "<w:sectPr")
	if bodyStart < len("<w:body>") || bodyEnd < bodyStart {
		return nil, "", fmt.Errorf("docxgen: payment_evidence.docx has no body")
	}
	page := inParagraphSectPr.ReplaceAllString(docXML[bodyStart:bodyEnd], "")

	months, rate, err := planMonths(doc)
	if err != nil {
		return nil, "", err
	}
	if len(months) == 0 || len(doc.Roster) == 0 {
		return nil, "", fmt.Errorf("%w: needs planned work sessions and Lab Boys to bill", ErrIncompleteDocumentData)
	}

	pages := make([]string, 0, len(months))
	for i, m := range months {
		rows := make([]map[string]string, 0, len(doc.Roster))
		for _, s := range doc.Roster {
			first, last := splitThaiName(s.StudentName)
			row := map[string]string{
				"{{STUDENT_NAME}}":    first,
				"{{STUDENT_SURNAME}}": last,
				"{{STUDENT_CODE}}":    s.StudentCode,
				"{{RATE}}":         formatDecimal(rate),
				"{{ROW_HOURS}}":    formatDecimal(m.hours),
				"{{ROW_AMOUNT}}":   formatThousands(m.perStudent),
			}
			for day := 1; day <= 31; day++ {
				row[fmt.Sprintf("{{DAY_%d}}", day)] = ""
				if h := m.dayHours[day]; h > 0 {
					row[fmt.Sprintf("{{DAY_%d}}", day)] = formatDecimal(h)
				}
			}
			rows = append(rows, row)
		}
		p, err := expandRows(page, "{{STUDENT_NAME}}", rows)
		if err != nil {
			return nil, "", fmt.Errorf("docxgen: payment_evidence.docx: %w", err)
		}
		p = blankDaysAfterMonthEnd(p, daysIn(m.date))
		total := m.perStudent * float64(len(doc.Roster))
		for token, val := range map[string]string{
			"{{MONTH_THAI}}":        thaiMonthName(int(m.date.Month())),
			"{{YEAR_BE}}":           fmt.Sprintf("%d", m.date.Year()+543),
			"{{TOTAL_HOURS}}":       formatDecimal(m.hours * float64(len(doc.Roster))),
			"{{TOTAL_AMOUNT}}":      formatThousands(total),
			"{{TOTAL_AMOUNT_TEXT}}": BahtText(total),
		} {
			p = strings.ReplaceAll(p, token, escapeXML(val))
		}
		if i > 0 {
			p = startOnNewPage(p)
		}
		pages = append(pages, p)
	}
	docXML = docXML[:bodyStart] + strings.Join(pages, "") + docXML[bodyEnd:]
	data, err = RenderWithPreparedXML("payment_evidence.docx", docXML, RenderInput{})
	if err != nil {
		return nil, "", err
	}
	return data, "หลักฐานการจ่ายเงิน " + doc.CourseRef + ".docx", nil
}

func daysIn(firstOfMonth time.Time) int {
	return firstOfMonth.AddDate(0, 1, -1).Day()
}

// blankDaysAfterMonthEnd clears the header's day numbers past the month's
// last day (29-31), as the sample does for 30-day months.
func blankDaysAfterMonthEnd(page string, days int) string {
	for _, m := range trPattern.FindAllStringIndex(page, -1) {
		row := page[m[0]:m[1]]
		if !strings.Contains(row, "<w:t>31</w:t>") {
			continue
		}
		for d := days + 1; d <= 31; d++ {
			row = strings.Replace(row, fmt.Sprintf("<w:t>%d</w:t>", d), "<w:t></w:t>", 1)
		}
		return page[:m[0]] + row + page[m[1]:]
	}
	return page
}

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
		first, last := splitThaiName(s.StudentName)
		row := map[string]string{
			"{{STUDENT_NAME}}":    first,
			"{{STUDENT_SURNAME}}": last,
			"{{STUDENT_CODE}}":    s.StudentCode,
			"{{RATE}}":            formatDecimal(doc.Rate),
			"{{ROW_HOURS}}":       formatDecimal(s.Hours),
			"{{ROW_AMOUNT}}":      formatThousands(s.Amount),
		}
		for day := 1; day <= 31; day++ {
			key := fmt.Sprintf("{{DAY_%d}}", day)
			if daySet[day] {
				row[key] = formatDecimal(doc.HoursPerSession)
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
		"{{TOTAL_HOURS}}":       formatDecimal(totalHours),
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
