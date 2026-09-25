package database

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"labassist/models"
)

var (
	thaiDayToWeekday = map[string]string{
		"อา": "SUN", "จ": "MON", "อ": "TUE", "พ": "WED", "พฤ": "THU", "ศ": "FRI", "ส": "SAT",
	}
	enDayToWeekday = map[string]string{
		"Su": "SUN", "Mo": "MON", "Tu": "TUE", "We": "WED", "Th": "THU", "Fr": "FRI", "Sa": "SAT",
	}
	weekdayThaiName = map[string]string{
		"MON": "วันจันทร์", "TUE": "วันอังคาร", "WED": "วันพุธ", "THU": "วันพฤหัสบดี",
		"FRI": "วันศุกร์", "SAT": "วันเสาร์", "SUN": "วันอาทิตย์",
	}

	// thaiCommaRe matches the Thai comma-day format stored by manually-entered
	// instructor schedules, e.g. "จ,พ,ศ 09:00-12:00" or "อ,พฤ 13:00-16:00".
	// The entire string must match (no trailing room info).
	thaiCommaRe = regexp.MustCompile(`^([\x{0E00}-\x{0E7F},]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$`)

	// enLineRe matches one line of the classlist-import format, e.g.
	// "Mo 10:20 - 12:05 1239 ว.1". Day abbr is case-sensitive (Mo not MO).
	enLineRe = regexp.MustCompile(`^(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})`)
)

// normTime pads the hour to two digits so lexicographic comparison works:
// "9:00" → "09:00", "16:35" → "16:35".
func normTime(t string) string {
	parts := strings.SplitN(t, ":", 2)
	if len(parts) != 2 {
		return t
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return t
	}
	return fmt.Sprintf("%02d:%s", h, parts[1])
}

// parseCourseScheduleSlots extracts (weekday, start, end) triples from a
// course Schedule string. Handles two formats:
//   - Thai comma-day (instructor-entered): "จ,พ,ศ 09:00-12:00"
//   - English multi-line (classlist import): "Mo 10:20 - 12:05 1239\nTu 13:00 - 16:35"
//
// Weekday codes match TermSchedule.Slots: MON TUE WED THU FRI SAT SUN.
func parseCourseScheduleSlots(schedule string) []models.ScheduleSlot {
	schedule = strings.TrimSpace(schedule)
	if schedule == "" {
		return nil
	}

	// Thai comma-day format — try the whole string as one pattern.
	if m := thaiCommaRe.FindStringSubmatch(schedule); m != nil {
		var slots []models.ScheduleSlot
		for _, abbr := range strings.Split(m[1], ",") {
			abbr = strings.TrimSpace(abbr)
			if wd, ok := thaiDayToWeekday[abbr]; ok {
				slots = append(slots, models.ScheduleSlot{
					Day:       wd,
					StartTime: normTime(m[2]),
					EndTime:   normTime(m[3]),
				})
			}
		}
		if len(slots) > 0 {
			return slots
		}
	}

	// English multi-line classlist format — parse line by line.
	var slots []models.ScheduleSlot
	for _, line := range strings.Split(schedule, "\n") {
		if m := enLineRe.FindStringSubmatch(strings.TrimSpace(line)); m != nil {
			if wd, ok := enDayToWeekday[m[1]]; ok {
				slots = append(slots, models.ScheduleSlot{
					Day:       wd,
					StartTime: normTime(m[2]),
					EndTime:   normTime(m[3]),
				})
			}
		}
	}
	return slots
}

// ConflictingDay returns the Thai name of the first weekday where the course
// schedule overlaps with the student's confirmed term-schedule slots.
// Returns "" when there is no conflict, the student's schedule status is not
// "set", or the course schedule cannot be parsed.
func ConflictingDay(courseSchedule string, ts models.TermSchedule) string {
	if ts.Status != models.TermScheduleSet || len(ts.Slots) == 0 {
		return ""
	}
	for _, cs := range parseCourseScheduleSlots(courseSchedule) {
		for _, ss := range ts.Slots {
			if cs.Day == ss.Day && cs.StartTime < ss.EndTime && ss.StartTime < cs.EndTime {
				if name, ok := weekdayThaiName[cs.Day]; ok {
					return name
				}
				return cs.Day
			}
		}
	}
	return ""
}
