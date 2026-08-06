package database

import (
	_ "embed"
	"strings"

	"labassist/models"
)

//go:embed migrations/allcourse.sql
var coreCourseSeedSQL string

// seedCoreCourses loads the course catalog the OCR feature matches against.
// The SQL is idempotent (ON CONFLICT DO NOTHING), so it runs on every startup
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

// CoreCoursesForProgram returns the courses the OCR feature should look for.
// An empty program returns every course, deduplicated by code (the same course
// is listed once per program, and the transcript only carries the code).
func CoreCoursesForProgram(program string) []models.CoreCourse {
	var courses []models.CoreCourse
	q := DB.Order("code")
	if program != "" {
		q = q.Where("program = ?", program)
	}
	if err := q.Find(&courses).Error; err != nil {
		return nil
	}
	if program != "" {
		return courses
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
	return unique
}
