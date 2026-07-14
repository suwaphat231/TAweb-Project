// Package store is an in-memory mock data layer that stands in for the
// PostgreSQL database while the database team builds out the real one.
// All state lives in package-level slices guarded by a single mutex and is
// seeded on startup; nothing is persisted across restarts.
package store

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
	users        []*models.User
	courses      []*models.Course
	applications []*models.Application
	activityLogs []*models.ActivityLog

	nextUserID   uint = 1
	nextCourseID uint = 1
	nextAppID    uint = 1
	nextLogID    uint = 1
)

func init() {
	seed()
}

// --- internal helpers (caller must hold mu) ---

func findUserByIDLocked(id uint) *models.User {
	for _, u := range users {
		if u.ID == id {
			return u
		}
	}
	return nil
}

func findCourseByIDLocked(id uint) *models.Course {
	for _, c := range courses {
		if c.ID == id {
			return c
		}
	}
	return nil
}

func findAppByIDLocked(id uint) *models.Application {
	for _, a := range applications {
		if a.ID == id {
			return a
		}
	}
	return nil
}

func courseWithInstructor(c models.Course) models.Course {
	if u := findUserByIDLocked(c.InstructorID); u != nil {
		c.InstructorName = u.FullName
	}
	return c
}

func countNonWithdrawnApplicationsLocked(courseID uint) int {
	n := 0
	for _, a := range applications {
		if a.CourseID == courseID && a.Status != models.AppWithdrawn {
			n++
		}
	}
	return n
}

func enrichApplication(a models.Application) models.Application {
	if u := findUserByIDLocked(a.StudentID); u != nil {
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
	if c := findCourseByIDLocked(a.CourseID); c != nil {
		a.CourseCode = c.Code
		a.CourseTitle = c.Title
	}
	if a.ReviewedByID != nil {
		if u := findUserByIDLocked(*a.ReviewedByID); u != nil {
			a.ReviewedByName = u.FullName
		}
	}
	return a
}

// --- Users ---

func UserByID(id uint) (models.User, bool) {
	mu.RLock()
	defer mu.RUnlock()
	u := findUserByIDLocked(id)
	if u == nil {
		return models.User{}, false
	}
	return *u, true
}

func UserByUsername(username string) (models.User, bool) {
	mu.RLock()
	defer mu.RUnlock()
	for _, u := range users {
		if u.Username != nil && *u.Username == username {
			return *u, true
		}
	}
	return models.User{}, false
}

func UserByGoogleSub(sub string) (models.User, bool) {
	mu.RLock()
	defer mu.RUnlock()
	for _, u := range users {
		if u.GoogleSub != nil && *u.GoogleSub == sub {
			return *u, true
		}
	}
	return models.User{}, false
}

func UserByEmail(email string) (models.User, bool) {
	mu.RLock()
	defer mu.RUnlock()
	for _, u := range users {
		if u.Email == email {
			return *u, true
		}
	}
	return models.User{}, false
}

func ListUsers(role, search string, limit, offset int) []models.User {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.User, 0)
	for i := len(users) - 1; i >= 0; i-- {
		u := users[i]
		if role != "" && string(u.Role) != role {
			continue
		}
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(u.FullName), s) && !strings.Contains(strings.ToLower(u.Email), s) {
				continue
			}
		}
		out = append(out, *u)
	}
	if offset > len(out) {
		return []models.User{}
	}
	out = out[offset:]
	if limit < len(out) {
		out = out[:limit]
	}
	return out
}

func CreateUser(u models.User) (models.User, error) {
	mu.Lock()
	defer mu.Unlock()
	if u.Username != nil {
		for _, existing := range users {
			if existing.Username != nil && *existing.Username == *u.Username {
				return models.User{}, ErrConflict
			}
		}
	}
	for _, existing := range users {
		if existing.Email == u.Email {
			return models.User{}, ErrConflict
		}
	}
	u.ID = nextUserID
	nextUserID++
	u.IsActive = true
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	users = append(users, &u)
	return u, nil
}

func UpdateUser(id uint, fn func(u *models.User)) (models.User, bool) {
	mu.Lock()
	defer mu.Unlock()
	u := findUserByIDLocked(id)
	if u == nil {
		return models.User{}, false
	}
	fn(u)
	u.UpdatedAt = time.Now()
	return *u, true
}

func CountUsers() int64 {
	mu.RLock()
	defer mu.RUnlock()
	return int64(len(users))
}

func CountUsersByRole(role models.UserRole) int64 {
	mu.RLock()
	defer mu.RUnlock()
	var n int64
	for _, u := range users {
		if u.Role == role {
			n++
		}
	}
	return n
}

// --- Courses ---

func ListCourses(status, q string) []models.Course {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Course, 0)
	for i := len(courses) - 1; i >= 0; i-- {
		c := courses[i]
		if status != "" && string(c.Status) != status {
			continue
		}
		if q != "" {
			ql := strings.ToLower(q)
			if !strings.Contains(strings.ToLower(c.Code), ql) && !strings.Contains(strings.ToLower(c.Title), ql) {
				continue
			}
		}
		out = append(out, courseWithInstructor(*c))
	}
	return out
}

func CourseByID(id uint) (models.Course, bool) {
	mu.RLock()
	defer mu.RUnlock()
	c := findCourseByIDLocked(id)
	if c == nil {
		return models.Course{}, false
	}
	return courseWithInstructor(*c), true
}

func InstructorCourses(instructorID uint, isAdmin bool) []models.Course {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Course, 0)
	for i := len(courses) - 1; i >= 0; i-- {
		c := courses[i]
		if !isAdmin && c.InstructorID != instructorID {
			continue
		}
		cc := courseWithInstructor(*c)
		cc.ApplicantCount = countNonWithdrawnApplicationsLocked(c.ID)
		out = append(out, cc)
	}
	return out
}

func CreateCourse(c models.Course) models.Course {
	mu.Lock()
	defer mu.Unlock()
	c.ID = nextCourseID
	nextCourseID++
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now
	courses = append(courses, &c)
	return courseWithInstructor(c)
}

func UpdateCourse(id uint, fn func(c *models.Course)) (models.Course, bool) {
	mu.Lock()
	defer mu.Unlock()
	c := findCourseByIDLocked(id)
	if c == nil {
		return models.Course{}, false
	}
	fn(c)
	c.UpdatedAt = time.Now()
	return courseWithInstructor(*c), true
}

func AdjustCourseAccepted(courseID uint, role models.RoleApplied, delta int) {
	mu.Lock()
	defer mu.Unlock()
	c := findCourseByIDLocked(courseID)
	if c == nil {
		return
	}
	if role == models.RoleTA {
		c.TAAccepted += delta
	} else {
		c.LabBoyAccepted += delta
	}
	c.UpdatedAt = time.Now()
}

func CountCourses() int64 {
	mu.RLock()
	defer mu.RUnlock()
	return int64(len(courses))
}

func CountOpenCourses() int64 {
	mu.RLock()
	defer mu.RUnlock()
	var n int64
	for _, c := range courses {
		if c.Status == models.StatusOpen || c.Status == models.StatusClosingSoon {
			n++
		}
	}
	return n
}

func RecentOpenCourses(limit int) []models.Course {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]models.Course, 0)
	for i := len(courses) - 1; i >= 0 && len(out) < limit; i-- {
		c := courses[i]
		if c.Status == models.StatusOpen || c.Status == models.StatusClosingSoon {
			out = append(out, courseWithInstructor(*c))
		}
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
