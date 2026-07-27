// Package database is the data-access layer. Users and courses are backed by
// the real Postgres connection (DB, see connection.go) and persist across
// restarts. Applications, notifications, and activity logs are still an
// in-memory mock data layer guarded by a single mutex; nothing there
// survives a restart until they get their own migration.
package database

import (
	"errors"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"labassist/models"
)

var ErrConflict = errors.New("conflict")

var mu sync.RWMutex

var (
	applications  []*models.Application
	activityLogs  []*models.ActivityLog
	notifications []*models.Notification

	nextAppID   uint = 1
	nextLogID   uint = 1
	nextNotifID uint = 1
)

// --- internal helpers (caller must hold mu) ---

func findAppByIDLocked(id uint) *models.Application {
	for _, a := range applications {
		if a.ID == id {
			return a
		}
	}
	return nil
}

func courseWithInstructor(c models.Course) models.Course {
	if u, ok := UserByID(c.InstructorID); ok {
		c.InstructorName = u.FullName
	}
	return c
}

func countNonWithdrawnApplications(courseID uint) int {
	mu.RLock()
	defer mu.RUnlock()
	n := 0
	for _, a := range applications {
		if a.CourseID == courseID && a.Status != models.AppWithdrawn {
			n++
		}
	}
	return n
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
	}
	if a.ReviewedByID != nil {
		if u, ok := UserByID(*a.ReviewedByID); ok {
			a.ReviewedByName = u.FullName
		}
	}
	return a
}

// --- Users (Postgres-backed via DB, see database/connection.go) ---

func UserByID(id uint) (models.User, bool) {
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

// --- Courses (Postgres-backed via DB, see database/connection.go) ---

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

func InstructorCourses(instructorID uint, isAdmin bool, hasLab *bool) []models.Course {
	query := DB.Order("id DESC")
	if !isAdmin {
		query = query.Where("instructor_id = ?", instructorID)
	}
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	var rows []models.Course
	query.Find(&rows)
	out := make([]models.Course, len(rows))
	for i, c := range rows {
		cc := courseWithInstructor(c)
		cc.ApplicantCount = countNonWithdrawnApplications(c.ID)
		out[i] = cc
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
	if err := DB.Save(&c).Error; err != nil {
		return models.Course{}, false
	}
	return courseWithInstructor(c), true
}

func AdjustCourseAccepted(courseID uint, role models.RoleApplied, delta int) {
	var c models.Course
	if err := DB.First(&c, courseID).Error; err != nil {
		return
	}
	if role == models.RoleTA {
		c.TAAccepted += delta
	} else {
		c.LabBoyAccepted += delta
	}
	DB.Save(&c)
}

// deleteApplicationsForCourseLocked removes every application tied to
// courseID so a deleted course doesn't leave orphaned applications behind.
// Caller must hold mu.
func deleteApplicationsForCourseLocked(courseID uint) {
	kept := applications[:0]
	for _, a := range applications {
		if a.CourseID != courseID {
			kept = append(kept, a)
		}
	}
	applications = kept
}

// DeleteCourse removes a single course and any applications submitted for it.
func DeleteCourse(id uint) bool {
	result := DB.Delete(&models.Course{}, id)
	if result.Error != nil || result.RowsAffected == 0 {
		return false
	}
	mu.Lock()
	deleteApplicationsForCourseLocked(id)
	mu.Unlock()
	return true
}

// DeleteCoursesByTerm removes every course in the given semester/academic
// year and any applications submitted for them, returning the count removed.
func DeleteCoursesByTerm(semester string, academicYear int) int {
	var toDelete []models.Course
	DB.Where("semester = ? AND academic_year = ?", semester, academicYear).Find(&toDelete)
	if len(toDelete) == 0 {
		return 0
	}
	ids := make([]uint, len(toDelete))
	for i, c := range toDelete {
		ids[i] = c.ID
	}
	DB.Where("id IN ?", ids).Delete(&models.Course{})

	mu.Lock()
	for _, id := range ids {
		deleteApplicationsForCourseLocked(id)
	}
	mu.Unlock()
	return len(ids)
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

// CoursesTaughtBy returns, most-recent first, every course whose instructor
// matches instructorID directly (e.g. courses the instructor created
// themselves) or whose spreadsheet-imported InstructorsRaw text names
// fullName (covering co-taught sections where only the first-listed name
// got linked to a real account). isAdmin bypasses the match entirely. Used
// to populate the course-code choices when an instructor creates a new
// posting, so they can only pick a code the classlist says they teach.
func CoursesTaughtBy(instructorID uint, fullName string, isAdmin bool) []models.Course {
	var rows []models.Course
	DB.Order("id DESC").Find(&rows)

	target := NormalizeInstructorName(fullName)
	seenCode := make(map[string]bool, len(rows))
	out := make([]models.Course, 0)
	for _, c := range rows {
		matches := isAdmin || c.InstructorID == instructorID
		if !matches && target != "" {
			for _, n := range SplitInstructorNames(c.InstructorsRaw) {
				if NormalizeInstructorName(n) == target {
					matches = true
					break
				}
			}
		}
		if !matches || seenCode[c.Code] {
			continue
		}
		seenCode[c.Code] = true
		out = append(out, courseWithInstructor(c))
	}
	return out
}

// --- Applications ---

func ApplicantsForCourse(courseID uint, roleFilter, statusFilter, search string) []models.Application {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Application, 0)
	for _, a := range applications {
		if a.CourseID != courseID {
			continue
		}
		if roleFilter != "" && string(a.RoleApplied) != roleFilter {
			continue
		}
		if statusFilter != "" && string(a.Status) != statusFilter {
			continue
		}
		enriched := enrichApplication(*a)
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
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Application, 0)
	for _, a := range applications {
		if a.StudentID != studentID {
			continue
		}
		out = append(out, enrichApplication(*a))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].AppliedAt.After(out[j].AppliedAt) })
	return out
}

