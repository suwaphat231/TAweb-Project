package staff

import (
	"reflect"
	"testing"
)

func TestParseThaiSchedule(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []CourseScheduleSlot
	}{
		{
			name:  "single Monday",
			input: "จ 09:00-12:00",
			want:  []CourseScheduleSlot{{Weekday: 1, StartTime: "09:00", EndTime: "12:00"}},
		},
		{
			name:  "Tuesday and Thursday — the common อ,พฤ case",
			input: "อ,พฤ 13:00-16:00",
			want: []CourseScheduleSlot{
				{Weekday: 2, StartTime: "13:00", EndTime: "16:00"},
				{Weekday: 4, StartTime: "13:00", EndTime: "16:00"},
			},
		},
		{
			name:  "Thursday alone must not be parsed as Wednesday",
			input: "พฤ 08:00-11:00",
			want:  []CourseScheduleSlot{{Weekday: 4, StartTime: "08:00", EndTime: "11:00"}},
		},
		{
			name:  "Wednesday alone",
			input: "พ 13:00-16:00",
			want:  []CourseScheduleSlot{{Weekday: 3, StartTime: "13:00", EndTime: "16:00"}},
		},
		{
			name:  "Sunday alone — อา must not be parsed as Tuesday",
			input: "อา 09:00-12:00",
			want:  []CourseScheduleSlot{{Weekday: 0, StartTime: "09:00", EndTime: "12:00"}},
		},
		{
			name:  "en dash in time range",
			input: "จ,อ 13:00–16:00",
			want: []CourseScheduleSlot{
				{Weekday: 1, StartTime: "13:00", EndTime: "16:00"},
				{Weekday: 2, StartTime: "13:00", EndTime: "16:00"},
			},
		},
		{
			name:  "three days",
			input: "จ,อ,พ 10:00-12:00",
			want: []CourseScheduleSlot{
				{Weekday: 1, StartTime: "10:00", EndTime: "12:00"},
				{Weekday: 2, StartTime: "10:00", EndTime: "12:00"},
				{Weekday: 3, StartTime: "10:00", EndTime: "12:00"},
			},
		},
		{
			name:  "Saturday and Sunday",
			input: "ส,อา 09:00-12:00",
			want: []CourseScheduleSlot{
				{Weekday: 6, StartTime: "09:00", EndTime: "12:00"},
				{Weekday: 0, StartTime: "09:00", EndTime: "12:00"},
			},
		},
		{
			name:  "single-digit hour is zero-padded",
			input: "จ 9:00-12:00",
			want:  []CourseScheduleSlot{{Weekday: 1, StartTime: "09:00", EndTime: "12:00"}},
		},
		{
			name:  "empty string returns nil",
			input: "",
			want:  nil,
		},
		{
			name:  "missing time part returns nil",
			input: "อ,พฤ",
			want:  nil,
		},
		// ── English classlist import format ───────────────────────────────────
		{
			name:  "English single line with trailing room info",
			input: "Mo 10:20 - 12:05 1239 ว.1",
			want:  []CourseScheduleSlot{{Weekday: 1, StartTime: "10:20", EndTime: "12:05"}},
		},
		{
			name:  "English Thursday",
			input: "Th 13:00 - 16:35 1227 ว.1",
			want:  []CourseScheduleSlot{{Weekday: 4, StartTime: "13:00", EndTime: "16:35"}},
		},
		{
			name:  "English Friday",
			input: "Fr 16:40 - 18:25 1334 ว.1",
			want:  []CourseScheduleSlot{{Weekday: 5, StartTime: "16:40", EndTime: "18:25"}},
		},
		{
			name:  "English multi-line three days",
			input: "Mo 10:20 - 12:05 1239 ว.1\nTu 13:00 - 16:35 1227 ว.1\nFr 16:40 - 18:25 1334 ว.1",
			want: []CourseScheduleSlot{
				{Weekday: 1, StartTime: "10:20", EndTime: "12:05"},
				{Weekday: 2, StartTime: "13:00", EndTime: "16:35"},
				{Weekday: 5, StartTime: "16:40", EndTime: "18:25"},
			},
		},
		{
			name:  "English without trailing room info",
			input: "Tu 09:00 - 12:00",
			want:  []CourseScheduleSlot{{Weekday: 2, StartTime: "09:00", EndTime: "12:00"}},
		},
		{
			name:  "English Sunday",
			input: "Su 08:00 - 10:00",
			want:  []CourseScheduleSlot{{Weekday: 0, StartTime: "08:00", EndTime: "10:00"}},
		},
		{
			name:  "English single-digit hour is zero-padded",
			input: "Mo 9:00 - 12:00",
			want:  []CourseScheduleSlot{{Weekday: 1, StartTime: "09:00", EndTime: "12:00"}},
		},
		{
			name:  "English multi-line with blank lines skipped",
			input: "Mo 10:20 - 12:05\n\nWe 13:00 - 16:00",
			want: []CourseScheduleSlot{
				{Weekday: 1, StartTime: "10:20", EndTime: "12:05"},
				{Weekday: 3, StartTime: "13:00", EndTime: "16:00"},
			},
		},
		{
			name:  "unrecognised English abbreviation returns nil",
			input: "XX 10:00 - 12:00",
			want:  nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseThaiSchedule(tc.input)
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ParseThaiSchedule(%q)\n  got  %+v\n  want %+v", tc.input, got, tc.want)
			}
		})
	}
}
