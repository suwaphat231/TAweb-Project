package docxgen

import (
	"errors"
	"strings"
	"testing"
	"time"

	"labassist/models"
)

func approvalMemoFixture() ApprovalMemoInput {
	d := func(y, m, day int) time.Time { return time.Date(y, time.Month(m), day, 0, 0, 0, 0, time.UTC) }
	return ApprovalMemoInput{
		MemoDate:   d(2026, 10, 15),
		CourseLine: "517121 COMPUTER PROGRAMMING SKILL I 4 (2-4-6) (กลุ่ม 1)",
		Students: []ApprovalMemoStudent{
			{Name: "นายสมชาย ใจดี", Code: "650710001"},
			{Name: "นางสาวสมหญิง รักเรียน", Code: "650710002"},
		},
		Sessions: []ApprovalMemoSession{
			{Date: d(2025, 12, 3), Start: "10:20", End: "12:20", Hours: 2},
			{Date: d(2025, 12, 17), Start: "10:20", End: "12:20", Hours: 2},
			{Date: d(2026, 3, 18), Start: "10:20", End: "12:20", Hours: 2},
		},
		RateBaht:         50,
		StaffOfficerName: "นายทดสอบ เจ้าหน้าที่",
	}
}

func TestRenderApprovalMemo_FillsAllTokens(t *testing.T) {
	data, err := RenderApprovalMemo(approvalMemoFixture())
	if err != nil {
		t.Fatalf("RenderApprovalMemo: %v", err)
	}
	xml := assertValidDocx(t, data)

	if strings.Contains(xml, "{{") {
		i := strings.Index(xml, "{{")
		t.Fatalf("unreplaced token near %q", xml[i:min(i+40, len(xml))])
	}
	for _, want := range []string{
		"ตุลาคม", "2569", // memo month / year (BE)
		"นายสมชาย", "ใจดี", "นางสาวสมหญิง", "รักเรียน", "650710001", "650710002",
		"517121 COMPUTER PROGRAMMING SKILL I 4 (2-4-6) (กลุ่ม 1)",
		"จำนวน 12 ชั่วโมง",     // 2 students × 3 sessions × 2 h
		"ชั่วโมงละ 50.- บาท",   // rate
		"ทั้งสิ้น  600.- บาท",  // total
		"(หกร้อยบาทถ้วน)",      // total in words
		"3 ธันวาคม 2568",       // start date
		"18 มีนาคม 2569",       // end date
		"ประจำปีงบประมาณ 2569", // Dec 2568 falls in fiscal year 2569
		"นายทดสอบ เจ้าหน้าที่",
	} {
		if !strings.Contains(xml, want) {
			t.Errorf("expected %q in output", want)
		}
	}
}

func TestRenderApprovalMemo_AttendanceTable(t *testing.T) {
	data, err := RenderApprovalMemo(approvalMemoFixture())
	if err != nil {
		t.Fatalf("RenderApprovalMemo: %v", err)
	}
	xml := assertValidDocx(t, data)

	if got := strings.Count(xml, `<w:textDirection w:val="btLr"/>`); got < 3 {
		t.Errorf("expected at least 3 rotated date header cells, found %d", got)
	}
	for _, want := range []string{
		"พ. 3 ธันวาคม 2568 เวลา 10.20 – 12.20 น.",
		"พ. 18 มีนาคม 2569 เวลา 10.20 – 12.20 น.",
	} {
		if !strings.Contains(xml, want) {
			t.Errorf("expected header %q", want)
		}
	}
	if got := strings.Count(xml, `">X</w:t>`); got != 6 {
		t.Errorf("expected 6 attendance marks (2 students × 3 sessions), found %d", got)
	}
	if got := strings.Count(xml, `">300.-</w:t>`); got != 2 {
		t.Errorf("expected per-student amount 300.- twice, found %d", got)
	}
	if !strings.Contains(xml, `">600.-</w:t>`) {
		t.Error("expected grand total 600.- in table")
	}
}

func TestFiscalYearBE(t *testing.T) {
	cases := []struct {
		date time.Time
		want int
	}{
		{time.Date(2025, 12, 3, 0, 0, 0, 0, time.UTC), 2569},
		{time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC), 2569},
		{time.Date(2025, 9, 30, 0, 0, 0, 0, time.UTC), 2568},
		{time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), 2569},
	}
	for _, c := range cases {
		if got := fiscalYearBE(c.date); got != c.want {
			t.Errorf("fiscalYearBE(%s) = %d, want %d", c.date.Format("2006-01-02"), got, c.want)
		}
	}
}

