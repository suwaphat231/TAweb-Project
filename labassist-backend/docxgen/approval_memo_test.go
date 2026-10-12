package docxgen

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"labassist/models"
)

// memoDoc reproduces the department's sample memo (บันทึกขออนุมัติ (ป.ตรี)
// -2568-2_517122): 11 students, 13 two-hour sessions from 3 Dec 2025 to
// 18 Mar 2026 at 50 baht/hour → 286 hours, 14,300 baht, budget year 2569.
func memoDoc(t *testing.T) models.StaffDocument {
	t.Helper()
	dates := []string{"2025-12-03", "2025-12-17", "2025-12-24", "2026-01-07", "2026-01-14", "2026-01-21",
		"2026-02-04", "2026-02-11", "2026-02-18", "2026-02-25", "2026-03-04", "2026-03-11", "2026-03-18"}
	snap := models.DocumentDataSnapshot{SchemaVersion: 1, RatePerHourBaht: 50, LabBoyCount: 11}
	for _, d := range dates {
		snap.Occurrences = append(snap.Occurrences, models.OccurrenceSnapshot{Date: d, StartTime: "10:20", EndTime: "12:20", Hours: 2, Status: "scheduled"})
	}
	// A holiday is in the plan but is not paid work.
	snap.Occurrences = append(snap.Occurrences, models.OccurrenceSnapshot{Date: "2025-12-10", StartTime: "10:20", EndTime: "12:20", Hours: 2, Status: "cancelled_holiday"})
	b, _ := json.Marshal(snap)
	return models.StaffDocument{
		Type: models.DocApprovalMemo, Roster: sampleRoster(11), DataSnapshot: string(b),
		RefNumber: "อว 8613.7/171", StaffOfficerName: "ทดสอบ เจ้าหน้าที่", DeptHeadName: "ทดสอบ หัวหน้าภาค",
		CreatedAt: time.Date(2025, 12, 1, 3, 0, 0, 0, time.UTC),
	}
}

func TestRenderApprovalMemo_MatchesSampleMemo(t *testing.T) {
	data, err := renderApprovalMemo(memoDoc(t), sampleCourse())
	if err != nil {
		t.Fatalf("renderApprovalMemo: %v", err)
	}
	xml := assertValidDocx(t, data)
	// Compare visible text: Word splits phrases across runs, so the raw XML
	// can hold "ขออนุมัติ" and "จ้าง" in separate <w:t> elements.
	text := regexp.MustCompile(`<[^>]+>`).ReplaceAllString(xml, "")
	for _, want := range []string{
		"ขออนุมัติจ้างนักศึกษาปฏิบัติงาน",
		"จำนวน 286 ชั่วโมง",
		"ชั่วโมงละ 50.- บาท",
		"14,300.- บาท (หนึ่งหมื่นสี่พันสามร้อยบาทถ้วน)",
		"ตั้งแต่วันที่ 3 ธันวาคม 2568 ถึงวันที่ 18 มีนาคม 2569",
		"ประจำปีงบประมาณ 2569",
		"อว 8613.7/171",
		"ธันวาคม",
		"พ. 3 ธันวาคม 2568 เวลา 10.20 – 12.20 น.",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("memo missing %q", want)
		}
	}
	if got := strings.Count(xml, "TESTSTUDENT_MARKER"); got != 11 {
		t.Errorf("expected 11 student lines, found %d", got)
	}
	if got := strings.Count(xml, "เวลา 10.20 – 12.20 น."); got != 13 {
		t.Errorf("expected 13 work-date lines (holiday excluded), found %d", got)
	}
	if strings.Contains(xml, "10 ธันวาคม 2568") {
		t.Error("cancelled holiday must not be listed")
	}
}

func TestRenderApprovalMemo_IncompleteData(t *testing.T) {
	doc := memoDoc(t)
	doc.Roster = nil
	if _, err := renderApprovalMemo(doc, sampleCourse()); !errors.Is(err, ErrIncompleteDocumentData) {
		t.Fatalf("no students: err = %v", err)
	}
	doc = memoDoc(t)
	doc.DataSnapshot = ""
	if _, err := renderApprovalMemo(doc, sampleCourse()); !errors.Is(err, ErrIncompleteDocumentData) {
		t.Fatalf("no snapshot: err = %v", err)
	}
}

func TestThaiFiscalYear(t *testing.T) {
	for in, want := range map[string]int{"2025-09-30": 2568, "2025-10-01": 2569, "2026-03-18": 2569} {
		d, _ := time.Parse("2006-01-02", in)
		if got := thaiFiscalYear(d); got != want {
			t.Errorf("thaiFiscalYear(%s) = %d, want %d", in, got, want)
		}
	}
}
