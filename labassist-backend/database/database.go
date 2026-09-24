package database

import (
	"errors"
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

// closeIfPastDeadline flips an open/closing_soon posting to closed once its
// deadline has passed, persisting the change so every caller — the public
// catalog, the instructor's own list, admin — sees it closed without needing
// a background job. Runs lazily on read via courseWithInstructor, the one
// chokepoint every course-returning query already passes through.
func closeIfPastDeadline(c models.Course) models.Course {
	if c.Deadline == nil || (c.Status != models.StatusOpen && c.Status != models.StatusClosingSoon) {
		return c
	}
	d := c.Deadline.In(bangkokLoc)
	endOfDeadline := time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, bangkokLoc)
	if time.Now().After(endOfDeadline) {
		c.Status = models.StatusClosed
		DB.Model(&models.Course{}).Where("id = ?", c.ID).Update("status", models.StatusClosed)
	}
	return c
}

func courseWithInstructor(c models.Course) models.Course {
	c = closeIfPastDeadline(c)
	if u, ok := UserByID(c.InstructorID); ok {
		c.InstructorName = u.FullName
	}
	return c
}

func countNonWithdrawnApplications(courseID uint) int {
	var n int64
	DB.Model(&models.Application{}).Where("course_id = ? AND status <> ?", courseID, models.AppWithdrawn).Count(&n)
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
	if c, ok := CourseByID(a.CourseID); ok {
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
		q = q.Where("LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?", s, s)
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
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	if q != "" {
		s := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(code) LIKE ? OR LOWER(title) LIKE ?", s, s)
	}
	var rows []models.Course
	query.Find(&rows)
	out := make([]models.Course, len(rows))
	for i, c := range rows {
		out[i] = courseWithInstructor(c)
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

// InstructorCourses returns courses authorized by stored account ID.
func InstructorCourses(instructorID uint, fullName string, isAdmin bool, hasLab *bool) []models.Course {
	query := DB.Order("id DESC")
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	var rows []models.Course
	query.Find(&rows)
	out := make([]models.Course, 0, len(rows))
	for _, c := range rows {
		if !InstructorOwnsCourse(c, instructorID, fullName, isAdmin) {
			continue
		}
		cc := courseWithInstructor(c)
		cc.ApplicantCount = countNonWithdrawnApplications(c.ID)
		out = append(out, cc)
	}
	return out
}

func CreateCourse(c models.Course) models.Course {
	DB.Create(&c)
	return courseWithInstructor(c)
}

func UpdateCourse(id uint, fn func(c *models.Course)) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	fn(&c)
	// Omit LabBoyAccepted so a concurrent AdjustCourseAccepted cannot be
	// overwritten by the stale value we read at the top of this call.
	if err := DB.Model(&c).Omit("LabBoyAccepted").Save(&c).Error; err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

func AdjustCourseAccepted(courseID uint, role models.RoleApplied, delta int) {
	// Atomic increment/decrement — avoids the read-modify-write race that
	// would occur if two acceptances ran concurrently.
	DB.Model(&models.Course{}).Where("id = ?", courseID).
		UpdateColumn("lab_boy_accepted", gorm.Expr("lab_boy_accepted + ?", delta))
}

// DeleteCourse removes a single course and any applications submitted for it.
// Only for admin cleanup of bad/duplicate catalog data (AdminCourses'
// per-row delete and "ลบทั้งเทอม") — an instructor taking down their own
// posting goes through ResetCourseToDraft instead, which keeps the
// underlying section so it can be opened again later.
func DeleteCourse(id uint) bool {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("course_id = ?", id).Delete(&models.Application{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&models.Course{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	}) == nil
}

// ResetCourseToDraft is what an instructor's "ลบประกาศ" actually does: wipe
// every recruiting-specific field and drop all applications submitted
// against it, but keep the row itself — code/title/section/schedule/
// instructor/semester/year survive, so the same section can be picked from
// the catalog and opened again later instead of needing a fresh Excel
// re-import. (Admin's own delete, for genuinely bad import data, still
// hard-deletes via DeleteCourse.)
func ResetCourseToDraft(id uint) (models.Course, bool) {
	var c models.Course
	if err := DB.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	c.Status = models.StatusDraft
	c.LabBoySlots = 0
	c.LabBoyAccepted = 0
	c.Deadline = nil
	c.Description = nil
	c.Requirements = nil
	c.RequireGradeProof = false
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&c).Error; err != nil {
			return err
		}
		return tx.Where("course_id = ?", id).Delete(&models.Application{}).Error
	}); err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

// DeleteCoursesByTerm removes every course in the given semester/academic
// year and any applications submitted for them, returning the count removed.
// CourseExists returns true when a course row with the same instructor,
// code, semester, academic year, and section already exists in the database.
func CourseExists(instructorID uint, code, semester string, academicYear, section int) bool {
	var n int64
	DB.Model(&models.Course{}).
		Where("instructor_id = ? AND code = ? AND semester = ? AND academic_year = ? AND section = ?",
			instructorID, code, semester, academicYear, section).
		Count(&n)
	return n > 0
}

// FindCourseByKey returns the existing course occupying the same slot
// (code + section + semester + academic year), regardless of instructor.
func FindCourseByKey(code, semester string, academicYear, section int) (models.Course, bool) {
	var c models.Course
	err := DB.Where("code = ? AND semester = ? AND academic_year = ? AND section = ?",
		code, semester, academicYear, section).First(&c).Error
	return c, err == nil
}

func DeleteCoursesByTerm(semester string, academicYear int) int {
	var n int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var ids []uint
		if err := tx.Model(&models.Course{}).Where("semester = ? AND academic_year = ?", semester, academicYear).Pluck("id", &ids).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		if err := tx.Where("course_id IN ?", ids).Delete(&models.Application{}).Error; err != nil {
			return err
		}
		if err := tx.Where("course_id IN ?", ids).Delete(&models.FormReview{}).Error; err != nil {
			return err
		}
		result := tx.Where("id IN ?", ids).Delete(&models.Course{})
		n = result.RowsAffected
		return result.Error
	})
	if err != nil {
		return 0
	}
	return int(n)
}

