package database

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"labassist/models"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// labCreditRe matches the "(lecture-lab-self_study)" part of a credit string.
var labCreditRe = regexp.MustCompile(`\((\d+)-(\d+)-(\d+)\)`)

// LabHoursFromCredits parses a credit string like "3 (2-3-6)" and returns the
// lab-hour component (the middle number). Returns -1 when the format cannot be
// parsed — callers should treat -1 as "unknown" and not filter the course out.
func LabHoursFromCredits(credits string) int {
	m := labCreditRe.FindStringSubmatch(credits)
	if m == nil {
		return -1
	}
	n, _ := strconv.Atoi(m[2])
	return n
}

var ErrConflict = errors.New("conflict")

// ErrWithdrawalClosed is returned by WithdrawApplication when an accepted
// student tries to withdraw after the instructor has manually closed the posting.
var ErrWithdrawalClosed = errors.New("withdrawal not allowed after instructor closed the posting")

// bangkokLoc is UTC+7 with no DST — matches Asia/Bangkok without requiring
// the system timezone database (safe in slim Docker images).
var bangkokLoc = time.FixedZone("Asia/Bangkok", 7*60*60)

// applyPostingToCourse copies the recruitment-round fields from a Posting onto
// the Course's gorm:"-" fields so callers get a fully populated Course value
// without a separate Posting lookup.
func applyPostingToCourse(p models.Posting, c *models.Course) {
	c.PostingID = p.ID
	c.LabBoySlots = p.LabBoySlots
	c.LabBoyAccepted = p.LabBoyAccepted
	c.Status = p.Status
	c.Deadline = p.Deadline
	c.Description = p.Description
	c.Requirements = p.Requirements
	c.RequireGradeProof = p.RequireGradeProof
	c.ClosedByInstructor = p.ClosedByInstructor
	c.LabBoyScheduleConfirmed = p.LabBoyScheduleConfirmed
}

// closeIfPastDeadline flips an open/closing_soon posting to closed once its
// deadline has passed, persisting the change to the postings table so every
// caller sees it closed without needing a background job. Runs lazily on read
// via courseWithInstructor, the one chokepoint every course-returning query
// already passes through.
func closeIfPastDeadline(c models.Course) models.Course {
	if c.Deadline == nil || (c.Status != models.StatusOpen && c.Status != models.StatusClosingSoon) {
		return c
	}
	d := c.Deadline.In(bangkokLoc)
	endOfDeadline := time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, bangkokLoc)
	if time.Now().After(endOfDeadline) {
		c.Status = models.StatusClosed
		DB.Model(&models.Posting{}).
			Where("id = ? AND status IN ?", c.PostingID, []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
			Update("status", models.StatusClosed)
	}
	return c
}

func courseWithInstructor(c models.Course) models.Course {
	if p, ok := ActivePostingForCourse(c.ID); ok {
		applyPostingToCourse(p, &c)
	}
	c.ApplicantCount = countNonWithdrawnApplications(c.ID)
	c = closeIfPastDeadline(c)
	if c.InstructorID != nil {
		if u, ok := UserByID(*c.InstructorID); ok {
			c.InstructorName = u.FullName
		}
	}
	return c
}

func countNonWithdrawnApplications(courseID uint) int {
	var n int64
	if p, ok := ActivePostingForCourse(courseID); ok {
		DB.Model(&models.Application{}).Where("posting_id = ? AND status <> ?", p.ID, models.AppWithdrawn).Count(&n)
	}
	return int(n)
}

func enrichApplication(a models.Application) models.Application {
	if u, ok := UserByID(a.StudentID); ok {
		a.StudentName = u.FullName
		if u.StudentID != nil {
			a.StudentCode = *u.StudentID
		}
		if u.GPA != nil {
			a.StudentGPA = *u.GPA
		}
		a.StudentEmail = u.Email
		if u.Faculty != nil {
			a.StudentFaculty = *u.Faculty
		}
		if u.Year != nil {
			a.StudentYear = int(*u.Year)
		}
	}
	// Resolve course from the application's own recruitment round so CourseID
	// is populated correctly even after ResetCourseToDraft creates new postings.
	if p, ok := postingByID(a.PostingID); ok {
		a.PostingActive = p.IsActive
		a.RequireGradeProof = p.RequireGradeProof
		a.CourseID = p.CourseID
		if c, ok := CourseByID(p.CourseID); ok {
			a.CourseCode = c.Code
			a.CourseTitle = c.Title
			a.CourseEnglishTitle = c.EnglishTitle
			a.CourseSection = c.Section
			a.CourseSchedule = c.Schedule
		}
	} else if c, ok := CourseByID(a.CourseID); ok {
		// Fallback for legacy rows where posting_id was not yet set.
		a.CourseCode = c.Code
		a.CourseTitle = c.Title
		a.CourseEnglishTitle = c.EnglishTitle
		a.CourseSection = c.Section
		a.CourseSchedule = c.Schedule
	}
	if a.ReviewedByID != nil {
		if u, ok := UserByID(*a.ReviewedByID); ok {
			a.ReviewedByName = u.FullName
		}
	}
	a.HasGradeProof = len(a.GradeProofData) > 0
	return a
}

