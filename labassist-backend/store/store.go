package store

import (
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"labassist/models"

	"gorm.io/gorm"
)

var ErrConflict = errors.New("conflict")

var db *gorm.DB

// Init sets the database connection and runs the initial seed.
func Init(d *gorm.DB) {
	db = d
	Seed()
}

func isDuplicateError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "Duplicate entry")
}

// enrichApp populates computed fields from preloaded associations.
func enrichApp(a *models.Application) {
	a.StudentName = a.Student.FullName
	if a.Student.StudentID != nil {
		a.StudentCode = *a.Student.StudentID
	}
	if a.Student.GPA != nil {
		a.StudentGPA = *a.Student.GPA
	}
	a.StudentEmail = a.Student.Email
	if a.Student.Faculty != nil {
		a.StudentFaculty = *a.Student.Faculty
	}
	if a.Student.Year != nil {
		a.StudentYear = int(*a.Student.Year)
	}
	a.CourseCode = a.Course.Code
	a.CourseTitle = a.Course.Title
	if a.ReviewedBy != nil {
		a.ReviewedByName = a.ReviewedBy.FullName
	}
}

// --- Users ---

func UserByID(id uint) (models.User, bool) {
	var u models.User
	if err := db.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByUsername(username string) (models.User, bool) {
	var u models.User
	if err := db.Where("username = ?", username).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByGoogleSub(sub string) (models.User, bool) {
	var u models.User
	if err := db.Where("google_sub = ?", sub).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByEmail(email string) (models.User, bool) {
	var u models.User
	if err := db.Where("email = ?", email).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func ListUsers(role, search string, limit, offset int) []models.User {
	var users []models.User
	q := db.Order("id DESC")
	if role != "" {
		q = q.Where("role = ?", role)
	}
	if search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?", like, like)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	q.Offset(offset).Find(&users)
	return users
}

func CreateUser(u models.User) (models.User, error) {
	u.IsActive = true
	if err := db.Create(&u).Error; err != nil {
		if isDuplicateError(err) {
			return models.User{}, ErrConflict
		}
		return models.User{}, err
	}
	return u, nil
}

func UpdateUser(id uint, fn func(u *models.User)) (models.User, bool) {
	var u models.User
	if err := db.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	fn(&u)
	db.Save(&u)
	return u, true
}

func CountUsers() int64 {
	var count int64
	db.Model(&models.User{}).Count(&count)
	return count
}

func CountUsersByRole(role models.UserRole) int64 {
	var count int64
	db.Model(&models.User{}).Where("role = ?", role).Count(&count)
	return count
}

// --- Courses ---

func ListCourses(status, q string, hasLab *bool) []models.Course {
	var courses []models.Course
	query := db.Order("id DESC").Preload("Instructor")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if hasLab != nil {
		query = query.Where("has_lab = ?", *hasLab)
	}
	if q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(code) LIKE ? OR LOWER(title) LIKE ?", like, like)
	}
	query.Find(&courses)
	for i := range courses {
		courses[i].InstructorName = courses[i].Instructor.FullName
	}
	return courses
}

func CourseByID(id uint) (models.Course, bool) {
	var c models.Course
	if err := db.Preload("Instructor").First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	c.InstructorName = c.Instructor.FullName
	return c, true
}

func InstructorCourses(instructorID uint, isAdmin bool, hasLab *bool) []models.Course {
	var courses []models.Course
	q := db.Order("id DESC").Preload("Instructor")
	if !isAdmin {
		q = q.Where("instructor_id = ?", instructorID)
	}
	if hasLab != nil {
		q = q.Where("has_lab = ?", *hasLab)
	}
	q.Find(&courses)
	for i := range courses {
		courses[i].InstructorName = courses[i].Instructor.FullName
		var count int64
		db.Model(&models.Application{}).
			Where("course_id = ? AND status != ?", courses[i].ID, models.AppWithdrawn).
			Count(&count)
		courses[i].ApplicantCount = int(count)
	}
	return courses
}

func CreateCourse(c models.Course) models.Course {
	db.Create(&c)
	if u, ok := UserByID(c.InstructorID); ok {
		c.InstructorName = u.FullName
	}
	return c
}

func UpdateCourse(id uint, fn func(c *models.Course)) (models.Course, bool) {
	var c models.Course
	if err := db.First(&c, id).Error; err != nil {
		return models.Course{}, false
	}
	fn(&c)
	db.Save(&c)
	if u, ok := UserByID(c.InstructorID); ok {
		c.InstructorName = u.FullName
	}
	return c, true
}

func AdjustCourseAccepted(courseID uint, role models.RoleApplied, delta int) {
	if role == models.RoleTA {
		db.Model(&models.Course{}).Where("id = ?", courseID).
			UpdateColumn("ta_accepted", gorm.Expr("ta_accepted + ?", delta))
	} else {
		db.Model(&models.Course{}).Where("id = ?", courseID).
			UpdateColumn("labboy_accepted", gorm.Expr("labboy_accepted + ?", delta))
	}
}

func CountCourses() int64 {
	var count int64
	db.Model(&models.Course{}).Count(&count)
	return count
}

func CountOpenCourses() int64 {
	var count int64
	db.Model(&models.Course{}).
		Where("status IN ?", []string{string(models.StatusOpen), string(models.StatusClosingSoon)}).
		Count(&count)
	return count
}

func RecentOpenCourses(limit int) []models.Course {
	var courses []models.Course
	db.Where("status IN ?", []string{string(models.StatusOpen), string(models.StatusClosingSoon)}).
		Order("id DESC").Limit(limit).Preload("Instructor").Find(&courses)
	for i := range courses {
		courses[i].InstructorName = courses[i].Instructor.FullName
	}
	return courses
}

// --- Applications ---

func appsQuery() *gorm.DB {
	return db.Preload("Student").Preload("Course").Preload("ReviewedBy")
}

func ApplicantsForCourse(courseID uint, roleFilter, statusFilter, search string) []models.Application {
	var apps []models.Application
	q := appsQuery().Where("applications.course_id = ?", courseID)
	if roleFilter != "" {
		q = q.Where("applications.role_applied = ?", roleFilter)
	}
	if statusFilter != "" {
		q = q.Where("applications.status = ?", statusFilter)
	}
	q.Find(&apps)

	out := make([]models.Application, 0, len(apps))
	for i := range apps {
		enrichApp(&apps[i])
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(apps[i].StudentName), s) &&
				!strings.Contains(strings.ToLower(apps[i].StudentCode), s) {
				continue
			}
		}
		out = append(out, apps[i])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StudentGPA > out[j].StudentGPA })
	return out
}

