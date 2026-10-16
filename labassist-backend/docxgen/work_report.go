package docxgen

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"labassist/models"
)

// WorkReportInput holds everything needed to render the
// "รายงานผลการปฏิบัติงานของนักศึกษา" (overtime work report).
type WorkReportInput struct {
	CourseLine   string                // e.g. "517122 COMPUTER PROGRAMMING SKILL II 4(2-4-6) (กลุ่ม 2)"
	Students     []string              // full names incl. title
	Sessions     []ApprovalMemoSession // work sessions, any order
	DeptHeadName string                // blank → defaultWorkReportDeptHead
	DeanName     string                // blank → defaultWorkReportDean
}

const workReportTemplate = "work_report.docx"

// Signatories printed on the faculty's paper form, used when the document
// does not name its own.
const (
	defaultWorkReportDeptHead = "ผู้ช่วยศาสตราจารย์ ดร.สิรักข์  แก้วจำนงค์"
	defaultWorkReportDean     = "ผู้ช่วยศาสตราจารย์ ดร.กรกช  ชั้นจิรกุล"
)

// workReportDescWidth is the longest line (in runes) the "รายการ" column
// holds at 16pt before Word would wrap it and break the row alignment.
const workReportDescWidth = 40

// RenderWorkReport fills the work report template with one page per month.
// The template body is a single month block (title + table) whose one data
// row holds each column as its own list of paragraphs — dates, times,
// description lines, and student names with a blank signing line between —
// so text wrapping in one column never shifts the others out of line.
func RenderWorkReport(in WorkReportInput) ([]byte, error) {
	docXML, err := templateDocXML(workReportTemplate)
	if err != nil {
		return nil, err
	}
	bodyStart := strings.Index(docXML, "<w:body>") + len("<w:body>")
	sectStart := strings.LastIndex(docXML, "<w:sectPr")
	if bodyStart < len("<w:body>") || sectStart < bodyStart {
		return nil, fmt.Errorf("docxgen: work report template has no body")
	}
	block := docXML[bodyStart:sectStart]

	descLines := workReportDescLines(in.CourseLine)
	var body strings.Builder
	for i, month := range sessionsByMonth(in.Sessions) {
		monthXML := block
		for token, lines := range workReportColumns(month, descLines, in.Students) {
			paras := make([]map[string]string, len(lines))
			for i, l := range lines {
				paras[i] = map[string]string{token: l}
			}
			if monthXML, err = expandParagraphs(monthXML, token, paras); err != nil {
				return nil, fmt.Errorf("docxgen: work report column %s: %w", token, err)
			}
		}
		if i > 0 {
			monthXML = withLeadingPageBreak(monthXML)
		}
		body.WriteString(monthXML)
	}
	docXML = docXML[:bodyStart] + body.String() + docXML[sectStart:]

	deptHead, dean := in.DeptHeadName, in.DeanName
	if deptHead == "" {
		deptHead = defaultWorkReportDeptHead
	}
	if dean == "" {
		dean = defaultWorkReportDean
	}
	return RenderWithPreparedXML(workReportTemplate, docXML, RenderInput{Scalars: map[string]string{
		"{{DEPT_HEAD_NAME}}": deptHead,
		"{{DEAN_NAME}}":      dean,
	}})
}

// sessionsByMonth sorts sessions and groups them by calendar month. With no
// sessions it still yields one empty month so the form renders blank.
func sessionsByMonth(sessions []ApprovalMemoSession) [][]ApprovalMemoSession {
	sorted := append([]ApprovalMemoSession(nil), sessions...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Date.Before(sorted[j].Date) })
	var months [][]ApprovalMemoSession
	for i, s := range sorted {
		if i == 0 || s.Date.Year() != sorted[i-1].Date.Year() || s.Date.Month() != sorted[i-1].Date.Month() {
			months = append(months, nil)
		}
		months[len(months)-1] = append(months[len(months)-1], s)
	}
	if len(months) == 0 {
		months = [][]ApprovalMemoSession{nil}
	}
	return months
}

