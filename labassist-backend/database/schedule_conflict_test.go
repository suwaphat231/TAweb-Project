package database

import (
	"testing"

	"labassist/models"
)

func TestNormTime(t *testing.T) {
	cases := []struct{ in, want string }{
		{"9:00", "09:00"},
		{"09:00", "09:00"},
		{"13:30", "13:30"},
		{"8:05", "08:05"},
	}
	for _, c := range cases {
		if got := normTime(c.in); got != c.want {
			t.Errorf("normTime(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestParseCourseScheduleSlots_Thai(t *testing.T) {
	slots := parseCourseScheduleSlots("จ,พ,ศ 09:00-12:00")
	if len(slots) != 3 {
		t.Fatalf("expected 3 slots, got %d", len(slots))
	}
	wantDays := []string{"MON", "WED", "FRI"}
	for i, s := range slots {
		if s.Day != wantDays[i] {
			t.Errorf("slot %d: Day = %q, want %q", i, s.Day, wantDays[i])
		}
		if s.StartTime != "09:00" || s.EndTime != "12:00" {
			t.Errorf("slot %d: times = %s-%s, want 09:00-12:00", i, s.StartTime, s.EndTime)
		}
	}
}

func TestParseCourseScheduleSlots_ThaiThuTue(t *testing.T) {
	slots := parseCourseScheduleSlots("อ,พฤ 13:00-16:00")
	if len(slots) != 2 {
		t.Fatalf("expected 2 slots, got %d", len(slots))
	}
	if slots[0].Day != "TUE" || slots[1].Day != "THU" {
		t.Errorf("days = %v, want TUE THU", []string{slots[0].Day, slots[1].Day})
	}
}

func TestParseCourseScheduleSlots_English(t *testing.T) {
	schedule := "Mo 10:20 - 12:05 1239 ว.1\nTu 13:00 - 16:35 1227 ว.1\nFr 16:40 - 18:25 1334 ว.1"
	slots := parseCourseScheduleSlots(schedule)
	if len(slots) != 3 {
		t.Fatalf("expected 3 slots, got %d", len(slots))
	}
	wantDays := []string{"MON", "TUE", "FRI"}
	for i, s := range slots {
		if s.Day != wantDays[i] {
			t.Errorf("slot %d: Day = %q, want %q", i, s.Day, wantDays[i])
		}
	}
	if slots[2].StartTime != "16:40" || slots[2].EndTime != "18:25" {
		t.Errorf("slot 2 times: %s-%s", slots[2].StartTime, slots[2].EndTime)
	}
}

func TestParseCourseScheduleSlots_Empty(t *testing.T) {
	if slots := parseCourseScheduleSlots(""); len(slots) != 0 {
		t.Errorf("expected 0 slots for empty string, got %d", len(slots))
	}
}

func TestConflictingDay_NoConflict(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleSet,
		Slots: []models.ScheduleSlot{
			{Day: "MON", StartTime: "08:00", EndTime: "10:00"},
		},
	}
	// Course on Tuesday — no overlap
	if day := ConflictingDay("อ,พฤ 13:00-16:00", ts); day != "" {
		t.Errorf("expected no conflict, got %q", day)
	}
}

func TestConflictingDay_DirectOverlap(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleSet,
		Slots: []models.ScheduleSlot{
			{Day: "MON", StartTime: "09:00", EndTime: "12:00"},
		},
	}
	// Course also on Monday 09:00-12:00 — exact overlap
	if day := ConflictingDay("จ,พ,ศ 09:00-12:00", ts); day != "วันจันทร์" {
		t.Errorf("expected วันจันทร์, got %q", day)
	}
}

func TestConflictingDay_PartialOverlap(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleSet,
		Slots: []models.ScheduleSlot{
			{Day: "FRI", StartTime: "10:00", EndTime: "12:00"},
		},
	}
	// Course on Friday 11:00-14:00 — partial overlap
	if day := ConflictingDay("ศ 11:00-14:00", ts); day != "วันศุกร์" {
		t.Errorf("expected วันศุกร์, got %q", day)
	}
}

func TestConflictingDay_AdjacentNoOverlap(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleSet,
		Slots: []models.ScheduleSlot{
			{Day: "MON", StartTime: "08:00", EndTime: "10:00"},
		},
	}
	// Course starts exactly when student's class ends — adjacent, no overlap
	if day := ConflictingDay("จ 10:00-12:00", ts); day != "" {
		t.Errorf("expected no conflict for adjacent slots, got %q", day)
	}
}

func TestConflictingDay_UnsetStatus(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleUnset,
		Slots: []models.ScheduleSlot{
			{Day: "MON", StartTime: "09:00", EndTime: "12:00"},
		},
	}
	// Status unset — should never block regardless of slot data
	if day := ConflictingDay("จ,พ,ศ 09:00-12:00", ts); day != "" {
		t.Errorf("expected no conflict for unset status, got %q", day)
	}
}

func TestConflictingDay_EnglishFormat(t *testing.T) {
	ts := models.TermSchedule{
		Status: models.TermScheduleSet,
		Slots: []models.ScheduleSlot{
			{Day: "WED", StartTime: "14:00", EndTime: "16:00"},
		},
	}
	schedule := "We 14:50 - 16:35 1239 ว.1"
	if day := ConflictingDay(schedule, ts); day != "วันพุธ" {
		t.Errorf("expected วันพุธ, got %q", day)
	}
}
