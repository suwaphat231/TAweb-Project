package database

import (
	"strings"
	"time"

	"labassist/models"
)

// NormalizeInstructorName strips common Thai academic title prefixes (full
// words and their common abbreviations) and keeps only the given name —
// last names are ignored so a spreadsheet's "ดร.ภูริวัจน์ วรวิชัยพัฒน์"
// still matches a user account stored as just "ผศ.ดร. ภูริวัจน์".
var instructorTitlePrefixes = []string{
	"ผู้ช่วยศาสตราจารย์", "รองศาสตราจารย์", "ศาสตราจารย์",
	"ผศ.", "ผศ", "รศ.", "รศ", "ศ.",
	"อาจารย์", "ดร.", "ดร", "นางสาว", "นาง", "นาย",
}

func NormalizeInstructorName(s string) string {
	s = strings.TrimSpace(s)
	for changed := true; changed; {
		changed = false
		for _, p := range instructorTitlePrefixes {
			if strings.HasPrefix(s, p) {
				s = strings.TrimSpace(strings.TrimPrefix(s, p))
				changed = true
			}
		}
	}
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// SplitInstructorNames splits a spreadsheet cell listing one or more
// instructors into individual, trimmed names.
// Classlist cells use "\n" as separator; legacy imports may use ";".
func SplitInstructorNames(s string) []string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", ";")
	parts := strings.Split(s, ";")
	names := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			names = append(names, p)
		}
	}
	return names
}

// InstructorOwnsCourse reports whether instructorID has management rights over
// this course. Only 'imported' rows (sourced from the official classlist) grant
// management rights. 'self_added' rows allow list visibility only and must never
// be used to gate write operations — any instructor can create a self_added row,
// so treating it as ownership would allow privilege escalation.
func InstructorOwnsCourse(c models.Course, instructorID uint, _ string, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	if instructorID == 0 || DB == nil {
		return false
	}
	var count int64
	DB.Model(&models.CourseInstructor{}).
		Where("course_id = ? AND instructor_id = ? AND source = 'imported' AND archived_at IS NULL", c.ID, instructorID).
		Count(&count)
	return count > 0
}

// InstructorsForCourse returns the instructor account linked to the course.
func InstructorsForCourse(c models.Course) ([]models.User, error) {
	var instructors []models.User
	if err := DB.Where("role = ?", models.RoleInstructor).Find(&instructors).Error; err != nil {
		return nil, err
	}

	out := make([]models.User, 0, 1)
	for _, u := range instructors {
		if InstructorOwnsCourse(c, u.ID, u.FullName, false) {
			out = append(out, u)
		}
	}
	return out, nil
}

// CourseRelation pairs a CourseInstructor junction row with its full Course
// for the /instructor/my-courses endpoint.
type CourseRelation struct {
	ID        uint                          `json:"id"`
	Course    models.Course                 `json:"course"`
	Source    models.CourseInstructorSource `json:"source"`
	CreatedAt time.Time                     `json:"created_at"`
}

// MyCourseRelations returns every active (non-archived) course-instructor link
// for the given instructor, with the full Course embedded.
func MyCourseRelations(instructorID uint) ([]CourseRelation, error) {
	var rows []models.CourseInstructor
	if err := DB.Where("instructor_id = ? AND archived_at IS NULL", instructorID).
		Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]CourseRelation, 0, len(rows))
	for _, r := range rows {
		course, ok := CourseByID(r.CourseID)
		if !ok {
			continue
		}
		out = append(out, CourseRelation{
			ID:        r.ID,
			Course:    course,
			Source:    r.Source,
			CreatedAt: r.CreatedAt,
		})
	}
	return out, nil
}

// CourseCandidates returns courses the instructor is not yet linked to,
// optionally filtered by semester, academic_year, and a search string.
// Courses without any instructor (nil InstructorID) are excluded — they are
// catalog placeholders, not real class sections.
func CourseCandidates(instructorID uint, semester string, academicYear int, search string) ([]models.Course, error) {
	query := DB.Table("courses").
		Where("courses.instructor_id IS NOT NULL").
		Where("courses.id NOT IN (SELECT course_id FROM course_instructors WHERE instructor_id = ? AND archived_at IS NULL)", instructorID).
		Order("courses.code ASC, courses.section ASC")
	if semester != "" {
		query = query.Where("courses.semester = ?", semester)
	}
	if academicYear > 0 {
		query = query.Where("courses.academic_year = ?", academicYear)
	}
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("courses.code LIKE ? OR courses.title LIKE ?", like, like)
	}
	var rows []models.Course
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		out = append(out, courseWithInstructor(c))
	}
	return out, nil
}