// postingByID returns a Posting by its primary key.
func postingByID(id uint) (models.Posting, bool) {
	if id == 0 {
		return models.Posting{}, false
	}
	var p models.Posting
	if DB.First(&p, id).Error != nil {
		return models.Posting{}, false
	}
	return p, true
}

// --- Users (MySQL-backed via DB, see database/connection.go) ---

func UserByID(id uint) (models.User, bool) {
	// 0 is never a real id (MySQL AUTO_INCREMENT starts at 1) — imported courses
	// use it as the "no matching instructor" placeholder, so this is hit on
	// every such course. Skip the query instead of round-tripping to the DB
	// just to log a "record not found".
	if id == 0 {
		return models.User{}, false
	}
	var u models.User
	if err := DB.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByUsername(username string) (models.User, bool) {
	var u models.User
	if err := DB.Where("username = ?", username).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByGoogleSub(sub string) (models.User, bool) {
	var u models.User
	if err := DB.Where("google_sub = ?", sub).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByEmail(email string) (models.User, bool) {
	var u models.User
	if err := DB.Where("email = ?", email).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByStudentID(studentID string) (models.User, bool) {
	var u models.User
	if err := DB.Where("student_id = ?", studentID).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func ListUsers(role, search string, limit, offset int) []models.User {
	q := DB.Model(&models.User{}).Order("id DESC")
	if role != "" {
		q = q.Where("role = ?", role)
	}
	if search != "" {
		s := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(full_name) LIKE ? OR LOWER(full_name_en) LIKE ? OR LOWER(email) LIKE ?", s, s, s)
	}
	out := make([]models.User, 0)
	q.Offset(offset).Limit(limit).Find(&out)
	return out
}

func CreateUser(u models.User) (models.User, error) {
	if u.Username != nil {
		var count int64
		DB.Model(&models.User{}).Where("username = ?", *u.Username).Count(&count)
		if count > 0 {
			return models.User{}, ErrConflict
		}
	}
	if u.Email != "" {
		var count int64
		DB.Model(&models.User{}).Where("email = ?", u.Email).Count(&count)
		if count > 0 {
			return models.User{}, ErrConflict
		}
	}
	u.ID = 0
	u.IsActive = true
	if err := DB.Create(&u).Error; err != nil {
		return models.User{}, ErrConflict
	}
	return u, nil
}

func UpdateUser(id uint, fn func(u *models.User)) (models.User, bool) {
	var u models.User
	if err := DB.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	fn(&u)
	if err := DB.Save(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func CountUsers() int64 {
	var n int64
	DB.Model(&models.User{}).Count(&n)
	return n
}

func CountUsersByRole(role models.UserRole) int64 {
	var n int64
	DB.Model(&models.User{}).Where("role = ?", role).Count(&n)
	return n
}

// --- Courses (MySQL-backed via DB, see database/connection.go) ---

func ListCourses(status, q string, hasLab *bool) []models.Course {
	query := DB.Order("id DESC")
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	if q != "" {
		s := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(code) LIKE ? OR LOWER(title) LIKE ?", s, s)
	}
	var rows []models.Course
	query.Find(&rows)
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		enriched := courseWithInstructor(c)
		if status != "" && string(enriched.Status) != status {
			continue
		}
		out = append(out, enriched)
	}
	return out
}

func CourseByID(id uint) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// InstructorCourses returns courses the instructor owns via the M:N table.
func InstructorCourses(instructorID uint, fullName string, isAdmin bool, hasLab *bool) []models.Course {
	query := DB.Table("courses").Order("courses.id DESC")
	if !isAdmin {
		query = query.Joins(
			"JOIN course_instructors ci ON ci.course_id = courses.id AND ci.instructor_id = ? AND ci.archived_at IS NULL",
			instructorID,
		)
	}
	if hasLab != nil {
		query = query.Where("courses.has_lab = ?", *hasLab)
	}
	var rows []models.Course
	query.Find(&rows)
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		cc := courseWithInstructor(c)
		cc.ApplicantCount = countNonWithdrawnApplications(c.ID)
		out = append(out, cc)
	}
	return out
}

func CreateCourse(c models.Course) models.Course {
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit(clause.Associations).Create(&c).Error; err != nil {
			return err
		}
		// The course's own instructor (matched from the import file, or the
		// instructor creating it) owns it — an imported link is what
		// InstructorOwnsCourse checks. self_added is only for courses an
		// instructor links themselves to via AddCourseRelation.
		if c.InstructorID != nil && *c.InstructorID != 0 {
			ci := models.CourseInstructor{
				CourseID:     c.ID,
				InstructorID: *c.InstructorID,
				Source:       models.CourseInstructorImported,
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ci).Error; err != nil {
				return err
			}
		}
		return syncPostingTx(tx, c)
	}); err != nil {
		return models.Course{}
	}
	return courseWithInstructor(c)
}

func UpdateCourse(id uint, fn func(c *models.Course)) (models.Course, bool) {
	var c models.Course
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; err != nil {
			return err
		}
		var p models.Posting
		if err := tx.Where("course_id = ? AND is_active = true", id).First(&p).Error; err != nil {
			return err
		}
		applyPostingToCourse(p, &c)
		fn(&c)
		if err := tx.Omit(clause.Associations).Save(&c).Error; err != nil {
			return err
		}
		return syncPostingTx(tx, c)
	}); err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

func AdjustCourseAccepted(courseID uint, role models.RoleApplied, delta int) {
	// Atomic increment/decrement directly on the posting — courses no longer
	// stores the accepted count (it's a gorm:"-" field populated from posting).
	syncPostingAcceptedTx(DB, courseID, delta)
}

// --- Recruitment posting persistence ---

// postingFromCourse builds a Posting value from a course's recruitment fields.
func postingFromCourse(c models.Course) models.Posting {
	return models.Posting{
		CourseID:                c.ID,
		IsActive:                true,
		LabBoySlots:             c.LabBoySlots,
		LabBoyAccepted:          c.LabBoyAccepted,
		Status:                  c.Status,
		Deadline:                c.Deadline,
		Description:             c.Description,
		Requirements:            c.Requirements,
		RequireGradeProof:       c.RequireGradeProof,
		ClosedByInstructor:      c.ClosedByInstructor,
		LabBoyScheduleConfirmed: c.LabBoyScheduleConfirmed,
	}
}

// syncPostingTx creates or updates the active posting for the course inside
// the given DB handle (which may be a transaction). LabBoyAccepted is
// intentionally omitted — use syncPostingAcceptedTx for that field.
func syncPostingTx(tx *gorm.DB, c models.Course) error {
	p := postingFromCourse(c)
	var existing models.Posting
	err := tx.Where("course_id = ? AND is_active = true", c.ID).First(&existing).Error
	if err == nil {
		return tx.Model(&existing).
			Select("LabBoySlots", "Status", "Deadline", "Description", "Requirements", "RequireGradeProof", "ClosedByInstructor", "LabBoyScheduleConfirmed").
			Updates(p).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return tx.Create(&p).Error
}

// syncPostingAcceptedTx mirrors an atomic lab_boy_accepted delta onto the
// active posting, matching the concurrent-safe update applied to courses.
func syncPostingAcceptedTx(tx *gorm.DB, courseID uint, delta int) {
	tx.Model(&models.Posting{}).
		Where("course_id = ? AND is_active = true", courseID).
		UpdateColumn("lab_boy_accepted", gorm.Expr("lab_boy_accepted + ?", delta))
}

// ActivePostingForCourse returns the current recruitment round for a course.
func ActivePostingForCourse(courseID uint) (models.Posting, bool) {
	var p models.Posting
	err := DB.Where("course_id = ? AND is_active = true", courseID).First(&p).Error
	return p, err == nil
}

// deleteEmptyCourseTx rejects deletion of any course with submitted records.
func deleteEmptyCourseTx(tx *gorm.DB, id uint) error {
	var course models.Course
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, id).Error; err != nil {
		return err
	}
	// Preserve every submitted application, review and issued document.
	for _, table := range []string{"applications", "application_history", "form_reviews", "staff_documents"} {
		var n int64
		if err := tx.Table(table).Where("course_id = ? OR posting_id IN (SELECT id FROM postings WHERE course_id = ?)", id, id).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrConflict
		}
	}
	if err := tx.Model(&models.Notification{}).Where("course_id = ?", id).Update("course_id", nil).Error; err != nil {
		return err
	}
	if err := tx.Where("course_id = ?", id).Delete(&models.Posting{}).Error; err != nil {
		return err
	}
	return tx.Delete(&course).Error
}

func DeleteCourse(id uint) bool {
	return DB.Transaction(func(tx *gorm.DB) error { return deleteEmptyCourseTx(tx, id) }) == nil
}

// ResetCourseToDraft is what an instructor's "ลบประกาศ" actually does:
// archive the current active posting (preserving all application history,
// form reviews, and staff documents that reference it) and open a blank draft
// posting for the next recruitment round. The course catalog row — code,
// title, section, schedule, instructor — is untouched. No applications are
// deleted; they remain linked to the now-archived posting.
func ResetCourseToDraft(id uint) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; err != nil {
			return err
		}
		// Archive the current round — mark it inactive so history is preserved.
		if err := tx.Model(&models.Posting{}).
			Where("course_id = ? AND is_active = true", id).
			Update("is_active", false).Error; err != nil {
			return err
		}
		// Open a fresh draft posting for the new round.
		return tx.Create(&models.Posting{
			CourseID: id,
			IsActive: true,
			Status:   models.StatusDraft,
		}).Error
	}); err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// DeleteCoursesByTerm removes every course in the given semester/academic
