package database

import (
	"strings"

	"labassist/models"
)

// facultyProgram maps the free-text faculty a student fills in on their
// profile to a curriculum. Matching is substring-based because the value is
// typed by hand and shows up in several forms ("เทคโนโลยีสารสนเทศ",
// "สาขาเทคโนโลยีสารสนเทศ", …).
var facultyProgram = []struct {
	keyword string
	program string
}{
	{"สารสนเทศ", models.ProgramIT},
	{"information", models.ProgramIT},
	{"วิทยาการคอมพิวเตอร์", models.ProgramCS},
	{"computer science", models.ProgramCS},
}

// ProgramForFaculty resolves a student's faculty text to "IT" or "CS", or ""
// when it matches neither — callers treat "" as "check every program's
// courses" rather than failing, since faculty is optional on a profile.
func ProgramForFaculty(faculty *string) string {
	if faculty == nil {
		return ""
	}
	lowered := strings.ToLower(*faculty)
	for _, m := range facultyProgram {
		if strings.Contains(lowered, m.keyword) {
			return m.program
		}
	}
	return ""
}

// CoreCoursesForProgram returns the courses the OCR feature should look for:
// the program's core courses plus every course in the courses table. An empty
// program takes every program's core courses. The result is deduplicated by
// code (the transcript only carries the code).
func CoreCoursesForProgram(program string) []models.CoreCourse {
	var courses []models.CoreCourse
	q := DB.Order("code")
	if program != "" {
		q = q.Where("program = ?", program)
	}
	if err := q.Find(&courses).Error; err != nil {
		return nil
	}
	seen := make(map[string]bool, len(courses))
	unique := courses[:0]
	for _, c := range courses {
		if seen[c.Code] {
			continue
		}
		seen[c.Code] = true
		unique = append(unique, c)
	}

	// Every course in the classlist can be posted for Lab Boy and may ask for
	// a grade, so look for those codes too. Stored codes can carry a
	// curriculum suffix ("520101-165"), which transcripts do not print, so
	// reduce each one to its 6-digit code the same way the catalog import does.
	var offered []struct{ Code, Title string }
	if err := DB.Raw(`SELECT code, MIN(title) AS title FROM courses
		GROUP BY code ORDER BY code`).Scan(&offered).Error; err != nil {
		return unique
	}
	for _, c := range offered {
		code := CatalogCodeFromCell(c.Code)
		if code == "" || seen[code] {
			continue
		}
		seen[code] = true
		unique = append(unique, models.CoreCourse{Program: program, Code: code, Title: c.Title})
	}
	return unique
}
