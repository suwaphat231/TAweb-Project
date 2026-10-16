package docxgen

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"
)

// ApprovalMemoStudent is one student listed on the approval memo.
type ApprovalMemoStudent struct {
	Name string // full name incl. title, e.g. "นายสมชาย ใจดี"
	Code string
}

// ApprovalMemoSession is one scheduled work session (a column of the
// attendance table on page 2).
type ApprovalMemoSession struct {
	Date  time.Time
	Start string // "HH:MM"
	End   string // "HH:MM"
	Hours float64
}

// ApprovalMemoInput holds everything needed to render the
// "บันทึกขออนุมัติจ้างนักศึกษาปฏิบัติงาน" memo.
type ApprovalMemoInput struct {
	RefNumber        string // appended after "อว 8613.7/"; blank leaves room for สารบรรณ
	MemoDate         time.Time
	CourseLine       string // e.g. "517121 COMPUTER PROGRAMMING SKILL I 4 (2-4-6) (กลุ่ม 1)"
	Students         []ApprovalMemoStudent
	Sessions         []ApprovalMemoSession // payable sessions only, in date order
	RateBaht         float64
	StaffOfficerName string
}

const approvalMemoTemplate = "approval_memo.docx"

// ErrIncompleteDocumentData is returned when a document lacks the data its
// template needs (no students or no payable work sessions), so handlers can
// answer with a clear message instead of rendering a half-empty memo.
var ErrIncompleteDocumentData = errors.New("docxgen: document data is incomplete")

// RenderApprovalMemo fills the approval memo template: page 1 is the memo
// body with one numbered line per student, page 2 is an attendance table
// with one rotated column per work session.
func RenderApprovalMemo(in ApprovalMemoInput) ([]byte, error) {
	docXML, err := templateDocXML(approvalMemoTemplate)
	if err != nil {
		return nil, err
	}

	var hoursPerStudent float64
	for _, s := range in.Sessions {
		hoursPerStudent += s.Hours
	}
	amountPerStudent := math.Round(hoursPerStudent*in.RateBaht*100) / 100
	totalHours := hoursPerStudent * float64(len(in.Students))
	totalAmount := amountPerStudent * float64(len(in.Students))

	studentRows := make([]map[string]string, 0, len(in.Students))
	for _, s := range in.Students {
		first, last := splitThaiName(s.Name)
		studentRows = append(studentRows, map[string]string{
			"{{STUDENT_FIRST}}": first,
			"{{STUDENT_LAST}}":  last,
			"{{STUDENT_CODE}}":  s.Code,
		})
	}
	docXML, err = expandParagraphs(docXML, "{{STUDENT_FIRST}}", studentRows)
	if err != nil {
		return nil, fmt.Errorf("docxgen: approval memo students: %w", err)
	}

	docXML, err = replaceParagraph(docXML, "{{ATTENDANCE_TABLE}}",
		buildAttendanceTable(in.Students, in.Sessions, hoursPerStudent, amountPerStudent, totalHours, totalAmount))
	if err != nil {
		return nil, fmt.Errorf("docxgen: approval memo table: %w", err)
	}

	var startDate, endDate, fiscalYear string
	if n := len(in.Sessions); n > 0 {
		startDate = thaiLongDate(in.Sessions[0].Date)
		endDate = thaiLongDate(in.Sessions[n-1].Date)
		fiscalYear = strconv.Itoa(fiscalYearBE(in.Sessions[0].Date))
	}

	scalars := map[string]string{
		"{{REF_NUMBER}}":         in.RefNumber,
		"{{MEMO_MONTH}}":         thaiMonthName(int(in.MemoDate.Month())),
		"{{MEMO_YEAR}}":          strconv.Itoa(in.MemoDate.Year() + 543),
		"{{COURSE_LINE}}":        in.CourseLine,
		"{{TOTAL_HOURS}}":        formatHours(totalHours),
		"{{RATE}}":               moneyDash(in.RateBaht),
		"{{TOTAL_AMOUNT}}":       moneyDash(totalAmount),
		"{{TOTAL_AMOUNT_TEXT}}":  BahtText(totalAmount),
		"{{START_DATE}}":         startDate,
		"{{END_DATE}}":           endDate,
		"{{FISCAL_YEAR}}":        fiscalYear,
		"{{STAFF_OFFICER_NAME}}": in.StaffOfficerName,
	}
	return RenderWithPreparedXML(approvalMemoTemplate, docXML, RenderInput{Scalars: scalars})
}