// year and any applications submitted for them, returning the count removed.
// CourseExists reports whether a teaching slot (code + section + semester +
// academic_year) is already occupied. The instructor is not part of the key:
// the same section cannot exist twice regardless of who teaches it.
func CourseExists(code, semester string, academicYear, section int) bool {
	_, ok := FindCourseByKey(code, semester, academicYear, section)
	return ok
}

// FindCourseByKey returns the existing course occupying the same slot
// (code + section + semester + academic year), regardless of instructor.
func FindCourseByKey(code, semester string, academicYear, section int) (models.Course, bool) {
	var c models.Course
	err := DB.Where("code = ? AND semester = ? AND academic_year = ? AND section = ?",
		code, semester, academicYear, section).First(&c).Error
	return c, err == nil
}

// FindCourseSlot returns the course for one meeting time (slot) of a section.
func FindCourseSlot(code, semester string, academicYear, section, slot int) (models.Course, bool) {
	var c models.Course
	err := DB.Where("code = ? AND semester = ? AND academic_year = ? AND section = ? AND slot = ?",
		code, semester, academicYear, section, slot).First(&c).Error
	return c, err == nil
}

// DeleteCoursesByTerm only deletes empty catalog entries; historical data stays.
func DeleteCoursesByTerm(semester string, academicYear int) int {
	deleted := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var ids []uint
		if err := tx.Model(&models.Course{}).Where("semester = ? AND academic_year = ?", semester, academicYear).Order("id").Pluck("id", &ids).Error; err != nil {
			return err
		}
		for _, id := range ids {
			if err := deleteEmptyCourseTx(tx, id); err != nil {
				if errors.Is(err, ErrConflict) {
					continue
				}
				return err
			}
			deleted++
		}
		return nil
	})
	if err != nil {
		return 0
	}
	return deleted
}

