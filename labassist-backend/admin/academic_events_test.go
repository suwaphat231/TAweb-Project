package admin

import (
	"strings"
	"testing"

	"labassist/models"
)

func TestEventCategory(t *testing.T) {
	cases := map[string]string{
		"ลงทะเบียนเรียน":                        models.EventRegistration,
		"วันเพิ่ม–ถอนรายวิชาเรียน/ลงทะเบียน":    models.EventRegistration,
		"วันถอนวิชาเรียนที่กองบริหารงานวิชาการ": models.EventRegistration,
		"สอบกลางภาควิชาศึกษาทั่วไป":             models.EventExam,
		"วันเริ่มสอบประจำภาค":                   models.EventExam,
		"วันสุดท้ายของการสอบ,วันสุดท้ายของภาค":  models.EventExam,
		"วันสุดท้ายของการยื่นคำร้องขอจบ":        models.EventDeadline,
		"วันสุดท้ายที่คณะส่งรายงานผลการศึกษา":   models.EventDeadline,
		"นักศึกษาประเมินการสอนอาจารย์ผู้สอน":    models.EventOther,
		"รับการปฐมนิเทศจากมหาวิทยาลัย":          models.EventOther,
	}
	for name, want := range cases {
		if got := eventCategory(name); got != want {
			t.Errorf("eventCategory(%q) = %s, want %s", name, got, want)
		}
	}
}

func TestPreviewActivitySkipsTermRows(t *testing.T) {
	for _, name := range []string{"วันเปิดเรียน", "วันปิดเรียนภาคการศึกษา", "เปิดภาคการศึกษา"} {
		if _, ok := previewActivity(CalendarPreviewEntry{Name: name, Semester: "1", StartDate: "2026-07-06", EndDate: "2026-07-06"}); ok {
			t.Errorf("%q is a term row, not an activity", name)
		}
	}
	a, ok := previewActivity(CalendarPreviewEntry{Name: "  สอบกลางภาค  ", Semester: "1", StartDate: "2026-08-22", EndDate: "2026-09-05"})
	if !ok || a.Name != "สอบกลางภาค" || a.Category != models.EventExam {
		t.Errorf("got %+v ok=%v", a, ok)
	}
}

func eventBody(events ...CalendarImportEvent) CalendarImportRequest {
	return CalendarImportRequest{AcademicYear: 2569, Events: events}
}

func TestAcademicEventRowsValid(t *testing.T) {
	rows, msg := academicEventRows(eventBody(
		CalendarImportEvent{StartDate: "2026-08-22", EndDate: "2026-09-05", Name: "สอบกลางภาค", Semester: "1", Category: "exam"},
		CalendarImportEvent{StartDate: "2026-11-30", Name: "ลงทะเบียน", Semester: "2", Category: "registration"},
	), 9)
	if msg != "" || len(rows) != 2 {
		t.Fatalf("rows=%d msg=%q", len(rows), msg)
	}
	if !rows[1].EndDate.Equal(rows[1].StartDate) || rows[0].CreatedByID != 9 || rows[0].AcademicYear != 2569 {
		t.Errorf("rows = %+v", rows)
	}
}

func TestAcademicEventRowsRejects(t *testing.T) {
	good := CalendarImportEvent{StartDate: "2026-08-22", Name: "สอบ", Semester: "1", Category: "exam"}
	with := func(f func(e *CalendarImportEvent)) CalendarImportRequest { e := good; f(&e); return eventBody(e) }
	cases := map[string]CalendarImportRequest{
		"ชื่อ":          with(func(e *CalendarImportEvent) { e.Name = "  " }),
		"ภาคการศึกษา":   with(func(e *CalendarImportEvent) { e.Semester = "9" }),
		"ประเภท":        with(func(e *CalendarImportEvent) { e.Category = "party" }),
		"วันที่เริ่ม":   with(func(e *CalendarImportEvent) { e.StartDate = "22/08/2569" }),
		"ต้องไม่ก่อน":   with(func(e *CalendarImportEvent) { e.EndDate = "2026-08-01" }),
		"นอกปีการศึกษา": with(func(e *CalendarImportEvent) { e.StartDate = "2023-08-22" }),
	}
	for want, body := range cases {
		if _, msg := academicEventRows(body, 1); !strings.Contains(msg, want) {
			t.Errorf("want error containing %q, got %q", want, msg)
		}
	}
	many := CalendarImportRequest{AcademicYear: 2569, Events: make([]CalendarImportEvent, maxCalendarEvents+1)}
	if _, msg := academicEventRows(many, 1); !strings.Contains(msg, "ไม่เกิน") {
		t.Errorf("too many events not rejected: %q", msg)
	}
}