func TestMoneyDash(t *testing.T) {
	if got := moneyDash(14300); got != "14,300.-" {
		t.Errorf("moneyDash(14300) = %q", got)
	}
	if got := moneyDash(50.5); got != "50.50" {
		t.Errorf("moneyDash(50.5) = %q", got)
	}
}

func TestApprovalMemoSessions_PayableOnlyInDateOrder(t *testing.T) {
	got := approvalMemoSessions([]models.OccurrenceSnapshot{
		{Date: "2025-12-17", StartTime: "10:20", EndTime: "12:20", Hours: 2, Status: "scheduled"},
		{Date: "2025-12-10", StartTime: "10:20", EndTime: "12:20", Hours: 2, Status: "cancelled_holiday"},
		{Date: "2025-12-03", StartTime: "10:20", EndTime: "12:20", Status: "completed"}, // hours derived
		{Date: "bad-date", StartTime: "10:20", EndTime: "12:20", Hours: 2, Status: "scheduled"},
	})
	if len(got) != 2 {
		t.Fatalf("expected 2 payable sessions, got %d", len(got))
	}
	if got[0].Date.Day() != 3 || got[1].Date.Day() != 17 {
		t.Errorf("sessions not in date order: %v, %v", got[0].Date, got[1].Date)
	}
	if got[0].Hours != 2 {
		t.Errorf("expected hours derived from times = 2, got %v", got[0].Hours)
	}
}

func TestApprovalMemoCourseLine(t *testing.T) {
	c := models.Course{Code: "517121", Title: "ทักษะ", EnglishTitle: "COMPUTER PROGRAMMING SKILL I", Credits: "4 (2-4-6)", Section: 1}
	if got := approvalMemoCourseLine(c); got != "517121 COMPUTER PROGRAMMING SKILL I 4 (2-4-6) (กลุ่ม 1)" {
		t.Errorf("course line = %q", got)
	}
	c.EnglishTitle, c.Credits = "", ""
	if got := approvalMemoCourseLine(c); got != "517121 ทักษะ (กลุ่ม 1)" {
		t.Errorf("fallback course line = %q", got)
	}
}

// 13:00–16:35 is 3h35m = 3.5833… h; hours must print rounded, not as a raw float.
func TestRenderApprovalMemo_RoundsFractionalHours(t *testing.T) {
	in := approvalMemoFixture()
	in.Students = in.Students[:1]
	in.Sessions = nil
	for i := 0; i < 16; i++ {
		in.Sessions = append(in.Sessions, ApprovalMemoSession{
			Date: time.Date(2026, 7, 7+i, 0, 0, 0, 0, time.UTC), Start: "13:00", End: "16:35",
			Hours: hoursFromTime("13:00", "16:35"),
		})
	}
	data, err := RenderApprovalMemo(in)
	if err != nil {
		t.Fatalf("RenderApprovalMemo: %v", err)
	}
	xml := assertValidDocx(t, data)
	if strings.Contains(xml, "57.333") {
		t.Error("hours printed with raw float precision")
	}
	for _, want := range []string{"จำนวน 57.33 ชั่วโมง", `">57.33</w:t>`, "2,866.67"} {
		if !strings.Contains(xml, want) {
			t.Errorf("expected %q in output", want)
		}
	}
}

func TestRenderApprovalMemo_IncompleteData(t *testing.T) {
	course := models.Course{Code: "517121", Title: "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1", Section: 1}
	// No snapshot and no Staff Case: there are no work sessions to request.
	doc := models.StaffDocument{
		Type:   models.DocApprovalMemo,
		Roster: []models.RosterEntry{{StudentName: "นายสมชาย ใจดี", StudentCode: "650710001"}},
	}
	if _, err := renderApprovalMemo(doc, course); !errors.Is(err, ErrIncompleteDocumentData) {
		t.Fatalf("no sessions: err = %v", err)
	}
	doc.Roster = nil
	doc.DataSnapshot = `{"occurrences":[{"date":"2025-12-03","start_time":"10:20","end_time":"12:20","status":"scheduled"}],"rate_per_hour_baht":50}`
	if _, err := renderApprovalMemo(doc, course); !errors.Is(err, ErrIncompleteDocumentData) {
		t.Fatalf("no students: err = %v", err)
	}
}
