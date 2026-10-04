package database

import (
	"encoding/json"
	"testing"
	"time"

	"labassist/models"
)

// --- DefaultHourlyRateSatang ---

func TestDefaultHourlyRateSatang(t *testing.T) {
	const wantBaht = 50
	if DefaultHourlyRateSatang != wantBaht*100 {
		t.Errorf("DefaultHourlyRateSatang = %d, want %d (50 THB/hr × 100 satang)",
			DefaultHourlyRateSatang, wantBaht*100)
	}
}

// --- validateAndNormaliseDates ---

func TestValidateAndNormaliseDates_OK(t *testing.T) {
	dates := []time.Time{
		time.Date(2569, 12, 15, 0, 0, 0, 0, time.UTC),
		time.Date(2569, 12, 8, 0, 0, 0, 0, time.UTC),
		time.Date(2569, 12, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2569, 12, 22, 0, 0, 0, 0, time.UTC),
	}
	got, err := validateAndNormaliseDates(2569, 12, dates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 4 {
		t.Fatalf("len = %d, want 4", len(got))
	}
	// Must be sorted ascending.
	for i := 1; i < len(got); i++ {
		if !got[i-1].Before(got[i]) {
			t.Errorf("result not sorted at index %d: %s >= %s",
				i, got[i-1].Format("2006-01-02"), got[i].Format("2006-01-02"))
		}
	}
	if got[0].Day() != 1 || got[3].Day() != 22 {
		t.Errorf("sort order wrong: got %v", got)
	}
}

func TestValidateAndNormaliseDates_Dedup(t *testing.T) {
	dates := []time.Time{
		time.Date(2569, 12, 8, 9, 0, 0, 0, time.UTC),  // same day, different hour
		time.Date(2569, 12, 8, 13, 0, 0, 0, time.UTC), // duplicate
		time.Date(2569, 12, 15, 0, 0, 0, 0, time.UTC),
	}
	got, err := validateAndNormaliseDates(2569, 12, dates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("expected 2 unique dates, got %d: %v", len(got), got)
	}
}

func TestValidateAndNormaliseDates_OutOfMonth(t *testing.T) {
	dates := []time.Time{
		time.Date(2569, 12, 8, 0, 0, 0, 0, time.UTC),
		time.Date(2569, 11, 30, 0, 0, 0, 0, time.UTC), // previous month
	}
	_, err := validateAndNormaliseDates(2569, 12, dates)
	if err == nil {
		t.Error("expected error for out-of-month date, got nil")
	}
}

func TestValidateAndNormaliseDates_Empty(t *testing.T) {
	got, err := validateAndNormaliseDates(2569, 12, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

// --- resolveSlotForDate ---

func TestResolveSlotForDate_Primary(t *testing.T) {
	sg := models.ScheduleGroup{
		WeekDay:   "MON",
		StartTime: "09:00",
		EndTime:   "12:00",
	}
	// Any date — no WeekDaysJSON so primary times are always returned.
	start, end := resolveSlotForDate(sg, time.Date(2569, 12, 8, 0, 0, 0, 0, time.UTC))
	if start != "09:00" || end != "12:00" {
		t.Errorf("got %s-%s, want 09:00-12:00", start, end)
	}
}

func TestResolveSlotForDate_WeekDaysMatchDay(t *testing.T) {
	slots := []models.GroupWeekDaySlot{
		{Day: "MON", StartTime: "08:00", EndTime: "10:00"},
		{Day: "WED", StartTime: "13:00", EndTime: "16:00"},
	}
	b, _ := json.Marshal(slots)
	sg := models.ScheduleGroup{
		WeekDay:      "MON",
		StartTime:    "08:00",
		EndTime:      "10:00",
		WeekDaysJSON: string(b),
	}
	// Dec 6 2569 CE = Wednesday (Dec 10 = Sun, so Dec 10-4 = Dec 6 = Wed)
	wed := time.Date(2569, 12, 6, 0, 0, 0, 0, time.UTC)
	if wed.Weekday() != time.Wednesday {
		t.Fatalf("test date is not Wednesday: %s — update to a known Wednesday in Dec 2569", wed.Weekday())
	}
	start, end := resolveSlotForDate(sg, wed)
	if start != "13:00" || end != "16:00" {
		t.Errorf("Wednesday slot: got %s-%s, want 13:00-16:00", start, end)
	}
}

func TestResolveSlotForDate_WeekDaysFallbackToFirst(t *testing.T) {
	slots := []models.GroupWeekDaySlot{
		{Day: "MON", StartTime: "08:00", EndTime: "10:00"},
	}
	b, _ := json.Marshal(slots)
	sg := models.ScheduleGroup{
		WeekDay:      "MON",
		StartTime:    "08:00",
		EndTime:      "10:00",
		WeekDaysJSON: string(b),
	}
	// Dec 8 2569 = Monday — fine; but use a Friday to test fallback to first slot.
	fri := time.Date(2569, 12, 12, 0, 0, 0, 0, time.UTC) // Friday
	start, end := resolveSlotForDate(sg, fri)
	// No FRI slot → fallback to first (MON) slot.
	if start != "08:00" || end != "10:00" {
		t.Errorf("fallback slot: got %s-%s, want 08:00-10:00", start, end)
	}
}

// --- buildOccurrenceSlice ---

func TestBuildOccurrenceSlice_Basic(t *testing.T) {
	// Jan 2569: find all Mondays between Jan 1 and Jan 31.
	start := time.Date(2569, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2569, 1, 31, 0, 0, 0, 0, time.UTC)
	occs, err := buildOccurrenceSlice(1, nil, "MON", "09:00", "12:00", start, end, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, o := range occs {
		if o.ScheduledDate.Weekday() != time.Monday {
			t.Errorf("expected Monday, got %s on %s", o.ScheduledDate.Weekday(), o.ScheduledDate.Format("2006-01-02"))
		}
		if o.StartTime != "09:00" || o.EndTime != "12:00" {
			t.Errorf("times: got %s-%s, want 09:00-12:00", o.StartTime, o.EndTime)
		}
		if o.Status != models.OccurrenceScheduled {
			t.Errorf("status: got %s, want scheduled", o.Status)
		}
	}
}

func TestBuildOccurrenceSlice_CancelledHoliday(t *testing.T) {
	start := time.Date(2569, 12, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2569, 12, 31, 0, 0, 0, 0, time.UTC)
	// Dec 4, 2569 CE is Monday (Dec 10 = Sun → Dec 4 = Mon).
	monDate := time.Date(2569, 12, 4, 0, 0, 0, 0, time.UTC)
	if monDate.Weekday() != time.Monday {
		t.Fatalf("test date is not Monday: %s — update to a known Monday in Dec 2569", monDate.Weekday())
	}
	cancelledDates := map[string]uint{"2569-12-04": 42}
	occs, err := buildOccurrenceSlice(1, nil, "MON", "09:00", "12:00", start, end, cancelledDates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var found bool
	for _, o := range occs {
		if o.ScheduledDate.Format("2006-01-02") == "2569-12-04" {
			found = true
			if o.Status != models.OccurrenceCancelledHoliday {
				t.Errorf("holiday occurrence status = %s, want cancelled_holiday", o.Status)
			}
			if o.CalendarDateID == nil || *o.CalendarDateID != 42 {
				t.Errorf("CalendarDateID = %v, want 42", o.CalendarDateID)
			}
		}
	}
	if !found {
		t.Error("holiday occurrence (2569-12-04 Monday) not found in slice")
	}
}

func TestBuildOccurrenceSlice_InvalidWeekDay(t *testing.T) {
	start := time.Date(2569, 12, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2569, 12, 31, 0, 0, 0, 0, time.UTC)
	_, err := buildOccurrenceSlice(1, nil, "XYZ", "09:00", "12:00", start, end, nil)
	if err == nil {
		t.Error("expected error for invalid weekday, got nil")
	}
}

// --- ComputeMonthOccurrenceSummary ---

func TestComputeMonthOccurrenceSummary_HoursAndPay(t *testing.T) {
	// 2 completed occurrences, each 09:00-12:00 (3 hrs = 180 min)
	occs := []models.WorkOccurrence{
		{Status: models.OccurrenceCompleted, StartTime: "09:00", EndTime: "12:00"},
		{Status: models.OccurrenceCompleted, StartTime: "09:00", EndTime: "12:00"},
	}
	// Rate = DefaultHourlyRateSatang = 5000 satang/hr; 2 lab boys
	s := ComputeMonthOccurrenceSummary(occs, 2569, 12, DefaultHourlyRateSatang, 2)

	if s.Valid != 2 {
		t.Errorf("Valid = %d, want 2", s.Valid)
	}
	wantMinutes := int64(360) // 2 × 180 min
	if s.ValidMinutes != wantMinutes {
		t.Errorf("ValidMinutes = %d, want %d", s.ValidMinutes, wantMinutes)
	}
	wantHours := 6.0
	if s.ValidHours != wantHours {
		t.Errorf("ValidHours = %g, want %g", s.ValidHours, wantHours)
	}
	// 6 hrs × 50 THB/hr = 300 THB per person; 2 persons = 600 THB total
	if s.PayPerPersonBaht != 300.0 {
		t.Errorf("PayPerPersonBaht = %g, want 300", s.PayPerPersonBaht)
	}
	if s.TotalPayBaht != 600.0 {
		t.Errorf("TotalPayBaht = %g, want 600", s.TotalPayBaht)
	}
}

func TestComputeMonthOccurrenceSummary_AbsentNotCounted(t *testing.T) {
	occs := []models.WorkOccurrence{
		{Status: models.OccurrenceCompleted, StartTime: "09:00", EndTime: "12:00"},
		{Status: models.OccurrenceAbsent, StartTime: "09:00", EndTime: "12:00"},
	}
	s := ComputeMonthOccurrenceSummary(occs, 2569, 12, DefaultHourlyRateSatang, 1)
	if s.Valid != 1 {
		t.Errorf("Valid = %d, want 1 (absent should not count)", s.Valid)
	}
	if s.ValidMinutes != 180 {
		t.Errorf("ValidMinutes = %d, want 180 (absent excluded)", s.ValidMinutes)
	}
}

func TestComputeMonthOccurrenceSummary_CancelledHolidayNotCounted(t *testing.T) {
	occs := []models.WorkOccurrence{
		{Status: models.OccurrenceCompleted, StartTime: "09:00", EndTime: "12:00"},
		{Status: models.OccurrenceCancelledHoliday, StartTime: "09:00", EndTime: "12:00"},
	}
	s := ComputeMonthOccurrenceSummary(occs, 2569, 12, DefaultHourlyRateSatang, 1)
	if s.CancelledHoliday != 1 {
		t.Errorf("CancelledHoliday = %d, want 1", s.CancelledHoliday)
	}
	if s.Valid != 1 {
		t.Errorf("Valid = %d, want 1", s.Valid)
	}
}

func TestComputeMonthOccurrenceSummary_NoOccurrences(t *testing.T) {
	s := ComputeMonthOccurrenceSummary(nil, 2569, 12, DefaultHourlyRateSatang, 2)
	if s.Total != 0 || s.ValidMinutes != 0 || s.PayPerPersonBaht != 0 {
		t.Errorf("unexpected non-zero summary for empty list: %+v", s)
	}
}
