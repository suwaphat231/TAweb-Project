package database

import "strings"

// Lab Boy headcount rule (from the lab boys' own practice):
//   - year-1 courses: registered students / 10
//   - year-2-and-up courses: registered students / 20
//
// rounded up so every student is covered.
const (
	labBoyStudentsPerYear1   = 10
	labBoyStudentsPerYear2Up = 20
)

// LabBoyCourseYear returns the course's year level, the 4th digit of its
// 6-digit code (517121 → 1, 517211 → 2). 0 means it can't be read.
func LabBoyCourseYear(code string) int {
	c := CatalogCodeFromCell(code)
	if len(c) != 6 || c[3] < '1' || c[3] > '9' {
		return 0
	}
	return int(c[3] - '0')
}

// IsSeminarCourse reports whether a course is a seminar (สัมมนา), which is left
// out of the Lab Boy formula.
func IsSeminarCourse(title, englishTitle string) bool {
	return strings.Contains(title, "สัมมนา") || strings.Contains(strings.ToLower(englishTitle), "seminar")
}

// SuggestedLabBoySlots is how many Lab Boys a section needs for the given
// number of registered students. 0 when the headcount or the year level is
// unknown, or for a seminar, so callers fall back to manual entry.
func SuggestedLabBoySlots(code, title, englishTitle string, enrolled int) int {
	year := LabBoyCourseYear(code)
	if enrolled <= 0 || year == 0 || IsSeminarCourse(title, englishTitle) {
		return 0
	}
	per := labBoyStudentsPerYear2Up
	if year == 1 {
		per = labBoyStudentsPerYear1
	}
	return (enrolled + per - 1) / per
}
