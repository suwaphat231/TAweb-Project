package database

import "testing"

func TestPayableMinutes_RoundsUpToWholeHours(t *testing.T) {
	cases := []struct {
		start, end string
		want       int
	}{
		{"13:00", "16:35", 240}, // staff requirement: paid until 17:00
		{"13:00", "17:00", 240},
		{"09:00", "12:10", 240},
		{"08:30", "10:20", 120},
		{"13:00", "13:01", 60},
		{"13:00", "13:00", 0},
		{"16:00", "13:00", 0},
		{"", "16:35", 0},
	}
	for _, c := range cases {
		if got := PayableMinutes(c.start, c.end); got != c.want {
			t.Errorf("PayableMinutes(%q, %q) = %d, want %d", c.start, c.end, got, c.want)
		}
	}
	if got := PayableHours("13:00", "16:35"); got != 4 {
		t.Errorf("PayableHours(13:00, 16:35) = %v, want 4", got)
	}
}