func CountCourses() int64 {
	var n int64
	DB.Model(&models.Course{}).Count(&n)
	return n
}

func CountOpenCourses() int64 {
	var n int64
	DB.Model(&models.Posting{}).
		Where("status IN ? AND is_active = true", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Count(&n)
	return n
}

func RecentOpenCourses(limit int) []models.Course {
	var postings []models.Posting
	DB.Where("status IN ? AND is_active = true", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Order("id DESC").Limit(limit).Find(&postings)
	out := make([]models.Course, 0, len(postings))
	for _, p := range postings {
		if c, ok := CourseByID(p.CourseID); ok {
			out = append(out, c)
		}
	}
	return out
}

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
func InstructorsForCourse(c models.Course) []models.User {
	var instructors []models.User
	DB.Where("role = ?", models.RoleInstructor).Find(&instructors)

	out := make([]models.User, 0, 1)
	for _, u := range instructors {
		if InstructorOwnsCourse(c, u.ID, u.FullName, false) {
			out = append(out, u)
		}
	}
	return out
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
func MyCourseRelations(instructorID uint) []CourseRelation {
	var rows []models.CourseInstructor
	DB.Where("instructor_id = ? AND archived_at IS NULL", instructorID).
		Order("id DESC").Find(&rows)
	out := make([]CourseRelation, 0, len(rows))
	for _, r := range rows {
		course, ok := CourseByID(r.CourseID)
		if !ok {
			continue
		}
		course.ApplicantCount = countNonWithdrawnApplications(r.CourseID)
		out = append(out, CourseRelation{
			ID:        r.ID,
			Course:    course,
			Source:    r.Source,
			CreatedAt: r.CreatedAt,
		})
	}
	return out
}

// CourseCandidates returns courses the instructor is not yet linked to,
// optionally filtered by semester, academic_year, and a search string.
// Courses without any instructor (nil InstructorID) are excluded — they are
// catalog placeholders, not real class sections.
func CourseCandidates(instructorID uint, semester string, academicYear int, search string) []models.Course {
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
	query.Find(&rows)
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		out = append(out, courseWithInstructor(c))
	}
	return out
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
func CoursesTaughtBy(instructorID uint, fullName string, isAdmin bool) []models.Course {
	query := DB.Table("courses").Order("courses.id DESC")
	if !isAdmin {
		query = query.Joins(
			"JOIN course_instructors ci ON ci.course_id = courses.id AND ci.instructor_id = ? AND ci.archived_at IS NULL",
			instructorID,
		)
	}
	var rows []models.Course
	query.Find(&rows)

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
	return out
}

// CoreCourseCatalog returns every core_courses code, deduped (the same code
// can appear once per program — see models.CoreCourse), code ascending. This
// is the department's required-course reference list (seeded from
// migrations/allcourse.sql), not the imported class-postings in the courses
// table — it's what backs the "type a code, see suggestions" helper when an
// admin adds a course by hand instead of importing it from Excel.
func CoreCourseCatalog() []models.CoreCourse {
	var rows []models.CoreCourse
	DB.Order("code ASC").Find(&rows)

	seenCode := make(map[string]bool, len(rows))
	out := make([]models.CoreCourse, 0, len(rows))
	for _, c := range rows {
		if seenCode[c.Code] {
			continue
		}
		seenCode[c.Code] = true
		out = append(out, c)
	}
	return out
}

// TaughtCourseSections returns all sections for a given code/semester/year
// that the instructor teaches, section-number ascending. Used by the posting
// section-picker — sections always come from the imported classlist. Backed by
// the M:N table so unmatched-import nil-instructor rows are no longer exposed
// to arbitrary instructors.
func TaughtCourseSections(instructorID uint, fullName string, isAdmin bool, code, semester string, academicYear int) []models.Course {
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
	query.Find(&rows)

	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		cc := courseWithInstructor(c)
		cc.ApplicantCount = countNonWithdrawnApplications(c.ID)
		out = append(out, cc)
	}
	return out
}

// --- Transcripts (MySQL-backed via DB) ---
//
// Each student keeps at most one transcript (UserID is uniquely indexed on
// the model); uploading again replaces the stored file rather than adding a
// second row.

func UpsertTranscript(userID uint, fileName string, data []byte) (models.Transcript, error) {
	var t models.Transcript
	if err := DB.Where("user_id = ?", userID).First(&t).Error; err == nil {
		t.FileName = fileName
		t.FileData = data
		t.FileSize = int64(len(data))
		t.UploadedAt = time.Now()
		if err := DB.Save(&t).Error; err != nil {
			return models.Transcript{}, err
		}
		return t, nil
	}

	t = models.Transcript{
		UserID:     userID,
		FileName:   fileName,
		FileData:   data,
		FileSize:   int64(len(data)),
		UploadedAt: time.Now(),
	}
	if err := DB.Create(&t).Error; err != nil {
		return models.Transcript{}, err
	}
	return t, nil
}

func TranscriptByUserID(userID uint) (models.Transcript, bool) {
	var t models.Transcript
	if err := DB.Where("user_id = ?", userID).First(&t).Error; err != nil {
		return models.Transcript{}, false
	}
	return t, true
}

// --- Applications ---

func ApplicantsForCourse(courseID uint, roleFilter, statusFilter, search string) []models.Application {
	posting, ok := ActivePostingForCourse(courseID)
	if !ok {
		return []models.Application{}
	}
	out := make([]models.Application, 0)
	for _, a := range applicationRows("posting_id = ?", posting.ID) {
		if roleFilter != "" && string(a.RoleApplied) != roleFilter {
			continue
		}
		if statusFilter != "" && string(a.Status) != statusFilter {
			continue
		}
		enriched := enrichApplication(a)
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(enriched.StudentName), s) && !strings.Contains(strings.ToLower(enriched.StudentCode), s) {
				continue
			}
		}
		out = append(out, enriched)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StudentGPA > out[j].StudentGPA })
	return out
}