// templateDocXML returns word/document.xml of an embedded template.
func templateDocXML(name string) (string, error) {
	raw, err := templateFS.ReadFile("templates/" + name)
	if err != nil {
		return "", fmt.Errorf("docxgen: template %s: %w", name, err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return "", fmt.Errorf("docxgen: opening template %s: %w", name, err)
	}
	for _, f := range zr.File {
		if f.Name != "word/document.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		b, err := io.ReadAll(rc)
		return string(b), err
	}
	return "", fmt.Errorf("docxgen: word/document.xml missing in %s", name)
}

// paragraphBounds returns the [start, end) of the <w:p> containing anchor.
func paragraphBounds(docXML, anchor string) (int, int, bool) {
	at := strings.Index(docXML, anchor)
	if at < 0 {
		return 0, 0, false
	}
	start := max(strings.LastIndex(docXML[:at], "<w:p "), strings.LastIndex(docXML[:at], "<w:p>"))
	endRel := strings.Index(docXML[at:], "</w:p>")
	if start < 0 || endRel < 0 {
		return 0, 0, false
	}
	return start, at + endRel + len("</w:p>"), true
}

// replaceParagraph swaps the whole <w:p> containing anchor for raw XML.
func replaceParagraph(docXML, anchor, replacement string) (string, error) {
	start, end, ok := paragraphBounds(docXML, anchor)
	if !ok {
		return "", fmt.Errorf("paragraph anchor %q not found", anchor)
	}
	return docXML[:start] + replacement + docXML[end:], nil
}

// splitThaiName splits "นายสมชาย ใจดี" into ("นายสมชาย", "ใจดี").
func splitThaiName(name string) (first, last string) {
	name = strings.TrimSpace(name)
	if i := strings.Index(name, " "); i >= 0 {
		return name[:i], strings.TrimSpace(name[i+1:])
	}
	return name, ""
}

// fiscalYearBE returns the Thai government fiscal year (Oct–Sep) in BE.
func fiscalYearBE(d time.Time) int {
	y := d.Year() + 543
	if d.Month() >= time.October {
		y++
	}
	return y
}

// formatHours prints hours to at most 2 decimals: 3h35m → "3.58", 26 → "26".
func formatHours(h float64) string {
	return formatDecimal(math.Round(h*100) / 100)
}

// moneyDash formats baht the way the memo writes it: whole amounts get the
// customary ".-" suffix ("14,300.-"); amounts with satang show them instead.
func moneyDash(f float64) string {
	s := formatThousands(f)
	if !strings.Contains(s, ".") {
		s += ".-"
	}
	return s
}

// thaiLongDate renders "3 ธันวาคม 2568".
func thaiLongDate(d time.Time) string {
	return fmt.Sprintf("%d %s %d", d.Day(), thaiMonthName(int(d.Month())), d.Year()+543)
}

var thaiWeekdayAbbrevs = [...]string{"อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."}

// Column widths (twips) of the fixed attendance-table columns, taken from
// the paper form; date columns share what is left of the landscape page.
const (
	colNum         = 742
	colCode        = 1275
	colFirstName   = 1692
	colLastName    = 1948
	colHours       = 856
	colAmount      = 1420
	landscapeWidth = 15558 // 16834 page − 567 left − 709 right margin
	maxDateCol     = 450
)

// buildAttendanceTable renders page 2: one row per student, one rotated
// column per session with an "X" mark, then hour / amount totals.
func buildAttendanceTable(students []ApprovalMemoStudent, sessions []ApprovalMemoSession,
	hoursPerStudent, amountPerStudent, totalHours, totalAmount float64) string {

	n := len(sessions)
	dateW := maxDateCol
	if n > 0 {
		fixed := colNum + colCode + colFirstName + colLastName + colHours + colAmount
		dateW = min(maxDateCol, (landscapeWidth-fixed)/n)
	}
	// Shrink the rotated header text along with the column so it still fits.
	headerSz := max(16, min(32, dateW*32/maxDateCol))

	rPr := func(sz int, bold bool) string {
		b := ""
		if bold {
			b = `<w:b/><w:bCs/>`
		}
		return fmt.Sprintf(`<w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/>%s<w:sz w:val="%d"/><w:szCs w:val="%d"/><w:cs/></w:rPr>`, b, sz, sz)
	}
	para := func(text, jc string, sz int, bold bool) string {
		return `<w:p><w:pPr><w:jc w:val="` + jc + `"/>` + rPr(sz, bold) + `</w:pPr>` +
			`<w:r>` + rPr(sz, bold) + `<w:t xml:space="preserve">` + escapeXML(text) + `</w:t></w:r></w:p>`
	}
	type cellOpt struct {
		span    int
		shade   string // "header" | "total" | ""
		rotated bool
		noLeft  bool
		noRight bool
		vAlign  string
		jc      string
		sz      int
		bold    bool
	}
	cell := func(w int, text string, o cellOpt) string {
		var b strings.Builder
		fmt.Fprintf(&b, `<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>`, w)
		if o.span > 1 {
			fmt.Fprintf(&b, `<w:gridSpan w:val="%d"/>`, o.span)
		}
		if o.noLeft || o.noRight {
			b.WriteString(`<w:tcBorders>`)
			if o.noLeft {
				b.WriteString(`<w:left w:val="nil"/>`)
			}
			if o.noRight {
				b.WriteString(`<w:right w:val="nil"/>`)
			}
			b.WriteString(`</w:tcBorders>`)
		}
		switch o.shade {
		case "header":
			b.WriteString(`<w:shd w:val="pct10" w:color="000000" w:fill="FFFFFF"/>`)
		case "total":
			b.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="BFBFBF"/>`)
		}
		if o.rotated {
			b.WriteString(`<w:textDirection w:val="btLr"/>`)
		}
		vAlign := o.vAlign
		if vAlign == "" {
			vAlign = "center"
		}
		fmt.Fprintf(&b, `<w:vAlign w:val="%s"/></w:tcPr>`, vAlign)
		jc := o.jc
		if jc == "" {
			jc = "center"
		}
		sz := o.sz
		if sz == 0 {
			sz = 31
		}
		b.WriteString(para(text, jc, sz, o.bold))
		b.WriteString(`</w:tc>`)
		return b.String()
	}

	var b strings.Builder
	border := `w:val="single" w:sz="4" w:space="0" w:color="auto"`
	b.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblBorders>` +
		`<w:top ` + border + `/><w:left ` + border + `/><w:bottom ` + border + `/><w:right ` + border + `/>` +
		`<w:insideH ` + border + `/><w:insideV ` + border + `/></w:tblBorders><w:tblLayout w:type="fixed"/>` +
		`<w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr>`)

	b.WriteString(`<w:tblGrid>`)
	for _, w := range []int{colNum, colCode, colFirstName, colLastName} {
		fmt.Fprintf(&b, `<w:gridCol w:w="%d"/>`, w)
	}
	for range sessions {
		fmt.Fprintf(&b, `<w:gridCol w:w="%d"/>`, dateW)
	}
	fmt.Fprintf(&b, `<w:gridCol w:w="%d"/><w:gridCol w:w="%d"/></w:tblGrid>`, colHours, colAmount)

	// Header row — repeated if the table spills onto another page.
	hdr := cellOpt{shade: "header", sz: 32}
	rot := cellOpt{shade: "header", rotated: true, jc: "left", sz: headerSz}
	b.WriteString(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="4778"/><w:tblHeader/><w:jc w:val="center"/></w:trPr>`)
	b.WriteString(cell(colNum, "ลำดับ", hdr))
	b.WriteString(cell(colCode, "รหัส", hdr))
	b.WriteString(cell(colFirstName+colLastName, "ชื่อ-สกุล", cellOpt{span: 2, shade: "header", sz: 32}))
	for _, s := range sessions {
		label := fmt.Sprintf("%s %s เวลา %s – %s น.", thaiWeekdayAbbrevs[s.Date.Weekday()], thaiLongDate(s.Date),
			strings.ReplaceAll(s.Start, ":", "."), strings.ReplaceAll(s.End, ":", "."))
		b.WriteString(cell(dateW, label, rot))
	}
	b.WriteString(cell(colHours, "จำนวนชั่วโมงปฏิบัติงาน", cellOpt{shade: "header", rotated: true, sz: 32}))
	b.WriteString(cell(colAmount, "จำนวนเงิน", cellOpt{shade: "header", rotated: true, sz: 32}))
	b.WriteString(`</w:tr>`)

	for i, st := range students {
		first, last := splitThaiName(st.Name)
		b.WriteString(`<w:tr><w:trPr><w:cantSplit/><w:jc w:val="center"/></w:trPr>`)
		b.WriteString(cell(colNum, strconv.Itoa(i+1), cellOpt{}))
		b.WriteString(cell(colCode, st.Code, cellOpt{jc: "left"}))
		b.WriteString(cell(colFirstName, first, cellOpt{jc: "left", noRight: true}))
		b.WriteString(cell(colLastName, last, cellOpt{jc: "left", noLeft: true}))
		for range sessions {
			b.WriteString(cell(dateW, "X", cellOpt{}))
		}
		b.WriteString(cell(colHours, formatHours(hoursPerStudent), cellOpt{}))
		b.WriteString(cell(colAmount, moneyDash(amountPerStudent), cellOpt{}))
		b.WriteString(`</w:tr>`)
	}

	tot := cellOpt{shade: "total", bold: true}
	b.WriteString(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="407"/><w:jc w:val="center"/></w:trPr>`)
	b.WriteString(cell(colNum+colCode+colFirstName+colLastName+dateW*n, "รวม", cellOpt{span: 4 + n, shade: "total", bold: true}))
	b.WriteString(cell(colHours, formatHours(totalHours), tot))
	b.WriteString(cell(colAmount, moneyDash(totalAmount), tot))
	b.WriteString(`</w:tr></w:tbl>`)
	return b.String()
}

// renderApprovalMemo maps a stored approval_memo document onto
// RenderApprovalMemo, preferring the schedule frozen at creation time.
func renderApprovalMemo(doc models.StaffDocument, course models.Course) ([]byte, error) {
	occs, rateBaht, err := planOccurrences(doc)
	if err != nil {
		return nil, err
	}
	if rateBaht <= 0 {
		rateBaht = float64(database.DefaultHourlyRateSatang) / 100.0
	}

	students := make([]ApprovalMemoStudent, 0, len(doc.Roster))
	for _, r := range doc.Roster {
		students = append(students, ApprovalMemoStudent{Name: r.StudentName, Code: r.StudentCode})
	}

	sessions := approvalMemoSessions(occs)
	// Every memo needs its students; the approval memo itself also needs the
	// work dates it asks to be paid for (lab_notice may be issued before them).
	if len(students) == 0 || (doc.Type == models.DocApprovalMemo && len(sessions) == 0) {
		return nil, fmt.Errorf("%w: needs students and payable work sessions", ErrIncompleteDocumentData)
	}

	return RenderApprovalMemo(ApprovalMemoInput{
		RefNumber:        doc.RefNumber,
		MemoDate:         doc.CreatedAt,
		CourseLine:       approvalMemoCourseLine(course),
		Students:         students,
		Sessions:         sessions,
		RateBaht:         rateBaht,
		StaffOfficerName: doc.StaffOfficerName,
	})
}

// planOccurrences returns the work plan a document was issued against: the
// frozen snapshot when present, otherwise the Staff Case's live occurrences.
func planOccurrences(doc models.StaffDocument) (occs []models.OccurrenceSnapshot, rateBaht float64, err error) {
	if doc.DataSnapshot != "" {
		var ds models.DocumentDataSnapshot
		if err := json.Unmarshal([]byte(doc.DataSnapshot), &ds); err == nil {
			occs, rateBaht = ds.Occurrences, ds.RatePerHourBaht
		}
	}
	if occs == nil && doc.StaffCaseID != nil {
		live, err := database.WorkOccurrencesForCase(*doc.StaffCaseID)
		if err != nil {
			return nil, 0, fmt.Errorf("load work occurrences: %w", err)
		}
		for _, o := range live {
			occs = append(occs, models.OccurrenceSnapshot{
				Date:      o.ScheduledDate.Format("2006-01-02"),
				StartTime: o.StartTime,
				EndTime:   o.EndTime,
				Status:    string(o.Status),
			})
		}
		if sc, ok := database.StaffCaseByID(*doc.StaffCaseID); ok {
			rateBaht = float64(sc.RatePerHour) / 100.0
		}
	}
	return occs, rateBaht, nil
}

// approvalMemoSessions keeps the payable (scheduled / completed) sessions in
// date order — holidays and cancellations are not part of the request.
func approvalMemoSessions(occs []models.OccurrenceSnapshot) []ApprovalMemoSession {
	var out []ApprovalMemoSession
	for _, o := range occs {
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
		out = append(out, ApprovalMemoSession{Date: d, Start: o.StartTime, End: o.EndTime, Hours: h})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date.Before(out[j].Date) })
	return out
}

// approvalMemoCourseLine renders "517121 COMPUTER PROGRAMMING SKILL I 4 (2-4-6) (กลุ่ม 1)",
// falling back to the Thai title when no English title is on record.
func approvalMemoCourseLine(c models.Course) string {
	title := c.EnglishTitle
	if title == "" {
		title = c.Title
	}
	parts := []string{c.Code, title}
	if c.Credits != "" {
		parts = append(parts, c.Credits)
	}
	return strings.Join(parts, " ") + fmt.Sprintf(" (กลุ่ม %d)", c.Section)
}
