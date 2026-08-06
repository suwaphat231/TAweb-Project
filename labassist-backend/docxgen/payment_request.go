package docxgen

import (
	"fmt"

	"labassist/models"
)

func renderPaymentRequest(doc models.StaffDocument, course models.Course) ([]byte, error) {
	period := models.DocumentPeriod{}
	if doc.Period != nil {
		period = *doc.Period
	}

	scalars := map[string]string{
		"{{REF_NUMBER}}":         doc.RefNumber,
		"{{MONTH_THAI}}":         thaiMonthName(period.Month),
		"{{YEAR_BE}}":            fmt.Sprintf("%d", period.Year),
		"{{PRIOR_MEMO_REF}}":     doc.PriorMemoRef,
		"{{PRIOR_MEMO_DATE}}":    doc.PriorMemoDate,
		"{{COURSE_CODE}}":        course.Code,
		"{{COURSE_TITLE}}":       course.Title,
		"{{SECTION}}":            fmt.Sprintf("%d", course.Section),
		"{{TOTAL_AMOUNT}}":       formatThousands(doc.TotalAmount),
		"{{TOTAL_AMOUNT_TEXT}}":  BahtText(doc.TotalAmount),
		"{{BUDGET_YEAR_BE}}":     fmt.Sprintf("%d", period.Year),
		"{{STAFF_OFFICER_NAME}}": doc.StaffOfficerName,
		"{{DEPT_HEAD_NAME}}":     doc.DeptHeadName,
	}

	return Render(RenderInput{
		TemplateFile: "payment_request.docx",
		Scalars:      scalars,
	})
}