func StudentApplications(studentID uint) []models.Application {
	out := make([]models.Application, 0)
	for _, a := range applicationRows("student_id = ?", studentID) {
		if a.StudentID != studentID {
			continue
		}
		out = append(out, enrichApplication(a).StudentView())
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].AppliedAt.After(out[j].AppliedAt) })
	return out
}

func RecentStudentApplications(studentID uint, limit int) []models.Application {
	all := StudentApplications(studentID)
	active := all[:0]
	for _, a := range all {
		if a.PostingActive && a.Status != models.AppWithdrawn {
			active = append(active, a)
		}
	}
	if len(active) > limit {
		return active[:limit]
	}
	return active
}

func CountAppliedByStudent(studentID uint) int64 {
	var n int64
	DB.Model(&models.Application{}).
		Joins("JOIN postings ON postings.id = applications.posting_id AND postings.is_active = true").
		Where("student_id = ? AND applications.status <> ?", studentID, models.AppWithdrawn).Count(&n)
	return n
}

func ApplicationByID(id uint) (models.Application, bool) {
	var a models.Application
	if DB.First(&a, id).Error != nil {
		return a, false
	}
	return enrichApplication(a), true
}

func ApplicationByIDForStudent(id, studentID uint) (models.Application, bool) {
	var a models.Application
	if DB.Where("id = ? AND student_id = ?", id, studentID).First(&a).Error != nil {
		return a, false
	}
	return enrichApplication(a), true
}

func CreateApplication(a models.Application) (models.Application, error) {
	a.ID = 0
	a.AppliedAt = time.Now()

	// Resolve the active posting for this course. CallerID passes CourseID;
	// we set PostingID before persisting.
	posting, ok := ActivePostingForCourse(a.CourseID)
	if !ok {
		return models.Application{}, fmt.Errorf("no active posting for course %d", a.CourseID)
	}
	a.PostingID = posting.ID

	err := DB.Transaction(func(tx *gorm.DB) error {
		// Serialize with reset/delete so an in-flight request cannot attach
		// itself to a recruitment round that was just archived.
		var course models.Course
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, a.CourseID).Error; err != nil {
			return err
		}
		var current models.Posting
		if err := tx.Where("id = ? AND is_active = true", a.PostingID).First(&current).Error; err != nil {
			return ErrConflict
		}
		// Check for an existing application for this student in this posting.
		var existing models.Application
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("student_id = ? AND posting_id = ?", a.StudentID, a.PostingID).
			First(&existing).Error
		if err == nil {
			if existing.Status != models.AppWithdrawn && existing.Status != models.AppRejected {
				return ErrConflict
			}
			// An instructor-cancelled acceptance is not an invitation to
			// re-apply; only the instructor can accept the student again.
			if existing.Cancelled {
				return ErrConflict
			}
			// Archive the old round so the student's history and grade proof
			// from the rejected/withdrawn round are preserved for the instructor.
			snapshot := models.ApplicationHistory{
				ApplicationID:      existing.ID,
				StudentID:          existing.StudentID,
				PostingID:          existing.PostingID,
				CourseID:           existing.CourseID,
				RoleApplied:        existing.RoleApplied,
				Status:             existing.Status,
				Grade:              existing.Grade,
				AppliedAt:          existing.AppliedAt,
				ReviewedAt:         existing.ReviewedAt,
				ReviewedByID:       existing.ReviewedByID,
				Note:               existing.Note,
				WithdrawalReason:   existing.WithdrawalReason,
				OcrWarning:         existing.OcrWarning,
				GradeProofFileName: existing.GradeProofFileName,
				GradeProofData:     existing.GradeProofData,
				ArchivedAt:         time.Now(),
			}
			if err := tx.Create(&snapshot).Error; err != nil {
				return err
			}
			// Reuse the row — reset it to a fresh pending application.
			existing.Status = models.AppPending
			existing.RoleApplied = a.RoleApplied
			existing.Grade = a.Grade
			existing.AppliedAt = a.AppliedAt
			existing.ReviewedAt = nil
			existing.ReviewedByID = nil
			existing.Note = nil
			existing.OcrWarning = nil
			existing.GradeProofFileName = ""
			existing.GradeProofData = nil
			a = existing
			return tx.Omit(clause.Associations).Save(&existing).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := tx.Omit(clause.Associations).Create(&a).Error; err != nil {
			var mysqlErr *mysqldriver.MySQLError
			if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
				return ErrConflict
			}
			return err
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

func UpdateApplication(id uint, fn func(a *models.Application)) (models.Application, bool) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&a, id).Error; err != nil {
			return err
		}
		fn(&a)
		return tx.Omit(clause.Associations).Save(&a).Error
	})
	if err != nil {
		return models.Application{}, false
	}
	return enrichApplication(a), true
}