func RecentStudentApplications(studentID uint, limit int) []models.Application {
	all := StudentApplications(studentID)
	if len(all) > limit {
		return all[:limit]
	}
	return all
}

func CountAppliedByStudent(studentID uint) int64 {
	mu.RLock()
	defer mu.RUnlock()
	var n int64
	for _, a := range applications {
		if a.StudentID == studentID && a.Status != models.AppWithdrawn {
			n++
		}
	}
	return n
}

func ApplicationByID(id uint) (models.Application, bool) {
	mu.RLock()
	defer mu.RUnlock()
	a := findAppByIDLocked(id)
	if a == nil {
		return models.Application{}, false
	}
	return enrichApplication(*a), true
}

func ApplicationByIDForStudent(id, studentID uint) (models.Application, bool) {
	mu.RLock()
	defer mu.RUnlock()
	a := findAppByIDLocked(id)
	if a == nil || a.StudentID != studentID {
		return models.Application{}, false
	}
	return enrichApplication(*a), true
}

func CreateApplication(a models.Application) (models.Application, error) {
	mu.Lock()
	defer mu.Unlock()
	for _, existing := range applications {
		if existing.StudentID == a.StudentID && existing.CourseID == a.CourseID {
			return models.Application{}, ErrConflict
		}
	}
	a.ID = nextAppID
	nextAppID++
	a.AppliedAt = time.Now()
	applications = append(applications, &a)
	return enrichApplication(a), nil
}

func UpdateApplication(id uint, fn func(a *models.Application)) (models.Application, bool) {
	mu.Lock()
	defer mu.Unlock()
	a := findAppByIDLocked(id)
	if a == nil {
		return models.Application{}, false
	}
	fn(a)
	return enrichApplication(*a), true
}

func BulkUpdateApplications(ids []uint, fn func(a *models.Application)) int64 {
	mu.Lock()
	defer mu.Unlock()
	idSet := make(map[uint]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}
	var n int64
	for _, a := range applications {
		if idSet[a.ID] {
			fn(a)
			n++
		}
	}
	return n
}

func CountApplications() int64 {
	mu.RLock()
	defer mu.RUnlock()
	return int64(len(applications))
}

func CountApplicationsByStatus(status models.AppStatus) int64 {
	mu.RLock()
	defer mu.RUnlock()
	var n int64
	for _, a := range applications {
		if a.Status == status {
			n++
		}
	}
	return n
}

// --- Notifications ---

func CreateNotifications(notifs []models.Notification) int {
	mu.Lock()
	defer mu.Unlock()
	for i := range notifs {
		notifs[i].ID = nextNotifID
		nextNotifID++
		notifs[i].CreatedAt = time.Now()
		cp := notifs[i]
		notifications = append(notifications, &cp)
	}
	return len(notifs)
}

func UserNotifications(userID uint) []models.Notification {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Notification, 0)
	for i := len(notifications) - 1; i >= 0; i-- {
		if notifications[i].UserID == userID {
			out = append(out, *notifications[i])
		}
	}
	return out
}

func MarkNotifRead(id, userID uint) {
	mu.Lock()
	defer mu.Unlock()
	for _, n := range notifications {
		if n.ID == id && n.UserID == userID {
			n.IsRead = true
			return
		}
	}
}

func MarkAllNotifsRead(userID uint) {
	mu.Lock()
	defer mu.Unlock()
	for _, n := range notifications {
		if n.UserID == userID {
			n.IsRead = true
		}
	}
}

func AcceptedStudentsForCourse(courseID uint) []models.Application {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Application, 0)
	for _, a := range applications {
		if a.CourseID == courseID && a.Status == models.AppAccepted {
			out = append(out, enrichApplication(*a))
		}
	}
	return out
}

// --- Activity logs ---

func CreateActivityLog(l models.ActivityLog) {
	mu.Lock()
	defer mu.Unlock()
	l.ID = nextLogID
	nextLogID++
	l.CreatedAt = time.Now()
	activityLogs = append(activityLogs, &l)
}

func ListActivityLogs(userID, method string, offset, limit int) ([]models.ActivityLog, int64) {
	mu.RLock()
	defer mu.RUnlock()
	filtered := make([]*models.ActivityLog, 0)
	for i := len(activityLogs) - 1; i >= 0; i-- {
		l := activityLogs[i]
		if userID != "" {
			if l.UserID == nil || strconv.FormatUint(uint64(*l.UserID), 10) != userID {
				continue
			}
		}
		if method != "" && l.Method != method {
			continue
		}
		filtered = append(filtered, l)
	}
	total := int64(len(filtered))
	if offset > len(filtered) {
		return []models.ActivityLog{}, total
	}
	filtered = filtered[offset:]
	if limit < len(filtered) {
		filtered = filtered[:limit]
	}
	out := make([]models.ActivityLog, len(filtered))
	for i, l := range filtered {
		out[i] = *l
	}
	return out, total
}