// AddCourseRelation creates or un-archives a self_added course-instructor link.
func AddCourseRelation(courseID, instructorID uint) (models.CourseInstructor, bool) {
	// Check if a soft-deleted row already exists.
	var existing models.CourseInstructor
	err := DB.Where("course_id = ? AND instructor_id = ?", courseID, instructorID).First(&existing).Error
	if err == nil {
		if existing.ArchivedAt != nil {
			// Un-archive: flip it back to active.
			if err := DB.Model(&existing).Updates(map[string]any{
				"archived_at": nil,
				"source":      models.CourseInstructorSelfAdded,
			}).Error; err != nil {
				return models.CourseInstructor{}, false
			}
			existing.ArchivedAt = nil
			existing.Source = models.CourseInstructorSelfAdded
		}
		return existing, true
	}
	// Create new.
	rel := models.CourseInstructor{
		CourseID:     courseID,
		InstructorID: instructorID,
		Source:       models.CourseInstructorSelfAdded,
	}
	if err := DB.Create(&rel).Error; err != nil {
		return models.CourseInstructor{}, false
	}
	return rel, true
}

// RemoveCourseRelation soft-deletes a self_added course-instructor link.
// Imported links (source='imported') cannot be removed through this path.
func RemoveCourseRelation(relationID, instructorID uint) bool {
	var rel models.CourseInstructor
	if err := DB.Where("id = ? AND instructor_id = ? AND source = 'self_added' AND archived_at IS NULL",
		relationID, instructorID).First(&rel).Error; err != nil {
		return false
	}
	now := time.Now()
	return DB.Model(&rel).Update("archived_at", now).Error == nil
}

// CoursesTaughtBy returns the instructor's courses deduplicated by code,
// excluding courses with zero lab hours. Backed by the M:N course_instructors
// table so only explicitly linked courses appear (nil-instructor gap closed).
func CoursesTaughtBy(instructorID uint, fullName string, isAdmin bool) ([]models.Course, error) {
	query := DB.Table("courses").Order("courses.id DESC")
	if !isAdmin {
		query = query.Joins(
			"JOIN course_instructors ci ON ci.course_id = courses.id AND ci.instructor_id = ? AND ci.archived_at IS NULL",
			instructorID,
		)
	}
	var rows []models.Course
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}

	seenCode := make(map[string]bool, len(rows))
	out := make([]models.Course, 0)
	for _, c := range rows {
		if seenCode[c.Code] {
			continue
		}
		if LabHoursFromCredits(c.Credits) == 0 {
			continue
		}
		seenCode[c.Code] = true
		out = append(out, courseWithInstructor(c))
	}
	return out, nil
}

// CoreCourseCatalog returns every core_courses code, deduped (the same code
// can appear once per program — see models.CoreCourse), code ascending. This
// is the department's required-course reference list (seeded from
// seed/allcourse.sql), not the imported class-postings in the courses
// table — it's what backs the "type a code, see suggestions" helper when an
// admin adds a course by hand instead of importing it from Excel.
func CoreCourseCatalog() ([]models.CoreCourse, error) {
	var rows []models.CoreCourse
	if err := DB.Order("code ASC").Find(&rows).Error; err != nil {
		return nil, err
	}

	seenCode := make(map[string]bool, len(rows))
	out := make([]models.CoreCourse, 0, len(rows))
	for _, c := range rows {
		if seenCode[c.Code] {
			continue
		}
		seenCode[c.Code] = true
		out = append(out, c)
	}
	return out, nil
}

// TaughtCourseSections returns all sections for a given code/semester/year
// that the instructor teaches, section-number ascending. Used by the posting
// section-picker — sections always come from the imported classlist. Backed by
// the M:N table so unmatched-import nil-instructor rows are no longer exposed
// to arbitrary instructors.
func TaughtCourseSections(instructorID uint, fullName string, isAdmin bool, code, semester string, academicYear int) ([]models.Course, error) {
	query := DB.Table("courses").
		Where("(courses.code = ? OR courses.code LIKE ?) AND courses.semester = ? AND courses.academic_year = ?",
			code, code+"-%", semester, academicYear).
		Order("courses.section ASC, courses.slot ASC")
	if !isAdmin {
		query = query.Joins(
			"JOIN course_instructors ci ON ci.course_id = courses.id AND ci.instructor_id = ? AND ci.archived_at IS NULL",
			instructorID,
		)
	}
	var rows []models.Course
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		out = append(out, courseWithInstructor(c))
	}
	return out, nil
}