// ErrAlreadyWithdrawn is returned by WithdrawApplication when the row is already withdrawn.
var ErrAlreadyWithdrawn = errors.New("already withdrawn")

// WithdrawApplication atomically sets the application to withdrawn and, if it
// was previously accepted, decrements the course's accepted-slot counter — all
// within a single transaction so concurrent withdrawals cannot double-decrement.
func WithdrawApplication(id, studentID uint, reason string) (models.Application, error) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND student_id = ?", id, studentID).
			First(&a).Error; err != nil {
			return err
		}
		if a.Status == models.AppWithdrawn {
			return ErrAlreadyWithdrawn
		}
		// Accepted students may not withdraw once the instructor has
		// deliberately closed the posting; deadline-based auto-close alone
		// does not block withdrawal (ClosedByInstructor stays false).
		if a.Status == models.AppAccepted {
			var posting models.Posting
			if err := tx.First(&posting, a.PostingID).Error; err == nil && posting.ClosedByInstructor {
				return ErrWithdrawalClosed
			}
		}
		// An accepted Lab Boy only files a request; the instructor decides
		// in ResolveWithdrawRequest, so the slot stays taken until then.
		if a.Status == models.AppAccepted {
			if a.WithdrawRequested {
				return ErrWithdrawAlreadyRequested
			}
			now := time.Now()
			a.WithdrawRequested = true
			a.WithdrawRequestedAt = &now
			a.WithdrawalReason = &reason
			return tx.Omit(clause.Associations).Save(&a).Error
		}
		prevStatus := a.Status
		a.Status = models.AppWithdrawn
		a.WithdrawalReason = &reason
		// The student saw a cancelled acceptance as pending, so withdrawing
		// it must leave them free to re-apply like any other withdrawal.
		a.Cancelled = false
		if err := tx.Omit(clause.Associations).Save(&a).Error; err != nil {
			return err
		}
		if prevStatus == models.AppAccepted {
			return tx.Model(&models.Posting{}).Where("id = ?", a.PostingID).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

// ErrWithdrawAlreadyRequested is returned by WithdrawApplication when an
// accepted student's withdrawal request is still awaiting the instructor.
var ErrWithdrawAlreadyRequested = errors.New("withdraw already requested")

// ErrNoWithdrawRequest is returned by ResolveWithdrawRequest when the
// application has no pending withdrawal request.
var ErrNoWithdrawRequest = errors.New("no pending withdraw request")

// ErrPostingArchived is returned when the application's posting has been
// archived, which makes it read-only.
var ErrPostingArchived = errors.New("posting archived")

// ResolveWithdrawRequest approves or rejects an accepted Lab Boy's pending
// withdrawal request. Approving withdraws the application and hands its slot
// back; rejecting clears the request and leaves the student accepted.
func ResolveWithdrawRequest(appID uint, approve bool, reviewerID uint) (models.Application, error) {
	var a models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&a, appID).Error; err != nil {
			return err
		}
		if a.Status != models.AppAccepted || !a.WithdrawRequested {
			return ErrNoWithdrawRequest
		}
		var posting models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&posting, a.PostingID).Error; err != nil {
			return err
		}
		if !posting.IsActive {
			return ErrPostingArchived
		}
		now := time.Now()
		a.WithdrawRequested = false
		a.ReviewedAt = &now
		a.ReviewedByID = &reviewerID
		if approve {
			a.Status = models.AppWithdrawn
		} else {
			a.WithdrawRequestedAt = nil
			a.WithdrawalReason = nil
		}
		if err := tx.Omit(clause.Associations).Save(&a).Error; err != nil {
			return err
		}
		if approve {
			return tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error
		}
		return nil
	})
	if err != nil {
		return models.Application{}, err
	}
	return enrichApplication(a), nil
}

