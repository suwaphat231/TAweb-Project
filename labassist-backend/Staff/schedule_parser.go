package staff

import (
	"regexp"
	"strings"
)

// CourseScheduleSlot is one parsed day-and-time slot from a course schedule string.
type CourseScheduleSlot struct {
	Weekday   int    `json:"weekday"`    // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
	StartTime string `json:"start_time"` // HH:MM
	EndTime   string `json:"end_time"`   // HH:MM
}

// thaiDayEntries maps Thai abbreviations to weekday numbers.
// IMPORTANT: longer entries (พฤ, อา) are listed before their shorter prefixes (พ, อ)
// so that matching stops at the correct token.
var thaiDayEntries = []struct {
	abbr    string
	weekday int
}{
	{"พฤ", 4}, // Thursday — must precede พ (Wednesday)
	{"อา", 0}, // Sunday   — must precede อ (Tuesday)
	{"จ", 1},  // Monday
	{"อ", 2},  // Tuesday
	{"พ", 3},  // Wednesday
	{"ศ", 5},  // Friday
	{"ส", 6},  // Saturday
}

// enDayWeekday maps English classlist day abbreviations to weekday numbers.
// These are the exact two-letter codes produced by the course-import pipeline.
var enDayWeekday = map[string]int{
	"Su": 0, "Mo": 1, "Tu": 2, "We": 3, "Th": 4, "Fr": 5, "Sa": 6,
}

// thaiCommaRe matches the Thai comma-day format stored by manually-entered
// instructor schedules, e.g. "อ,พฤ 13:00-16:00" or "จ,พ,ศ 09:00-12:00".
// en/em dashes are accepted alongside ASCII hyphen.
var thaiCommaRe = regexp.MustCompile(
	`^([\x{0E00}-\x{0E7F},]+)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$`,
)

// enLineRe matches one line of the classlist-import format, e.g.
// "Mo 10:20 - 12:05 1239 ว.1". The day abbreviation is case-sensitive.
// Trailing room/building tokens are ignored.
var enLineRe = regexp.MustCompile(
	`^(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})`,
)

// ParseThaiSchedule parses course schedule strings in either format:
//
//   - Thai instructor-entered: "อ,พฤ 13:00-16:00"
//   - English classlist import (one or more newline-separated lines):
//     "Mo 10:20 - 12:05 1239 ว.1\nFr 16:40 - 18:25 1334 ว.1"
//
// Returns nil when the string is empty or contains no recognisable slots.
func ParseThaiSchedule(s string) []CourseScheduleSlot {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}

	// ── Thai comma-day format (whole-string match) ────────────────────────────
	if m := thaiCommaRe.FindStringSubmatch(s); m != nil {
		var slots []CourseScheduleSlot
		for _, abbr := range strings.Split(m[1], ",") {
			abbr = strings.TrimSpace(abbr)
			wd := matchThaiDay(abbr)
			if wd < 0 {
				continue
			}
			slots = append(slots, CourseScheduleSlot{
				Weekday:   wd,
				StartTime: padTime(m[2]),
				EndTime:   padTime(m[3]),
			})
		}
		if len(slots) > 0 {
			return slots
		}
	}

	// ── English classlist import format — one day per line ───────────────────
	var slots []CourseScheduleSlot
	for _, line := range strings.Split(s, "\n") {
		m := enLineRe.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		wd, ok := enDayWeekday[m[1]]
		if !ok {
			continue
		}
		slots = append(slots, CourseScheduleSlot{
			Weekday:   wd,
			StartTime: padTime(m[2]),
			EndTime:   padTime(m[3]),
		})
	}
	return slots
}

// matchThaiDay returns the weekday number (0=Sun..6=Sat) for one Thai day
// abbreviation, or -1 if unrecognised.
func matchThaiDay(abbr string) int {
	for _, e := range thaiDayEntries {
		if abbr == e.abbr {
			return e.weekday
		}
	}
	return -1
}

// padTime zero-pads a single-digit hour: "9:00" → "09:00".
func padTime(t string) string {
	if len(t) == 4 {
		return "0" + t
	}
	return t
}
