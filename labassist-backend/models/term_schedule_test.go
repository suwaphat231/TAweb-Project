package models

import "testing"

func TestTermScheduleConfirmed(t *testing.T) {
	for status, want := range map[TermScheduleStatus]bool{
		TermScheduleSet:     true,
		TermScheduleNoClass: true,
		TermScheduleUnset:   false,
		"":                  false,
	} {
		if got := (TermSchedule{Status: status}).Confirmed(); got != want {
			t.Errorf("Confirmed() with status %q = %v, want %v", status, got, want)
		}
	}
}