func CountCourses() int64 {
	var n int64
	DB.Model(&models.Course{}).Count(&n)
	return n
}

func CountOpenCourses() int64 {
	var n int64
	DB.Model(&models.Course{}).
		Where("status IN ?", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Count(&n)
	return n
}

func RecentOpenCourses(limit int) []models.Course {
	var rows []models.Course
	DB.Where("status IN ?", []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Order("id DESC").Limit(limit).Find(&rows)
	out := make([]models.Course, len(rows))
	for i, c := range rows {
		out[i] = courseWithInstructor(c)
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
// instructors (co-taught sections separate names with ";") into individual,
// trimmed names.
func SplitInstructorNames(s string) []string {
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

// InstructorOwnsCourse authorizes only the stored account ID or an admin.
// Display names are user-editable and must never grant access.
func InstructorOwnsCourse(c models.Course, instructorID uint, _ string, isAdmin bool) bool {
	return isAdmin || (instructorID != 0 && c.InstructorID == instructorID)
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

// CoursesTaughtBy returns authorized courses, deduplicated by course code.
// Courses whose credits string explicitly shows 0 lab hours (e.g. "3 (3-0-6)")
// are excluded — only lecture-only courses are eligible for Lab Boy hiring.
func CoursesTaughtBy(instructorID uint, fullName string, isAdmin bool) []models.Course {
	var rows []models.Course
	DB.Order("id DESC").Find(&rows)

	seenCode := make(map[string]bool, len(rows))
	out := make([]models.Course, 0)
	for _, c := range rows {
		// Unmatched imports (InstructorID=0) are visible to any instructor
		// in the autocomplete, same policy as TaughtCourseSections.
		if c.InstructorID != 0 && !InstructorOwnsCourse(c, instructorID, fullName, isAdmin) {
			continue
		}
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

// TaughtCourseSections returns every imported class-section row (unlike
// CoursesTaughtBy, not deduplicated by code) matching code+semester+year that
// this instructor teaches, section number ascending. Backs the section
// picker shown when opening a posting — section/schedule always come from
// the spreadsheet import, never typed in by the instructor, so this is the
// only source of truth for "which real sections exist for this code."
//
// The query also matches codes with a curriculum suffix (e.g. searching
// "517122" also returns "517122-165") because the university classlist
// appends a curriculum code to the subject code, and instructors typically
// search by the bare subject code.
//
// Courses whose InstructorID was not matched during import (ID = 0) are
// included so that the posting flow does not break when name-matching fails
// at import time — the actual course link is recorded on the Course row
// created when the posting is opened.
func TaughtCourseSections(instructorID uint, fullName string, isAdmin bool, code, semester string, academicYear int) []models.Course {
	var rows []models.Course
	DB.Where("(code = ? OR code LIKE ?) AND semester = ? AND academic_year = ?",
		code, code+"-%", semester, academicYear).
		Order("section ASC").Find(&rows)

	out := make([]models.Course, 0)
	for _, c := range rows {
		// Courses with a matched instructor must belong to this instructor.
		// Courses with InstructorID=0 (unmatched import) are shown to any
		// instructor so they can still open postings for their own sections.
		if c.InstructorID != 0 && !InstructorOwnsCourse(c, instructorID, fullName, isAdmin) {
			continue
		}
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
	out := make([]models.Application, 0)
	for _, a := range applicationRows("course_id = ?", courseID) {
		if a.CourseID != courseID {
			continue
		}
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
		out = append(out, enrichApplication(a))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].AppliedAt.After(out[j].AppliedAt) })
	return out
}

func RecentStudentApplications(studentID uint, limit int) []models.Application {
	all := StudentApplications(studentID)
	active := all[:0]
	for _, a := range all {
		if a.Status != models.AppWithdrawn {
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
	DB.Model(&models.Application{}).Where("student_id = ? AND status <> ?", studentID, models.AppWithdrawn).Count(&n)
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
	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing models.Application
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("student_id = ? AND course_id = ?", a.StudentID, a.CourseID).
			First(&existing).Error
		if err == nil {
			if existing.Status != models.AppWithdrawn && existing.Status != models.AppRejected {
				return ErrConflict
			}
			// Archive the old round so the student's history and grade proof
			// from the rejected/withdrawn round are preserved for the instructor.
			snapshot := models.ApplicationHistory{
				ApplicationID:      existing.ID,
				StudentID:          existing.StudentID,
				CourseID:           existing.CourseID,
				RoleApplied:        existing.RoleApplied,
				Status:             existing.Status,
				Grade:              existing.Grade,
				AppliedAt:          existing.AppliedAt,
				ReviewedAt:         existing.ReviewedAt,
				ReviewedByID:       existing.ReviewedByID,
				Note:               existing.Note,
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
func WithdrawApplication(id, studentID uint) (models.Application, error) {
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
			var course models.Course
			if err := tx.First(&course, a.CourseID).Error; err == nil && course.ClosedByInstructor {
				return ErrWithdrawalClosed
			}
		}
		prevStatus := a.Status
		a.Status = models.AppWithdrawn
		if err := tx.Omit(clause.Associations).Save(&a).Error; err != nil {
			return err
		}
		if prevStatus == models.AppAccepted {
			return tx.Model(&models.Course{}).
				Where("id = ?", a.CourseID).
				UpdateColumn("lab_boy_accepted", gorm.Expr("lab_boy_accepted + ?", -1)).Error
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
	Updated      models.Application
	PrevStatus   models.AppStatus
	SlotsFull    bool // true when skipped because the course had no remaining slots
	WasWithdrawn bool // true when skipped because the student withdrew after the pre-check
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

		var course models.Course
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, app.CourseID).Error; err != nil {
			return err
		}

		// Re-check after acquiring the lock: the student may have withdrawn
		// between the handler's pre-check and this point.
		if app.Status == models.AppWithdrawn {
			res.WasWithdrawn = true
			return nil
		}

		prevStatus := app.Status

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			if app.RoleApplied == models.RoleLabBoy && course.LabBoyAccepted >= course.LabBoySlots {
				res.SlotsFull = true
				return nil
			}
		}

		applyFields(&app)
		if err := tx.Omit(clause.Associations).Save(&app).Error; err != nil {
			return err
		}

		if newStatus == models.AppAccepted && prevStatus != models.AppAccepted {
			course.LabBoyAccepted++
			if err := tx.Omit(clause.Associations).Save(&course).Error; err != nil {
				return err
			}
		} else if prevStatus == models.AppAccepted && newStatus != models.AppAccepted {
			if course.LabBoyAccepted > 0 {
				course.LabBoyAccepted--
			}
			if err := tx.Omit(clause.Associations).Save(&course).Error; err != nil {
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
	out := make([]models.Application, 0)
	for _, a := range applicationRows("course_id = ? AND status = ?", courseID, models.AppAccepted) {
		if a.CourseID == courseID && a.Status == models.AppAccepted {
			out = append(out, enrichApplication(a))
		}
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

func migrateApplicationData(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.Application{},
		&models.Notification{},
		&models.ActivityLog{},
		&models.FormReview{},
		&models.StaffDocument{},
		&models.ApplicationHistory{},
		&models.ClassSchedule{},
		&models.TermSchedule{},
	)
}
