package docxgen

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"
)

// paymentMonth is one page of the payment request: a month of the plan.
type paymentMonth struct {
	date   time.Time // first of the month
	amount float64
}

// renderPaymentRequest renders บันทึกขออนุมัติเบิกจ่ายเงินค่าตอบแทนนักศึกษาปฏิบัติงาน.
// Like the department's sample, a document built from the approval memo's
// plan has one memo page per planned month, each billing that month for the
// memo's Lab Boys. Older monthly documents (Period + TotalAmount, no plan)
// still render as a single page.
func renderPaymentRequest(doc models.StaffDocument, course models.Course) ([]byte, error) {
	docXML, err := templateDocXML("payment_request.docx")
	if err != nil {
		return nil, err
	}
	bodyStart := strings.Index(docXML, "<w:body>") + len("<w:body>")
	bodyEnd := strings.LastIndex(docXML, "<w:sectPr")
	if bodyStart < len("<w:body>") || bodyEnd < bodyStart {
		return nil, fmt.Errorf("docxgen: payment_request.docx has no body")
	}
	// The template has a stray section break inside a paragraph; copied per
	// month it would start blank pages. The final <w:sectPr> stays.
	page := inParagraphSectPr.ReplaceAllString(docXML[bodyStart:bodyEnd], "")

	months, err := paymentMonths(doc)
	if err != nil {
		return nil, err
	}
	if len(months) == 0 {
		return nil, fmt.Errorf("%w: needs planned work sessions to bill", ErrIncompleteDocumentData)
	}

	title := course.EnglishTitle
	if title == "" {
		title = course.Title
	}
	if course.Credits != "" {
		title += " " + course.Credits
	}
	priorDate := doc.PriorMemoDate
	if d, err := time.Parse("2006-01-02", priorDate); err == nil {
		priorDate = thaiLongDate(d)
	}

	// The memo's own number is written by hand after the department prefix,
	// as on the sample.
	ref := doc.RefNumber
	if ref == "" {
		// Leave room to write the number, as the sample does.
		ref = paymentRequestRefPrefix + strings.Repeat(" ", 24)
	}

	pages := make([]string, 0, len(months))
	for i, m := range months {
		scalars := map[string]string{
			"{{REF_NUMBER}}":         ref,
			"{{MONTH_THAI}}":         thaiMonthName(int(m.date.Month())),
			"{{YEAR_BE}}":            fmt.Sprintf("%d", m.date.Year()+543),
			"{{PRIOR_MEMO_REF}}":     doc.PriorMemoRef,
			"{{PRIOR_MEMO_DATE}}":    priorDate,
			"{{COURSE_CODE}}":        course.Code,
			"{{COURSE_TITLE}}":       title,
			"{{SECTION}}":            fmt.Sprintf("%d", course.Section),
			"{{TOTAL_AMOUNT}}":       formatThousands(m.amount),
			"{{TOTAL_AMOUNT_TEXT}}":  BahtText(m.amount),
			"{{BUDGET_YEAR_BE}}":     fmt.Sprintf("%d", fiscalYearBE(m.date)),
			"{{STAFF_OFFICER_NAME}}": doc.StaffOfficerName,
			"{{DEPT_HEAD_NAME}}":     doc.DeptHeadName,
		}
		p := page
		for token, val := range scalars {
			p = strings.ReplaceAll(p, token, escapeXML(val))
		}
		if i > 0 {
			p = startOnNewPage(p)
		}
		pages = append(pages, p)
	}
	docXML = docXML[:bodyStart] + strings.Join(pages, "") + docXML[bodyEnd:]
	return RenderWithPreparedXML("payment_request.docx", docXML, RenderInput{})
}

const paymentRequestRefPrefix = "อว 8613.7/"

var inParagraphSectPr = regexp.MustCompile(`(?s)<w:sectPr[ >].*?</w:sectPr>`)

// startOnNewPage makes the first paragraph of body start a new page. The
// template's page is nearly full, so a separate page-break paragraph would
// spill onto a blank page of its own.
func startOnNewPage(body string) string {
	const pPr = "<w:pPr>"
	i := strings.Index(body, pPr)
	if i < 0 || i > strings.Index(body, "</w:p>") {
		return strings.Replace(body, "<w:p>", "<w:p><w:pPr><w:pageBreakBefore/></w:pPr>", 1)
	}
	at := i + len(pPr)
	// pStyle must come first inside pPr; pageBreakBefore follows it.
	if strings.HasPrefix(body[at:], "<w:pStyle ") {
		at += strings.Index(body[at:], "/>") + len("/>")
	}
	return body[:at] + "<w:pageBreakBefore/>" + body[at:]
}

// paymentMonths bills each month of the document's frozen plan: payable
// hours x rate for every Lab Boy on the roster. Without a plan it falls back
// to the document's own Period and TotalAmount.
func paymentMonths(doc models.StaffDocument) ([]paymentMonth, error) {
	occs, rate, err := planOccurrences(doc)
	if err != nil {
		return nil, err
	}
	if rate <= 0 {
		rate = float64(database.DefaultHourlyRateSatang) / 100.0
	}
	var out []paymentMonth
	hours := map[time.Time]float64{}
	for _, s := range approvalMemoSessions(occs) {
		first := time.Date(s.Date.Year(), s.Date.Month(), 1, 0, 0, 0, 0, time.UTC)
		if _, ok := hours[first]; !ok {
			out = append(out, paymentMonth{date: first})
		}
		hours[first] += s.Hours
	}
	for i := range out {
		perStudent := math.Round(hours[out[i].date]*rate*100) / 100
		out[i].amount = perStudent * float64(len(doc.Roster))
	}
	if len(out) == 0 && doc.Period != nil && doc.Period.Month >= 1 {
		out = append(out, paymentMonth{
			date:   time.Date(doc.Period.Year-543, time.Month(doc.Period.Month), 1, 0, 0, 0, 0, time.UTC),
			amount: doc.TotalAmount,
		})
	}
	return out, nil
}