// ReviewTxResult is returned by ReviewApplicationTx.
type ReviewTxResult struct {
	Archived     bool // archived rounds are read-only
	Updated      models.Application
	PrevStatus   models.AppStatus
	SlotsFull    bool // true when skipped because the course had no remaining slots
	WasWithdrawn bool // true when skipped because the student withdrew after the pre-check
	MissingProof bool // true when skipped because course requires grade proof but none uploaded
}

// ReviewApplicationTx atomically checks slot availability, updates the
// application, and adjusts the course's accepted count inside one transaction
// with row-level locks on both the course and the application. This prevents
// two concurrent accepts from both passing the slot check when only one slot
// remains. When SlotsFull is true the application is unchanged and no error
// is returned.
func ReviewApplicationTx(appID uint, newStatus models.AppStatus, applyFields func(a *models.Application)) (ReviewTxResult, error) {
	var res ReviewTxResult
	err := DB.Transaction(func(tx *gorm.DB) error {
		var app models.Application
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&app, appID).Error; err != nil {
			return err
		}

		var posting models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&posting, app.PostingID).Error; err != nil {
			return err
		}
		if !posting.IsActive {
			res.Archived = true
			return nil
		}

		// Re-check after acquiring the lock: the student may have withdrawn
		// between the handler's pre-check and this point.
		if app.Status == models.AppWithdrawn {
			res.WasWithdrawn = true
			return nil
		}

		prevStatus := app.Status

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			if app.RoleApplied == models.RoleLabBoy && posting.LabBoyAccepted >= posting.LabBoySlots {
				res.SlotsFull = true
				return nil
			}
			// Enforce grade-proof requirement inside the lock so a direct API
			// call or a race between upload and review cannot bypass it.
			if posting.RequireGradeProof && len(app.GradeProofData) == 0 {
				res.MissingProof = true
				return nil
			}
		}

		applyFields(&app)
		// Leaving accepted settles any pending withdrawal request.
		if app.Status != models.AppAccepted {
			app.WithdrawRequested = false
		}
		if err := tx.Omit(clause.Associations).Save(&app).Error; err != nil {
			return err
		}

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			if err := tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("lab_boy_accepted + 1")).Error; err != nil {
				return err
			}
		} else if prevStatus == models.AppAccepted && newStatus != models.AppAccepted {
			if err := tx.Model(&posting).
				UpdateColumn("lab_boy_accepted", gorm.Expr("GREATEST(0, lab_boy_accepted - 1)")).Error; err != nil {
				return err
			}
		}

		res.PrevStatus = prevStatus
		res.Updated = enrichApplication(app)
		return nil
	})
	return res, err
}

// SetApplicationGradeProof stores the uploaded grade-proof image on an
// application, replacing any previous upload. Ownership must be checked by
// the caller before calling this (e.g. via ApplicationByIDForStudent).
func SetApplicationGradeProof(id uint, fileName string, data []byte) (models.Application, bool) {
	return UpdateApplication(id, func(a *models.Application) {
		a.GradeProofFileName = fileName
		a.GradeProofData = data
	})
}

// ApplicationGradeProofData returns the raw image bytes for an application's
// grade proof, for the download endpoints. Ownership/authorization must be
// checked by the caller first.
func ApplicationGradeProofData(id uint) (fileName string, data []byte, ok bool) {
	var a models.Application
	if DB.Select("grade_proof_file_name", "grade_proof_data").First(&a, id).Error != nil || len(a.GradeProofData) == 0 {
		return "", nil, false
	}
	return a.GradeProofFileName, a.GradeProofData, true
}

