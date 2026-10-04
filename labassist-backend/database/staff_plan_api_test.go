package database

import (
	"errors"
	"testing"
	"time"

	"labassist/models"
)

// --- error sentinels ---

func TestErrDuplicateOccurrence_IsDistinct(t *testing.T) {
	if ErrDuplicateOccurrence == nil {
		t.Fatal("ErrDuplicateOccurrence is nil")
	}
	if errors.Is(ErrDuplicateOccurrence, ErrTerminalOccurrence) {
		t.Error("ErrDuplicateOccurrence and ErrTerminalOccurrence must be distinct")
	}
	if errors.Is(ErrTerminalOccurrence, ErrDuplicateOccurrence) {
		t.Error("ErrTerminalOccurrence and ErrDuplicateOccurrence must be distinct")
	}
}

func TestErrSentinels_NotNil(t *testing.T) {
	if ErrDuplicateOccurrence == nil {
		t.Error("ErrDuplicateOccurrence should not be nil")
	}
	if ErrTerminalOccurrence == nil {
		t.Error("ErrTerminalOccurrence should not be nil")
	}
}

// --- OccurrencePatch zero value ---

func TestOccurrencePatch_ZeroValueAllNil(t *testing.T) {
	var p OccurrencePatch
	if p.Date != nil || p.StartTime != nil || p.EndTime != nil ||
		p.Status != nil || p.Reason != nil {
		t.Error("zero-value OccurrencePatch should have all nil fields")
	}
}

func TestOccurrencePatch_PartialSet(t *testing.T) {
	reason := "test reason"
	status := models.OccurrenceCompleted
	p := OccurrencePatch{
		Status: &status,
		Reason: &reason,
	}
	if p.Status == nil || *p.Status != models.OccurrenceCompleted {
		t.Errorf("Status = %v, want %s", p.Status, models.OccurrenceCompleted)
	}
	if p.Reason == nil || *p.Reason != reason {
		t.Errorf("Reason = %v, want %q", p.Reason, reason)
	}
	if p.Date != nil || p.StartTime != nil || p.EndTime != nil {
		t.Error("unset fields should remain nil")
	}
}

// --- ComputeMonthOccurrenceSummary fills LabBoyCount and RatePerHourBaht ---

func TestComputeMonthOccurrenceSummary_FillsLabBoyAndRate(t *testing.T) {
	occs := []models.WorkOccurrence{
		{Status: models.OccurrenceCompleted, StartTime: "09:00", EndTime: "12:00"},
	}
	s := ComputeMonthOccurrenceSummary(occs, 2569, 12, DefaultHourlyRateSatang, 3)
	if s.LabBoyCount != 3 {
		t.Errorf("LabBoyCount = %d, want 3", s.LabBoyCount)
	}
	wantRate := float64(DefaultHourlyRateSatang) / 100.0
	if s.RatePerHourBaht != wantRate {
		t.Errorf("RatePerHourBaht = %g, want %g", s.RatePerHourBaht, wantRate)
	}
}

func TestComputeMonthOccurrenceSummary_ZeroLabBoys(t *testing.T) {
	s := ComputeMonthOccurrenceSummary(nil, 2569, 12, DefaultHourlyRateSatang, 0)
	if s.LabBoyCount != 0 {
		t.Errorf("LabBoyCount = %d, want 0", s.LabBoyCount)
	}
	if s.TotalPayBaht != 0 {
		t.Errorf("TotalPayBaht = %g, want 0 for zero lab boys", s.TotalPayBaht)
	}
}

// --- validateAndNormaliseDates edge cases ---

func TestValidateAndNormaliseDates_SingleDate(t *testing.T) {
	dates := []time.Time{
		time.Date(2569, 3, 15, 0, 0, 0, 0, time.UTC),
	}
	got, err := validateAndNormaliseDates(2569, 3, dates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Hour() != 0 || got[0].Minute() != 0 {
		t.Error("date should be normalised to midnight UTC")
	}
}

// --- weekDayThai and groupWeekSlots ---

func TestWeekDayThai_HasAllDays(t *testing.T) {
	for _, code := range []string{"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"} {
		if weekDayThai[code] == "" {
			t.Errorf("weekDayThai missing entry for %s", code)
		}
	}
}

func TestGroupWeekSlots_FallsBackToWeekDay(t *testing.T) {
	sg := models.ScheduleGroup{WeekDay: "MON", StartTime: "09:00", EndTime: "12:00"}
	slots := groupWeekSlots(sg)
	if len(slots) != 1 {
		t.Fatalf("expected 1 slot, got %d", len(slots))
	}
	if slots[0].Day != "MON" || slots[0].StartTime != "09:00" || slots[0].EndTime != "12:00" {
		t.Errorf("unexpected slot: %+v", slots[0])
	}
}

func TestGroupWeekSlots_EmptyWhenNoDay(t *testing.T) {
	sg := models.ScheduleGroup{}
	slots := groupWeekSlots(sg)
	if len(slots) != 0 {
		t.Errorf("expected 0 slots for empty group, got %d", len(slots))
	}
}

func TestValidateAndNormaliseDates_AllDeduplicated(t *testing.T) {
	// Three entries for the same day.
	dates := []time.Time{
		time.Date(2569, 6, 10, 8, 0, 0, 0, time.UTC),
		time.Date(2569, 6, 10, 12, 0, 0, 0, time.UTC),
		time.Date(2569, 6, 10, 20, 0, 0, 0, time.UTC),
	}
	got, err := validateAndNormaliseDates(2569, 6, dates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("expected 1 unique date, got %d", len(got))
	}
}