// workReportColumns returns the lines of each column of one month's data
// row. Students are separated by a blank line where they sign; every column
// has at least one (possibly empty) line so its cell keeps a paragraph.
func workReportColumns(month []ApprovalMemoSession, descLines, students []string) map[string][]string {
	var dates, times, names []string
	for _, s := range month {
		dates = append(dates, thaiShortDate(s.Date.Day(), int(s.Date.Month()), s.Date.Year()+543))
		times = append(times, workReportTime(s.Start, s.End))
	}
	for i, st := range students {
		if i > 0 {
			names = append(names, "")
		}
		first, last := splitThaiName(st)
		names = append(names, "("+strings.TrimSpace(first+"  "+last)+")")
	}
	orBlank := func(l []string) []string {
		if len(l) == 0 {
			return []string{""}
		}
		return l
	}
	return map[string][]string{
		"{{WR_DATE}}": orBlank(dates),
		"{{WR_TIME}}": orBlank(times),
		"{{WR_DESC}}": orBlank(descLines),
		"{{WR_NAME}}": orBlank(names),
	}
}

// workReportTime renders "10.20 – 12.20 น." as written on the paper form.
func workReportTime(start, end string) string {
	if start == "" || end == "" {
		return ""
	}
	dot := func(s string) string { return strings.ReplaceAll(s, ":", ".") }
	return fmt.Sprintf("%s – %s น.", dot(start), dot(end))
}

// workReportDescLines splits the "รายการ" text into column-width lines.
func workReportDescLines(courseLine string) []string {
	lines := []string{"ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับ"}
	cur := ""
	for _, w := range strings.Fields("รายวิชา " + courseLine) {
		if cur != "" && len([]rune(cur))+1+len([]rune(w)) > workReportDescWidth {
			lines = append(lines, cur)
			cur = w
			continue
		}
		if cur != "" {
			cur += " "
		}
		cur += w
	}
	return append(lines, cur)
}

// withLeadingPageBreak starts a month block on a new page by putting a page
// break at the start of its first paragraph.
func withLeadingPageBreak(block string) string {
	const br = `<w:r><w:br w:type="page"/></w:r>`
	start := strings.Index(block, "<w:p ")
	if alt := strings.Index(block, "<w:p>"); alt >= 0 && (start < 0 || alt < start) {
		start = alt
	}
	if start < 0 {
		return br + block
	}
	end := start + strings.Index(block[start:], "</w:p>")
	at := start + strings.Index(block[start:], ">") + 1
	if pPr := strings.Index(block[start:end], "</w:pPr>"); pPr >= 0 {
		at = start + pPr + len("</w:pPr>")
	}
	return block[:at] + br + block[at:]
}

func renderWorkReport(doc models.StaffDocument, course models.Course) ([]byte, error) {
	occs, _ := planOccurrences(doc)
	sessions := approvalMemoSessions(occs)

	// Legacy documents carry only day numbers for one month.
	if len(sessions) == 0 && doc.Period != nil {
		for _, day := range doc.SessionDates {
			sessions = append(sessions, ApprovalMemoSession{
				Date:  time.Date(doc.Period.Year-543, time.Month(doc.Period.Month), day, 0, 0, 0, 0, time.UTC),
				Start: doc.WorkTimeStart,
				End:   doc.WorkTimeEnd,
			})
		}
	}

	students := make([]string, 0, len(doc.Roster))
	for _, r := range doc.Roster {
		students = append(students, r.StudentName)
	}
	return RenderWorkReport(WorkReportInput{
		CourseLine:   approvalMemoCourseLine(course),
		Students:     students,
		Sessions:     sessions,
		DeptHeadName: doc.DeptHeadName,
		DeanName:     doc.DeanName,
	})
}
