package docxgen

import "testing"

func TestFormatThousands(t *testing.T) {
	cases := []struct {
		in   float64
		want string
	}{
		{0, "0"},
		{300, "300"},
		{3300, "3,300"},
		{1000000, "1,000,000"},
		{1250.50, "1,250.50"},
		{300.5, "300.50"},
		{99.99, "99.99"},
		{3300.01, "3,300.01"},
		{1250.505, "1,250.51"}, // rounds half-up
	}
	for _, tc := range cases {
		got := formatThousands(tc.in)
		if got != tc.want {
			t.Errorf("formatThousands(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestFormatInt(t *testing.T) {
	cases := []struct {
		in   float64
		want string
	}{
		{2, "2"},
		{6, "6"},
		{2.5, "3"}, // rounds, not truncates
		{6.0, "6"},
	}
	for _, tc := range cases {
		got := formatInt(tc.in)
		if got != tc.want {
			t.Errorf("formatInt(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
