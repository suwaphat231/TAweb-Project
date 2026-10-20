package student

import "testing"

func TestNormalizePhone(t *testing.T) {
	for in, want := range map[string]string{
		"0812345678":    "0812345678",
		"081-234-5678":  "0812345678",
		" 081 234 5678": "0812345678",
		"021234567":     "021234567",
		"":              "",
	} {
		if got, ok := normalizePhone(in); !ok || got != want {
			t.Errorf("normalizePhone(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{"12345", "08123456789", "08x2345678", "+66812345678"} {
		if _, ok := normalizePhone(in); ok {
			t.Errorf("normalizePhone(%q) accepted, want rejected", in)
		}
	}
}
