package database

import "testing"

func TestSuggestedLabBoySlots(t *testing.T) {
	cases := []struct {
		code     string
		enrolled int
		want     int
	}{
		{"517121-165, -2560", 98, 10},  // year 1: 98/10 → 10
		{"517121-165, -2560", 103, 11}, // year 1: 103/10 → 11
		{"517121", 100, 10},            // exact division is not rounded up
		{"517211-165, -2560", 93, 5},   // year 2: 93/20 → 5
		{"520321-165", 40, 2},          // year 3
		{"517121", 0, 0},               // no headcount → manual entry
		{"abc", 50, 0},                 // unreadable code → manual entry
	}
	for _, c := range cases {
		if got := SuggestedLabBoySlots(c.code, c.enrolled); got != c.want {
			t.Errorf("SuggestedLabBoySlots(%q, %d) = %d, want %d", c.code, c.enrolled, got, c.want)
		}
	}
}
