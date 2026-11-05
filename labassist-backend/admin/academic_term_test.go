package admin

import (
	"strings"
	"testing"
)

func termBody(terms ...CalendarImportTerm) CalendarImportRequest {
	return CalendarImportRequest{AcademicYear: 2569, Terms: terms}
}

func TestAcademicTermRowsValid(t *testing.T) {
	rows, msg := academicTermRows(termBody(
		CalendarImportTerm{Semester: "1", OpenDate: "2026-06-22", CloseDate: "2026-10-30"},
		CalendarImportTerm{Semester: "2", OpenDate: "2026-11-09"}, // close unknown
		CalendarImportTerm{Semester: "S"},                         // nothing entered: skipped
	), 7)
	if msg != "" {
		t.Fatalf("unexpected error: %s", msg)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (empty semester skipped)", len(rows))
	}
	if rows[0].AcademicYear != 2569 || rows[0].Semester != "1" || rows[0].CreatedByID != 7 ||
		rows[0].OpenDate == nil || rows[0].CloseDate == nil {
		t.Errorf("first row = %+v", rows[0])
	}
	if rows[1].CloseDate != nil {
		t.Errorf("close date should stay empty: %+v", rows[1])
	}
}

func TestAcademicTermRowsRejects(t *testing.T) {
	cases := map[string]CalendarImportRequest{
		"ภาคการศึกษา":        termBody(CalendarImportTerm{Semester: "9", OpenDate: "2026-06-22"}),
		"ระบุซ้ำ":            termBody(CalendarImportTerm{Semester: "1", OpenDate: "2026-06-22"}, CalendarImportTerm{Semester: "1", OpenDate: "2026-06-23"}),
		"วันที่ไม่ถูกต้อง":   termBody(CalendarImportTerm{Semester: "1", OpenDate: "22/06/2569"}),
		"นอกปีการศึกษา":      termBody(CalendarImportTerm{Semester: "1", OpenDate: "2024-06-22"}),
		"ต้องไม่ก่อนวันเปิด": termBody(CalendarImportTerm{Semester: "1", OpenDate: "2026-10-30", CloseDate: "2026-06-22"}),
	}
	for want, body := range cases {
		if _, msg := academicTermRows(body, 1); !strings.Contains(msg, want) {
			t.Errorf("want error containing %q, got %q", want, msg)
		}
	}
}
