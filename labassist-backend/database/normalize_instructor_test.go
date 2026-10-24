package database

import "testing"

func TestNormalizeInstructorName(t *testing.T) {
	cases := map[string]string{
		"อ.ดร.ณัฐพงศ์ จิวมั่งมี":                 "ณัฐพงศ์",
		"อาจารย์ ดร.ณัฐพงศ์  จิวมั่งมี":          "ณัฐพงศ์",
		"ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์": "ปัญญนัท",
		"ผศ.ดร.สิรักข์ แก้วจำนงค์":               "สิรักข์",
		"อาจารย์อภิเษก  หงษ์วิทยากร":             "อภิเษก",
		"นายบูชาภัทร  ป้านศรี":                   "บูชาภัทร",
	}
	for in, want := range cases {
		if got := NormalizeInstructorName(in); got != want {
			t.Errorf("NormalizeInstructorName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeAccountName(t *testing.T) {
	cases := map[string]string{
		"Warisarapohn Kanchita":      "warisarapohn kanchita",
		"  warisarapohn   KANCHITA ": "warisarapohn kanchita",
		"ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์": "ภูริวัจน์ วรวิชัยพัฒน์",
		"": "",
	}
	for in, want := range cases {
		if got := normalizeAccountName(in); got != want {
			t.Errorf("normalizeAccountName(%q) = %q, want %q", in, got, want)
		}
	}
}