func StudentApplications(studentID uint) []models.Application {
	var apps []models.Application
	appsQuery().Where("applications.student_id = ?", studentID).Order("applications.applied_at DESC").Find(&apps)
	for i := range apps {
		enrichApp(&apps[i])
	}
	return apps
}

func RecentStudentApplications(studentID uint, limit int) []models.Application {
	all := StudentApplications(studentID)
	if len(all) > limit {
		return all[:limit]
	}
	return all
}

func CountAppliedByStudent(studentID uint) int64 {
	var count int64
	db.Model(&models.Application{}).
		Where("student_id = ? AND status != ?", studentID, models.AppWithdrawn).
		Count(&count)
	return count
}

func ApplicationByID(id uint) (models.Application, bool) {
	var a models.Application
	if err := appsQuery().First(&a, id).Error; err != nil {
		return models.Application{}, false
	}
	enrichApp(&a)
	return a, true
}

func ApplicationByIDForStudent(id, studentID uint) (models.Application, bool) {
	var a models.Application
	if err := appsQuery().Where("applications.id = ? AND applications.student_id = ?", id, studentID).First(&a).Error; err != nil {
		return models.Application{}, false
	}
	enrichApp(&a)
	return a, true
}

func CreateApplication(a models.Application) (models.Application, error) {
	if a.AppliedAt.IsZero() {
		a.AppliedAt = time.Now()
	}
	if err := db.Create(&a).Error; err != nil {
		if isDuplicateError(err) {
			return models.Application{}, ErrConflict
		}
		return models.Application{}, err
	}
	result, _ := ApplicationByID(a.ID)
	return result, nil
}

func UpdateApplication(id uint, fn func(a *models.Application)) (models.Application, bool) {
	var a models.Application
	if err := db.First(&a, id).Error; err != nil {
		return models.Application{}, false
	}
	fn(&a)
	db.Save(&a)
	result, _ := ApplicationByID(a.ID)
	return result, true
}

func BulkUpdateApplications(ids []uint, fn func(a *models.Application)) int64 {
	if len(ids) == 0 {
		return 0
	}
	var apps []models.Application
	db.Where("id IN ?", ids).Find(&apps)
	var n int64
	for i := range apps {
		fn(&apps[i])
		db.Save(&apps[i])
		n++
	}
	return n
}

func CountApplications() int64 {
	var count int64
	db.Model(&models.Application{}).Count(&count)
	return count
}

func CountApplicationsByStatus(status models.AppStatus) int64 {
	var count int64
	db.Model(&models.Application{}).Where("status = ?", status).Count(&count)
	return count
}

// --- Notifications ---

func CreateNotifications(notifs []models.Notification) int {
	if len(notifs) == 0 {
		return 0
	}
	db.Create(&notifs)
	return len(notifs)
}

func UserNotifications(userID uint) []models.Notification {
	var notifs []models.Notification
	db.Where("user_id = ?", userID).Order("id DESC").Find(&notifs)
	return notifs
}

func MarkNotifRead(id, userID uint) {
	db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true)
}

func MarkAllNotifsRead(userID uint) {
	db.Model(&models.Notification{}).
		Where("user_id = ?", userID).
		Update("is_read", true)
}

func AcceptedStudentsForCourse(courseID uint) []models.Application {
	var apps []models.Application
	appsQuery().Where("applications.course_id = ? AND applications.status = ?", courseID, models.AppAccepted).Find(&apps)
	for i := range apps {
		enrichApp(&apps[i])
	}
	return apps
}

// --- Activity logs ---

func CreateActivityLog(l models.ActivityLog) {
	db.Create(&l)
}

func ListActivityLogs(userID, method string, offset, limit int) ([]models.ActivityLog, int64) {
	base := db.Model(&models.ActivityLog{})
	if userID != "" {
		if uid, err := strconv.ParseUint(userID, 10, 64); err == nil {
			base = base.Where("user_id = ?", uid)
		}
	}
	if method != "" {
		base = base.Where("method = ?", method)
	}
	var total int64
	base.Count(&total)
	var logs []models.ActivityLog
	base.Order("id DESC").Offset(offset).Limit(limit).Find(&logs)
	return logs, total
}
