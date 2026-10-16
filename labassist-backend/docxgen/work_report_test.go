package docxgen

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"labassist/models"
)

func wrDate(s string) time.Time {
	d, _ := time.Parse("2006-01-02", s)
	return d
}

func TestRenderWorkReport_OnePagePerMonth(t *testing.T) {
	data, err := RenderWorkReport(WorkReportInput{
		CourseLine: "517122 COMPUTER PROGRAMMING SKILL II 4(2-4-6) (กลุ่ม 2)",
		Students:   []string{"นายณฐกฤต มากมิตร", "นางสาวกวิสรา ประสิทธิ์นุ้ย"},
		Sessions: []ApprovalMemoSession{
			{Date: wrDate("2025-12-03"), Start: "10:20", End: "12:20"},
			{Date: wrDate("2025-12-17"), Start: "10:20", End: "12:20"},
			{Date: wrDate("2026-01-07"), Start: "13:00", End: "16:35"},
		},
		DeptHeadName: "ทดสอบ หัวหน้าภาค",
		DeanName:     "ทดสอบ คณบดี",
	})
	if err != nil {
		t.Fatalf("RenderWorkReport: %v", err)
	}
	xml := assertValidDocx(t, data)

	if got := strings.Count(xml, "<w:tbl>"); got != 2 {
		t.Errorf("expected one table per month (2), got %d", got)
	}
	if got := strings.Count(xml, `w:type="page"`); got != 1 {
		t.Errorf("expected 1 page break between months, got %d", got)
	}
	for _, want := range []string{
		"3 ธ.ค. 2568", "17 ธ.ค. 2568", "7 ม.ค. 2569",
		"10.20 – 12.20 น.", "13.00 – 16.35 น.",
		"ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับ",
		"(ทดสอบ หัวหน้าภาค)", "(ทดสอบ คณบดี)",
	} {
		if !strings.Contains(xml, want) {
			t.Errorf("output missing %q", want)
		}
	}
	// Every month page lists every student.
	if got := strings.Count(xml, "(นายณฐกฤต  มากมิตร)"); got != 2 {
		t.Errorf("expected student on both month pages, got %d", got)
	}
	if strings.Contains(xml, "{{") {
		t.Error("unreplaced token left in output")
	}
}

func TestRenderWorkReport_ColumnsAreIndependent(t *testing.T) {
	// Each column lists its own lines in a single data row, so a long name
	// that wraps cannot push the dates or description out of line.
	data, err := RenderWorkReport(WorkReportInput{
		CourseLine: "517122",
		Students:   []string{"Suwaphat Watthakicharoen", "นายค ง", "นายจ ฉ"},
		Sessions: []ApprovalMemoSession{
			{Date: wrDate("2025-12-03"), Start: "10:20", End: "12:20"},
			{Date: wrDate("2025-12-10"), Start: "10:20", End: "12:20"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)
	// header + spacer + ONE data row + 6 signature rows
	if got := strings.Count(xml, "<w:tr "); got != 2+1+6 {
		t.Errorf("expected 9 rows, got %d", got)
	}
	rows := trPattern.FindAllString(xml, -1)
	dataRow := rows[2]
	if !strings.Contains(dataRow, "3 ธ.ค. 2568") || !strings.Contains(dataRow, "10 ธ.ค. 2568") {
		t.Error("both dates must be in the single data row")
	}
	for _, name := range []string{"(Suwaphat  Watthakicharoen)", "(นายค  ง)", "(นายจ  ฉ)"} {
		if !strings.Contains(dataRow, name) {
			t.Errorf("data row missing %s", name)
		}
	}
	// 3 names + 2 blank signing lines between them = 5 paragraphs in the name cell.
	cells := regexp.MustCompile(`(?s)<w:tc>.*?</w:tc>`).FindAllString(dataRow, -1)
	if got := strings.Count(cells[3], "<w:p "); got != 5 {
		t.Errorf("name cell has %d paragraphs, want 5", got)
	}
	if got := strings.Count(cells[0], "<w:p "); got != 2 {
		t.Errorf("date cell has %d paragraphs, want 2", got)
	}
}

func TestRenderWorkReport_DefaultSignatories(t *testing.T) {
	data, err := RenderWorkReport(WorkReportInput{
		CourseLine: "517122",
		Students:   []string{"นายก ข"},
		Sessions:   []ApprovalMemoSession{{Date: wrDate("2025-12-03"), Start: "10:20", End: "12:20"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)
	for _, want := range []string{defaultWorkReportDeptHead, defaultWorkReportDean} {
		if !strings.Contains(xml, want) {
			t.Errorf("blank signatory should fall back to %q", want)
		}
	}
}

func TestRenderWorkReportDoc_UsesPlannedSessionsFromSnapshot(t *testing.T) {
	doc := models.StaffDocument{
		Type:   models.DocWorkReport,
		Roster: []models.RosterEntry{{StudentName: "นายทดสอบ ระบบ"}},
		DataSnapshot: `{"schema_version":1,"occurrences":[
			{"date":"2026-07-07","start_time":"13:00","end_time":"16:35","status":"scheduled"},
			{"date":"2026-07-14","start_time":"13:00","end_time":"16:35","status":"cancelled_holiday"},
			{"date":"2026-08-04","start_time":"13:00","end_time":"16:35","status":"completed"}]}`,
	}
	data, err := renderWorkReport(doc, sampleCourse())
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)
	if !strings.Contains(xml, "7 ก.ค. 2569") || !strings.Contains(xml, "4 ส.ค. 2569") {
		t.Error("scheduled and completed sessions must both be listed")
	}
	if strings.Contains(xml, "14 ก.ค. 2569") {
		t.Error("holiday-cancelled session must not be listed")
	}
	if got := strings.Count(xml, "<w:tbl>"); got != 2 {
		t.Errorf("expected 2 month pages, got %d", got)
	}
}

func TestWorkReportDescLines_Wraps(t *testing.T) {
	lines := workReportDescLines("517122-165 COMPUTER PROGRAMMING SKILL II 4(2-4-6) (กลุ่ม 2)")
	if lines[0] != "ปฏิบัติงานในห้องปฏิบัติการคอมพิวเตอร์สำหรับ" {
		t.Errorf("first line = %q", lines[0])
	}
	if !strings.HasPrefix(lines[1], "รายวิชา 517122-165") {
		t.Errorf("second line = %q", lines[1])
	}
	for _, l := range lines {
		if n := len([]rune(l)); n > workReportDescWidth && strings.Contains(l, " ") {
			t.Errorf("line too long (%d runes): %q", n, l)
		}
	}
	if got := strings.Join(lines[1:], " "); got != "รายวิชา 517122-165 COMPUTER PROGRAMMING SKILL II 4(2-4-6) (กลุ่ม 2)" {
		t.Errorf("wrapped text lost words: %q", got)
	}
}
