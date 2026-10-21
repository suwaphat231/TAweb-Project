package admin

import (
	"strings"
	"testing"

	"labassist/models"
)

func TestCalendarRowsExpandsRanges(t *testing.T) {
	rows, msg := calendarRows(CalendarImportRequest{
		AcademicYear: 2569,
		Entries: []CalendarImportEntry{
			{StartDate: "2026-10-12", EndDate: "2026-10-16", Name: " หยุดกีฬามหาวิทยาลัย ", Semester: "1",
				DateType: models.DateTypeUniversityHoliday, AffectsWork: true},
			{StartDate: "2027-01-01", Name: "วันขึ้นปีใหม่", Semester: "2",
				DateType: models.DateTypePublicHoliday, AffectsWork: false},
		},
	}, 7)
	if msg != "" {
		t.Fatal(msg)
	}
	if len(rows) != 6 {
		t.Fatalf("got %d rows, want 5 days + 1 holiday", len(rows))
	}
	first, last := rows[0], rows[4]
	if first.Date.Format("2006-01-02") != "2026-10-12" || last.Date.Format("2006-01-02") != "2026-10-16" {
		t.Errorf("range = %s – %s", first.Date, last.Date)
	}
	if first.Name != "หยุดกีฬามหาวิทยาลัย" || first.Scope != models.DateScopeSemester || first.Semester != "1" ||
		first.AcademicYear != 2569 || first.CreatedByID != 7 || !*first.AffectsWork {
		t.Errorf("unexpected row %+v", first)
	}
	if *rows[5].AffectsWork {
		t.Error("affects_work=false must be kept")
	}
	// Each row owns its AffectsWork pointer.
	*rows[0].AffectsWork = false
	if !*rows[1].AffectsWork {
		t.Error("rows share one AffectsWork pointer")
	}
}

func TestCalendarRowsRejectsInvalid(t *testing.T) {
	valid := CalendarImportEntry{StartDate: "2026-10-12", Name: "วันปิยมหาราช", Semester: "1", DateType: models.DateTypePublicHoliday}
	for name, tc := range map[string]struct {
		year   int
		mutate func(e *CalendarImportEntry)
		want   string
	}{
		"CE year":        {2026, func(e *CalendarImportEntry) {}, "พ.ศ."},
		"blank name":     {2569, func(e *CalendarImportEntry) { e.Name = "  " }, "ชื่อ"},
		"bad semester":   {2569, func(e *CalendarImportEntry) { e.Semester = "3" }, "ภาคการศึกษา"},
		"activity type":  {2569, func(e *CalendarImportEntry) { e.DateType = models.DateTypeMakeup }, "ประเภท"},
		"no-class day":   {2569, func(e *CalendarImportEntry) { e.DateType = models.DateTypeNoClass }, "วันหยุด"},
		"bad date":       {2569, func(e *CalendarImportEntry) { e.StartDate = "12/10/2569" }, "วันที่เริ่ม"},
		"reversed range": {2569, func(e *CalendarImportEntry) { e.EndDate = "2026-10-01" }, "ไม่ก่อน"},
		"other year":     {2569, func(e *CalendarImportEntry) { e.StartDate = "2029-10-12" }, "นอกปีการศึกษา"},
		"range too long": {2569, func(e *CalendarImportEntry) { e.EndDate = "2026-12-31" }, "ยาวเกิน"},
	} {
		e := valid
		tc.mutate(&e)
		_, msg := calendarRows(CalendarImportRequest{AcademicYear: tc.year, Entries: []CalendarImportEntry{e}}, 1)
		if !strings.Contains(msg, tc.want) {
			t.Errorf("%s: message %q, want it to mention %q", name, msg, tc.want)
		}
	}
	if _, msg := calendarRows(CalendarImportRequest{AcademicYear: 2569}, 1); msg == "" {
		t.Error("empty entry list must be rejected")
	}
}
