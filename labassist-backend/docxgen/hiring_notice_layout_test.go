package docxgen

import (
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var (
	gridColRe = regexp.MustCompile(`<w:gridCol w:w="(\d+)"/>`)
	tcWRe     = regexp.MustCompile(`<w:tcW w:w="(\d+)" w:type="dxa"/>`)
	rowRe     = regexp.MustCompile(`(?s)<w:tr[ >].*?</w:tr>`)
	lineRe    = regexp.MustCompile(`w:line="(\d+)"`)
)

// tableAfter returns the first table that follows anchor in docXML.
func tableAfter(t *testing.T, docXML, anchor string) string {
	t.Helper()
	i := strings.Index(docXML, anchor)
	if i < 0 {
		t.Fatalf("anchor %q not found", anchor)
	}
	start := i + strings.Index(docXML[i:], "<w:tbl>")
	end := start + strings.Index(docXML[start:], "</w:tbl>")
	return docXML[start:end]
}

func widths(re *regexp.Regexp, s string) []int {
	var out []int
	for _, m := range re.FindAllStringSubmatch(s, -1) {
		n, _ := strconv.Atoi(m[1])
		out = append(out, n)
	}
	return out
}

func sum(ns []int) int {
	total := 0
	for _, n := range ns {
		total += n
	}
	return total
}

// Each cell must be wide enough for its text in TH Sarabun New 16pt (text
// width + 216 twips of cell margins, measured from the font), otherwise Word
// wraps it and the tight line spacing makes the Thai lines overlap.
func TestRenderLabBoyHiringNotice_PlanTablesFitTheirText(t *testing.T) {
	data, err := RenderLabBoyHiringNotice(LabBoyHiringNoticeInput{
		CourseCode: "517122", Semester: 1, AcademicYear: "2569", LabBoyCount: 6,
		MonthlyPlan: []MonthPlanEntry{
			{MonthTH: "กรกฎาคม", BeYear: 2569, Count: 3, DateNums: []int{7, 14, 21}},
			{MonthTH: "พฤศจิกายน", BeYear: 2569, Count: 5, DateNums: []int{1, 8, 15, 22, 29}},
		},
		TotalSessions: 16, HoursPerSession: 3, RateBaht: 50,
	})
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)

	for _, tc := range []struct {
		anchor   string
		total    int   // the template's table width, kept so the page layout is unchanged
		minWidth []int // per grid column
		filled   []string
	}{
		{"ในแต่ละเดือน", 9452,
			// เดือน | พฤศจิกายน | พ.ศ. | 2569 | จำนวน | n | ครั้ง คือ วันที่ของเดือน | dates
			[]int{664, 1202, 588, 679, 811, 448, 2093, 1627},
			[]string{"กรกฎาคม", "พฤศจิกายน", "7, 14, 21", "1, 8, 15, 22, 29"}},
		{"สรุปจำนวนปฏิบัติงาน", 9918,
			// ทั้งหมด | n | ครั้ง x | n | คน x | h | ชั่วโมง x | rate | บาท | รวมเป็นเงิน | amount | บาท
			[]int{837, 560, 710, 448, 647, 500, 914, 560, 592, 1184, 1200, 592},
			[]string{"16", "14,400"}},
	} {
		tbl := tableAfter(t, xml, tc.anchor)
		grid := widths(gridColRe, tbl)
		if len(grid) != len(tc.minWidth) {
			t.Fatalf("%s: %d grid columns, want %d", tc.anchor, len(grid), len(tc.minWidth))
		}
		if sum(grid) != tc.total {
			t.Errorf("%s: table width %d, want %d", tc.anchor, sum(grid), tc.total)
		}
		for i, w := range grid {
			if w < tc.minWidth[i] {
				t.Errorf("%s: column %d is %d twips, text needs %d", tc.anchor, i, w, tc.minWidth[i])
			}
		}
		for r, row := range rowRe.FindAllString(tbl, -1) {
			if got := widths(tcWRe, row); len(got) == len(grid) && sum(got) != sum(grid) {
				t.Errorf("%s row %d: cell widths %v do not match grid %v", tc.anchor, r, got, grid)
			}
		}
		for _, line := range widths(lineRe, tbl) {
			if line < 240 {
				t.Errorf("%s: line spacing %d is tighter than single (240); wrapped Thai text overlaps", tc.anchor, line)
				break
			}
		}
		for _, want := range tc.filled {
			if !strings.Contains(tbl, want) {
				t.Errorf("%s: %q not filled in", tc.anchor, want)
			}
		}
	}
}