func BulkUpdateApplications(ids []uint, fn func(a *models.Application)) int64 {
	var rows []models.Application
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ?", ids).Order("id").Find(&rows).Error; err != nil {
			return err
		}
		for i := range rows {
			fn(&rows[i])
			if err := tx.Omit(clause.Associations).Save(&rows[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0
	}
	return int64(len(rows))
}

func CountApplications() int64 {
	var n int64
	DB.Model(&models.Application{}).Count(&n)
	return n
}

func CountApplicationsByStatus(status models.AppStatus) int64 {
	var n int64
	DB.Model(&models.Application{}).Where("status = ?", status).Count(&n)
	return n
}

// --- Notifications ---

func CreateNotifications(notifs []models.Notification) int {
	if len(notifs) == 0 {
		return 0
	}
	for i := range notifs {
		notifs[i].ID = 0
		notifs[i].CreatedAt = time.Now()
	}
	if DB.Create(&notifs).Error != nil {
		return 0
	}
	return len(notifs)
}

func UserNotifications(userID uint) []models.Notification {
	out := make([]models.Notification, 0)
	DB.Where("user_id = ?", userID).Order("id DESC").Find(&out)
	return out
}

func MarkNotifRead(id, userID uint) {
	DB.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("is_read", true)
}

func MarkAllNotifsRead(userID uint) {
	DB.Model(&models.Notification{}).Where("user_id = ?", userID).Update("is_read", true)
}

func AcceptedStudentsForCourse(courseID uint) []models.Application {
	posting, ok := ActivePostingForCourse(courseID)
	if !ok {
		return []models.Application{}
	}
	out := make([]models.Application, 0)
	for _, a := range applicationRows("posting_id = ? AND status = ?", posting.ID, models.AppAccepted) {
		out = append(out, enrichApplication(a))
	}
	return out
}

// --- Activity logs ---

func CreateActivityLog(l models.ActivityLog) {
	l.ID = 0
	l.CreatedAt = time.Now()
	DB.Create(&l)
}

func ListActivityLogs(userID, method string, offset, limit int) ([]models.ActivityLog, int64) {
	q := DB.Model(&models.ActivityLog{})
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if method != "" {
		q = q.Where("method = ?", method)
	}
	var total int64
	q.Count(&total)
	out := make([]models.ActivityLog, 0)
	q.Order("id DESC").Offset(offset).Limit(limit).Find(&out)
	return out, total
}

func applicationRows(query string, args ...interface{}) []models.Application {
	rows := make([]models.Application, 0)
	DB.Where(query, args...).Order("id").Find(&rows)
	return rows
}

// ApplicationHistoryForApplication returns all archived rounds for an
// application, newest first. Each entry represents one rejected or withdrawn
// round the student re-applied from.
func ApplicationHistoryForApplication(applicationID uint) []models.ApplicationHistory {
	var rows []models.ApplicationHistory
	DB.Where("application_id = ?", applicationID).Order("archived_at DESC").Find(&rows)
	return rows
}

// migrateWorkOccurrenceDedup removes duplicate (schedule_group_id, scheduled_date)
// rows from work_occurrences before AutoMigrate adds the unique index
// idx_wo_group_date. Keeps the occurrence with the lowest ID in each duplicate
// set. Idempotent: skipped when the table is absent (first run) or the index
// already exists.
func migrateWorkOccurrenceDedup(db *gorm.DB) error {
	if !db.Migrator().HasTable("work_occurrences") {
		return nil
	}
	if db.Migrator().HasIndex("work_occurrences", "idx_wo_group_date") {
		return nil
	}
	return db.Exec(`
		DELETE wo FROM work_occurrences wo
		INNER JOIN (
			SELECT MIN(id) AS keep_id, schedule_group_id, scheduled_date
			FROM work_occurrences
			WHERE schedule_group_id IS NOT NULL
			GROUP BY schedule_group_id, scheduled_date
			HAVING COUNT(*) > 1
		) dups
		ON  wo.schedule_group_id = dups.schedule_group_id
		AND wo.scheduled_date    = dups.scheduled_date
		AND wo.id               != dups.keep_id
	`).Error
}

func migrateApplicationData(db *gorm.DB) error {
	// AutoMigrate may remove the legacy unique course_id index while altering
	// FormReview. Create its replacement first so MySQL can retain the FK.
	if db.Migrator().HasTable("form_reviews") && !db.Migrator().HasIndex("form_reviews", "idx_form_reviews_course_lookup") {
		if err := db.Exec("CREATE INDEX idx_form_reviews_course_lookup ON form_reviews(course_id)").Error; err != nil {
			return fmt.Errorf("prepare form review course FK index: %w", err)
		}
	}
	if err := migrateWorkOccurrenceDedup(db); err != nil {
		return fmt.Errorf("dedup work_occurrences before unique index: %w", err)
	}
	return db.AutoMigrate(
		&models.Application{},
		&models.Notification{},
		&models.ActivityLog{},
		&models.FormReview{},
		&models.StaffDocument{},
		&models.ApplicationHistory{},
		&models.ClassSchedule{},
		&models.TermSchedule{},
		&models.ApplicationHistory{},
		&models.ClassSchedule{},
		&models.TermSchedule{},
		&models.Blacklist{},
		&models.Posting{},
		&models.StudentInfoDocument{},
		&models.StaffCase{},
		&models.ScheduleGroup{},
		&models.ScheduleGroupAssignment{},
		&models.CalendarDate{},
		&models.WorkOccurrence{},
		&models.MonthlyPeriod{},
		&models.StaffAuditLog{},
		&models.ScheduleGroupMonth{},
	)
}

// BackfillPostings creates one posting per course that does not yet have one.
// Safe to call multiple times (idempotent). Called on startup after AutoMigrate
// so every existing course gets a posting row before ensureForeignKeys runs.
func BackfillPostings(db *gorm.DB) error {
	var courses []models.Course
	if err := db.Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses for posting backfill: %w", err)
	}
	for _, c := range courses {
		var n int64
		if err := db.Model(&models.Posting{}).Where("course_id = ?", c.ID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		p := postingFromCourse(c)
		// Course's API fields are ignored by GORM. Read the legacy columns
		// explicitly before creating the first posting; fresh databases have
		// no such columns and start with a draft.
		if db.Migrator().HasColumn("courses", "lab_boy_slots") {
			var legacy models.Posting
			if err := db.Table("courses").Select("lab_boy_slots", "lab_boy_accepted", "status", "deadline", "description", "requirements", "require_grade_proof", "closed_by_instructor", "lab_boy_schedule_confirmed").Where("id = ?", c.ID).Scan(&legacy).Error; err != nil {
				return err
			}
			p = legacy
			p.CourseID, p.IsActive = c.ID, true
		}
		if p.Status == "" {
			p.Status = models.StatusDraft
		}
		if err := db.Create(&p).Error; err != nil {
			return fmt.Errorf("backfill posting for course %d: %w", c.ID, err)
		}
	}
	return nil
}
