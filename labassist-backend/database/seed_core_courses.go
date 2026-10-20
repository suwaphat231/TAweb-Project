package database

import (
	_ "embed"
	"strings"

	"labassist/models"
)

//go:embed migrations/allcourse.sql
var coreCourseSeedSQL string

// seedCoreCourses loads the course catalog the OCR feature matches against.
// The SQL is idempotent (ON DUPLICATE KEY UPDATE), so it runs on every startup
// and picks up any course rows added to allcourse.sql since the last run.
func seedCoreCourses() error {
	return DB.Exec(coreCourseSeedSQL).Error
}

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
	// a grade, so look for those codes too. Transcripts print 6-digit codes.
	var offered []struct{ Code, Title string }
	if err := DB.Raw(`SELECT code, MIN(title) AS title FROM courses
		WHERE code REGEXP '^[0-9]{6}$' GROUP BY code ORDER BY code`).Scan(&offered).Error; err != nil {
		return unique
	}
	for _, c := range offered {
		if seen[c.Code] {
			continue
		}
		seen[c.Code] = true
		unique = append(unique, models.CoreCourse{Program: program, Code: c.Code, Title: c.Title})
	}
	return unique
}
