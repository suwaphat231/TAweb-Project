package docxgen

import "testing"

func TestBahtText(t *testing.T) {
	cases := []struct {
		amount float64
		want   string
	}{
		{0, "ศูนย์บาทถ้วน"},
		{1, "หนึ่งบาทถ้วน"},
		{21, "ยี่สิบเอ็ดบาทถ้วน"},
		{11, "สิบเอ็ดบาทถ้วน"},
		{10, "สิบบาทถ้วน"},
		{100, "หนึ่งร้อยบาทถ้วน"},
		{300, "สามร้อยบาทถ้วน"},
		{3300, "สามพันสามร้อยบาทถ้วน"},
		{4400, "สี่พันสี่ร้อยบาทถ้วน"},
		{1000000, "หนึ่งล้านบาทถ้วน"},
		{1000001, "หนึ่งล้านเอ็ดบาทถ้วน"},
		{1250.50, "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"},
	}
	for _, tc := range cases {
		if got := BahtText(tc.amount); got != tc.want {
			t.Errorf("BahtText(%v) = %q, want %q", tc.amount, got, tc.want)
		}
	}
}
