package database

import "testing"

func TestIsNormalStudentStatus(t *testing.T) {
	for status, want := range map[string]bool{
		"ปกติ": true,
		"นักศึกษาปจจุบัน สถานะปกติ": true,
		"กำลังศึกษา":                true,
		" ปกติ (กำลังศึกษา)":        true,
		"ไม่ปกติ":                   false,
		"พ้นสภาพ":                   false,
		"ลาพักการศึกษา":             false,
		"สำเร็จการศึกษา":            false,
		"": false,
	} {
		if got := IsNormalStudentStatus(status); got != want {
			t.Errorf("IsNormalStudentStatus(%q) = %v, want %v", status, got, want)
		}
	}
}

func TestSamePersonName(t *testing.T) {
	for _, tc := range []struct {
		a, b string
		want bool
	}{
		{"สมชาย ใจดี", "สมชาย ใจดี", true},
		{"นาย สมชาย ใจดี", "สมชาย  ใจดี", true},
		{"นายสมชาย ใจดี", "สมชาย ใจดี", true},
		{"นางสาวสมหญิง รักเรียน", "สมหญิง รักเรียน", true},
		{"น.ส. สมหญิง รักเรียน", "สมหญิง รักเรียน", true},
		{"Mr. Somchai Jaidee", "somchai jaidee", true},
		{"Mrsomchai Jaidee", "somchai jaidee", false},
		{"สมชาย ใจดี", "สมชาย ใจร้าย", false},
		{"", "", false},
	} {
		if got := SamePersonName(tc.a, tc.b); got != tc.want {
			t.Errorf("SamePersonName(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestNameScripts(t *testing.T) {
	if !HasThaiLetter("สมชาย ใจดี") || HasThaiLetter("Somchai Jaidee") {
		t.Error("HasThaiLetter misclassifies")
	}
	for name, want := range map[string]bool{
		"Somchai Jaidee":   true,
		"Mary-Jane O'Neil": true,
		"Mr. A. Smith":     true,
		"สมชาย":            false,
		"Somchai ใจดี":     false,
		"":                 false,
		"123":              false,
	} {
		if got := IsEnglishName(name); got != want {
			t.Errorf("IsEnglishName(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestNormalizeStudentID(t *testing.T) {
	for raw, want := range map[string]string{
		"660710260":   "660710260",
		" 6607-10260": "660710260",
		"๖๖๐๗๑๐๒๖๐":   "660710260",
		"6410123456":  "6410123456",
		"":            "",
	} {
		if got, ok := NormalizeStudentID(raw); !ok || got != want {
			t.Errorf("NormalizeStudentID(%q) = %q, %v; want %q", raw, got, ok, want)
		}
	}

	for _, bad := range []string{"ุ660710260", "66071026", "66071026012", "6607x0260"} {
		if _, ok := NormalizeStudentID(bad); ok {
			t.Errorf("NormalizeStudentID(%q) accepted", bad)
		}
	}
}

func TestAdmissionAcademicYear(t *testing.T) {
	for studentID, want := range map[string]int{
		"660710260":   2566,
		" ๖๗๐๗-๑๐๒๖๐": 2567,
	} {
		if got, ok := AdmissionAcademicYear(studentID); !ok || got != want {
			t.Errorf("AdmissionAcademicYear(%q) = %d, %v; want %d, true", studentID, got, ok, want)
		}
	}
	for _, studentID := range []string{"", "66071026", "6607x0260"} {
		if _, ok := AdmissionAcademicYear(studentID); ok {
			t.Errorf("AdmissionAcademicYear(%q) accepted", studentID)
		}
	}
}

func TestIsFirstSemesterFreshman(t *testing.T) {
	for _, tc := range []struct {
		name         string
		studentID    string
		semester     string
		academicYear int
		want         bool
		ok           bool
	}{
		{"first semester of admission year", "690710260", "1", 2569, true, true},
		{"second semester of admission year", "690710260", "2", 2569, false, true},
		{"later academic year", "690710260", "1", 2570, false, true},
		{"invalid student ID", "unknown", "1", 2569, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := IsFirstSemesterFreshman(tc.studentID, tc.semester, tc.academicYear)
			if got != tc.want || ok != tc.ok {
				t.Errorf("IsFirstSemesterFreshman() = %v, %v; want %v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}
