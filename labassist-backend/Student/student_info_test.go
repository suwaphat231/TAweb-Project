package student

import "testing"

func TestParseTextLayerFieldsPageKind(t *testing.T) {
	for text, want := range map[string]string{
		"ข้อมูลส่วนตัว (Personal Information)\nชื่อ - สกุล (ไทย): นายสมชาย ใจดี": studentInfoKindPersonal,
		"ข้อมูลนักศึกษา (Student Information)\nรหัสนักศึกษา: 660710260":          studentInfoKindStudent,
		"รหัสนักศึกษา: 660710260": "",
	} {
		if got := parseTextLayerFields(text).PageKind; got != want {
			t.Errorf("PageKind(%q) = %q, want %q", text, got, want)
		}
	}
}
