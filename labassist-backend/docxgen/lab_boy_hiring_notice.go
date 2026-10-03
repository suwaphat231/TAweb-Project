package docxgen

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"strings"
)

// WorkDayEntry holds one weekly recurring work slot for rendering into the
// "วันปฏิบัติงานในแต่ละสัปดาห์" table rows of the hiring notice.
type WorkDayEntry struct {
	Day       string // e.g. "วันพุธ"
	TimeStart string // e.g. "10:00"
	TimeEnd   string // e.g. "12:00"
}

// LabBoyHiringNoticeInput holds all data needed to render the hiring intent form.
type LabBoyHiringNoticeInput struct {
	FormDate       string // e.g. "13 กันยายน 2569"
	CourseCode     string
	CourseTitle    string
	InstructorName string
	Semester       int    // 1=ต้น, 2=ปลาย, 3=ฤดูร้อน
	AcademicYear   string // BE year e.g. "2568"
	Students       []HiringNoticeStudent
	WorkSchedule   []WorkDayEntry // up to 3 weekly slots
}

// HiringNoticeStudent represents one accepted student in the form.
type HiringNoticeStudent struct {
	StudentCode string
	StudentName string
}

// RenderLabBoyHiringNotice generates a pre-filled hiring intent .docx from the
// embedded lab_boy_hiring_notice.docx template. Token placeholders are injected
// at render time because the original template has no existing {{}} tokens.
func RenderLabBoyHiringNotice(in LabBoyHiringNoticeInput) ([]byte, error) {
	raw, err := templateFS.ReadFile("templates/lab_boy_hiring_notice.docx")
	if err != nil {
		return nil, fmt.Errorf("docxgen: lab_boy_hiring_notice.docx: %w", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, fmt.Errorf("docxgen: opening lab_boy_hiring_notice.docx: %w", err)
	}

	entries := make(map[string][]byte, len(zr.File))
	var docXML string
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		if f.Name == "word/document.xml" {
			docXML = string(b)
		} else {
			entries[f.Name] = b
		}
	}
	if docXML == "" {
		return nil, fmt.Errorf("docxgen: word/document.xml missing in lab_boy_hiring_notice.docx")
	}

	// Inject {{TOKEN}} placeholders into the raw template XML.
	docXML = prepareHiringNoticeTemplate(docXML)
	// Fill the 3 work-day rows directly (no token needed — values are ready).
	docXML = injectWorkSchedule(docXML, in.WorkSchedule)

	checkChar := func(selected bool) string {
		if selected {
			return "■"
		}
		return "□"
	}

	scalars := map[string]string{
		"{{FORM_DATE}}":       in.FormDate,
		"{{COURSE_CODE}}":     in.CourseCode,
		"{{COURSE_TITLE}}":    in.CourseTitle,
		"{{INSTRUCTOR_NAME}}": in.InstructorName,
		"{{ACADEMIC_YEAR}}":   in.AcademicYear,
		"{{SEMESTER_1_BOX}}":  checkChar(in.Semester == 1),
		"{{SEMESTER_2_BOX}}":  checkChar(in.Semester == 2),
		"{{SEMESTER_3_BOX}}":  checkChar(in.Semester == 3),
		"{{TYPE_TA_BOX}}":     checkChar(false),
		"{{TYPE_LABBOY_BOX}}": checkChar(true),
	}

	rows := make([]map[string]string, 0, len(in.Students))
	for i, s := range in.Students {
		rows = append(rows, map[string]string{
			"{{ROW_NUM}}":      fmt.Sprintf("%d", i+1),
			"{{STUDENT_CODE}}": s.StudentCode,
			"{{STUDENT_NAME}}": s.StudentName,
		})
	}

	// expandRows with empty slice removes the template row entirely (correct for 0 students).
	docXML, err = expandRows(docXML, "{{ROW_NUM}}", rows)
	if err != nil {
		return nil, fmt.Errorf("docxgen: student row expansion: %w", err)
	}

	for token, val := range scalars {
		docXML = strings.ReplaceAll(docXML, token, escapeXML(val))
	}

	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, f := range zr.File {
		w, err := zw.Create(f.Name)
		if err != nil {
			return nil, err
		}
		if f.Name == "word/document.xml" {
			if _, err := w.Write([]byte(docXML)); err != nil {
				return nil, err
			}
		} else if _, err := w.Write(entries[f.Name]); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// prepareHiringNoticeTemplate injects {{TOKEN}} placeholders into the raw
// template XML. The original form has no tokens — this function adds them via
// targeted string replacement anchored on unique surrounding XML patterns.
func prepareHiringNoticeTemplate(docXML string) string {
	// Standard text run matching the document style (TH Sarabun New, 16pt).
	run := func(token string) string {
		return `<w:r><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>` + token + `</w:t></w:r>`
	}

	// 1. Form date — top-right bordered cell (bold rPr, unique end-of-first-table marker).
	docXML = strings.Replace(docXML,
		`<w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr></w:p></w:tc></w:tr></w:tbl>`,
		`<w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr>`+run("{{FORM_DATE}}")+`</w:p></w:tc></w:tr></w:tbl>`,
		1)

	// 2. Course code — empty cell (w:w="2074") immediately after "รหัสวิชา" label.
	const codeCellSuffix = `</w:pPr></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4230"`
	codeLabel := `<w:t>รหัสวิชา</w:t>`
	codeLabelIdx := strings.Index(docXML, codeLabel)
	if codeLabelIdx >= 0 {
		// The empty course-code paragraph closes just before the next merged cell.
		rest := docXML[codeLabelIdx:]
		sfxIdx := strings.Index(rest, codeCellSuffix)
		if sfxIdx >= 0 {
			insertAt := codeLabelIdx + sfxIdx
			docXML = docXML[:insertAt] + run("{{COURSE_CODE}}") + docXML[insertAt:]
		}
	}

	// 3. Semester checkboxes — replace F0A3 Wingdings symbols in order:
	//    occurrence 1 → ต้น, 2 → ปลาย, 3 → ฤดูร้อน.
	sym := `<w:sym w:font="Wingdings 2" w:char="F0A3"/>`
	docXML = strings.Replace(docXML, sym, `<w:t>{{SEMESTER_1_BOX}}</w:t>`, 1)
	docXML = strings.Replace(docXML, sym, `<w:t>{{SEMESTER_2_BOX}}</w:t>`, 1)
	docXML = strings.Replace(docXML, sym, `<w:t>{{SEMESTER_3_BOX}}</w:t>`, 1)
	// Occurrences 4 (นักศึกษาช่วยสอน/TA) and 5 (ช่วยคุมปฏิบัติการ/Lab Boy).
	docXML = strings.Replace(docXML, sym, `<w:t>{{TYPE_TA_BOX}}</w:t>`, 1)
	docXML = strings.Replace(docXML, sym, `<w:t>{{TYPE_LABBOY_BOX}}</w:t>`, 1)

	// 4. Academic year — replace the dotted-tab runs that follow "ปีการศึกษา".
	const yearLabel = `<w:t>ปีการศึกษา</w:t></w:r>`
	yearIdx := strings.Index(docXML, yearLabel)
	if yearIdx >= 0 {
		after := yearIdx + len(yearLabel)
		cellEnd := strings.Index(docXML[after:], `</w:p></w:tc>`)
		if cellEnd >= 0 {
			docXML = docXML[:after] + run("{{ACADEMIC_YEAR}}") + docXML[after+cellEnd:]
		}
	}

	// 5. Course title — empty merged cell (4 cols) immediately after "ชื่อรายวิชา".
	const titleLabel = `<w:t>ชื่อรายวิชา</w:t></w:r></w:p></w:tc>`
	titleIdx := strings.Index(docXML, titleLabel)
	if titleIdx >= 0 {
		after := titleIdx + len(titleLabel)
		pprEnd := strings.Index(docXML[after:], `</w:pPr></w:p>`)
		if pprEnd >= 0 {
			insertAt := after + pprEnd + len(`</w:pPr>`)
			docXML = docXML[:insertAt] + run("{{COURSE_TITLE}}") + docXML[insertAt:]
		}
	}

	// 6. Instructor name — empty merged cell immediately after "อาจารย์ผู้สอน".
	const instrLabel = `<w:t>อาจารย์ผู้สอน</w:t></w:r></w:p></w:tc>`
	instrIdx := strings.Index(docXML, instrLabel)
	if instrIdx >= 0 {
		after := instrIdx + len(instrLabel)
		pprEnd := strings.Index(docXML[after:], `</w:pPr></w:p>`)
		if pprEnd >= 0 {
			insertAt := after + pprEnd + len(`</w:pPr>`)
			docXML = docXML[:insertAt] + run("{{INSTRUCTOR_NAME}}") + docXML[insertAt:]
		}
	}

	// 7. Student rows — tokenize row 1, then delete rows 2-10.
	// Row 1 number cell: replace "1." with the row-number token.
	docXML = strings.Replace(docXML, `<w:t>1.</w:t>`, `<w:t>{{ROW_NUM}}.</w:t>`, 1)

	// Student code cell (w:w="1607") — inject into first (row-1) occurrence.
	const codeCellBase = `<w:tcW w:w="1607" w:type="dxa"/></w:tcPr><w:p w:rsidR="00394FB8" w:rsidRPr="00A57B1F" w:rsidRDefault="00394FB8" w:rsidP="00862E0C"><w:pPr><w:pStyle w:val="PlainText"/><w:spacing w:line="228" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr>`
	docXML = strings.Replace(docXML,
		codeCellBase+`</w:p>`,
		codeCellBase+run("{{STUDENT_CODE}}")+`</w:p>`,
		1)

	// Student name cell (w:w="8010") — inject into first (row-1) occurrence.
	const nameCellBase = `<w:tcW w:w="8010" w:type="dxa"/></w:tcPr><w:p w:rsidR="00394FB8" w:rsidRPr="00A57B1F" w:rsidRDefault="00394FB8" w:rsidP="00862E0C"><w:pPr><w:pStyle w:val="PlainText"/><w:spacing w:line="228" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr>`
	docXML = strings.Replace(docXML,
		nameCellBase+`</w:p>`,
		nameCellBase+run("{{STUDENT_NAME}}")+`</w:p>`,
		1)

	// Delete rows 2-10 in reverse order so index positions remain valid.
	for n := 10; n >= 2; n-- {
		target := fmt.Sprintf("<w:t>%d.</w:t>", n)
		tIdx := strings.Index(docXML, target)
		if tIdx < 0 {
			continue
		}
		rowStart := strings.LastIndex(docXML[:tIdx], "<w:tr ")
		rowEnd := strings.Index(docXML[tIdx:], "</w:tr>")
		if rowStart >= 0 && rowEnd >= 0 {
			rowEnd = tIdx + rowEnd + len("</w:tr>")
			docXML = docXML[:rowStart] + docXML[rowEnd:]
		}
	}

	return docXML
}

// injectWorkSchedule fills up to 3 work-day rows in the template's
// "วันปฏิบัติงานในแต่ละสัปดาห์" table. Each row has 3 input cells:
//   - day name  (w:w="1536")
//   - time start (w:w="993")
//   - time end   (w:w="1068")
//
// The cells each contain a <w:tab/> placeholder that gets replaced with the
// actual text. Sequential calls to injectFirstTabCell skip already-filled
// cells, so rows are filled in document order.
func injectWorkSchedule(docXML string, schedule []WorkDayEntry) string {
	for i, entry := range schedule {
		if i >= 3 {
			break
		}
		if entry.Day != "" {
			docXML = injectFirstTabCell(docXML, "1536", escapeXML(entry.Day))
		}
		if entry.TimeStart != "" {
			docXML = injectFirstTabCell(docXML, "993", escapeXML(entry.TimeStart))
		}
		if entry.TimeEnd != "" {
			docXML = injectFirstTabCell(docXML, "1068", escapeXML(entry.TimeEnd))
		}
	}
	return docXML
}

// injectFirstTabCell finds the first table cell with the given tcW width
// that still contains a run-level <w:tab/> and replaces that tab with
// a text run containing text. If no such cell exists the string is unchanged.
func injectFirstTabCell(docXML, width, text string) string {
	anchor := `<w:tcW w:w="` + width + `" w:type="dxa"/>`
	searchFrom := 0
	for {
		rel := strings.Index(docXML[searchFrom:], anchor)
		if rel < 0 {
			return docXML
		}
		abs := searchFrom + rel
		// Locate the end of this specific <w:tc> element.
		tcEndRel := strings.Index(docXML[abs:], `</w:tc>`)
		if tcEndRel < 0 {
			return docXML
		}
		cell := docXML[abs : abs+tcEndRel]
		tabRel := strings.Index(cell, `<w:tab/>`)
		if tabRel >= 0 {
			// Replace the tab with a plain text run.
			return docXML[:abs+tabRel] + `<w:t>` + text + `</w:t>` + docXML[abs+tabRel+len(`<w:tab/>`):]
		}
		// This cell has no tab (already filled); try the next one.
		searchFrom = abs + 1
	}
}
