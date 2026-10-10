package student

import (
	"errors"
	"fmt"
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ApplyRequest is the request body for submitting an application
type ApplyRequest struct {
	CourseID    uint               `json:"course_id" binding:"required" example:"1"`
	RoleApplied models.RoleApplied `json:"role_applied" binding:"required,oneof=labboy" example:"labboy"`
	// Grade is the letter grade the student got when they previously took
	// this course, so the instructor can check it against the posting's
	// minimum-grade requirement.
	Grade *string `json:"grade,omitempty" binding:"omitempty,oneof=A B+ B C+ C D+ D F" example:"A"`
}

type WithdrawRequest struct {
	Reason string `json:"reason" binding:"required" example:"มีตารางเรียนชนกับเวลาปฏิบัติงาน"`
}

// UpdateProfileRequest is the request body for updating student profile
type UpdateProfileRequest struct {
	FullName  *string `json:"full_name,omitempty" example:"สมชาย ใจดี"`
	StudentID *string `json:"student_id,omitempty" example:"640710112"`
	Year      *int    `json:"year,omitempty" binding:"omitempty,min=0,max=4" example:"3"`
	Faculty   *string `json:"faculty,omitempty" example:"วิทยาการคอมพิวเตอร์"`
	// Username is the login name used by /auth/login. Passwords are changed
	// through /auth/password/* instead.
	Username *string `json:"username,omitempty" example:"somchai"`
}

// StudentDashboard godoc
// @Summary      หน้าหลักนักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  handlers.StudentDashboardResponse
// @Router       /student/dashboard [get]
func (h *Handler) StudentDashboard(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	recentApps := database.RecentStudentApplications(sid, 5)
	recentCourses := enrichConflicts(sid, database.RecentOpenCourses(3))
	openCount := database.CountOpenCourses()
	appliedCount := database.CountAppliedByStudent(sid)

	c.JSON(http.StatusOK, gin.H{
		"recent_applications": recentApps,
		"recent_courses":      recentCourses,
		"stats":               gin.H{"open_courses": openCount, "applied": appliedCount},
	})
}

// MyApplications godoc
// @Summary      รายการใบสมัครของนักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.Application
// @Router       /student/applications [get]
func (h *Handler) MyApplications(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	apps := database.StudentApplications(studentID.(uint))
	c.JSON(http.StatusOK, apps)
}

// Apply godoc
// @Summary      สมัครเป็น Lab Boy
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ApplyRequest  true  "ข้อมูลการสมัคร"
// @Success      201   {object}  models.Application
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /student/applications [post]
func (h *Handler) Apply(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body ApplyRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	course, ok := database.CourseByID(body.CourseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.Status != models.StatusOpen && course.Status != models.StatusClosingSoon {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course is not accepting applications"})
		return
	}
	if !database.HasConfirmedTermSchedule(studentID.(uint)) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             "กรุณากรอกและบันทึกตารางเรียนในหน้าโปรไฟล์ก่อนสมัคร Lab Boy",
			"schedule_required": true,
		})
		return
	}

	// Block if the student's confirmed term schedule conflicts with this course.
	// Falls back to any set TermSchedule when the course-specific term has no
	// entry, catching the common case of a schedule saved under the wrong semester.
	ts := database.BestTermSchedule(studentID.(uint), course.Semester, course.AcademicYear)
	if day := database.ConflictingDay(course.Schedule, ts); day != "" {
		c.JSON(http.StatusConflict, gin.H{
			"error":             "ตารางเรียนของคุณมีวิชาที่เรียนใน" + day + " ซึ่งตรงกับเวลาของวิชานี้ กรุณาตรวจสอบตารางเรียนของคุณในหน้าโปรไฟล์",
			"schedule_conflict": true,
			"conflict_day":      day,
		})
		return
	}

	app, err := database.CreateApplication(models.Application{
		StudentID:   studentID.(uint),
		CourseID:    body.CourseID,
		RoleApplied: body.RoleApplied,
		Status:      models.AppPending,
		Grade:       body.Grade,
	})
	if err != nil {
		if err == database.ErrConflict {
			c.JSON(http.StatusConflict, gin.H{"error": "already applied"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save application"})
		}
		return
	}

	// Notify the instructor account linked to this course.
	if applicant, ok := database.UserByID(studentID.(uint)); ok {
		notifs := make([]models.Notification, 0, 1)
		for _, ins := range database.InstructorsForCourse(course) {
			notifs = append(notifs, models.Notification{
				UserID:   ins.ID,
				CourseID: &body.CourseID,
				Title:    "มีผู้สมัครใหม่",
				Body:     fmt.Sprintf("นักศึกษา %s สมัครวิชา %s (%s)", applicant.FullName, course.Title, course.Code),
			})
		}
		database.CreateNotifications(notifs)
	}

	c.JSON(http.StatusCreated, app)
}

// Withdraw godoc
// @Summary      ถอนใบสมัคร
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Param        body  body  WithdrawRequest  true  "เหตุผลที่ถอนใบสมัคร"
// @Success      200  {object}  models.Application
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/withdraw [put]
func (h *Handler) Withdraw(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	var body WithdrawRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่ถอนใบสมัคร"})
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่ถอนใบสมัคร"})
		return
	}
	if len([]rune(reason)) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เหตุผลต้องมีความยาวไม่เกิน 1000 ตัวอักษร"})
		return
	}

	updated, err := database.WithdrawApplication(uint(id), studentID.(uint), reason)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
			return
		}
		if errors.Is(err, database.ErrAlreadyWithdrawn) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "already withdrawn"})
			return
		}
		if errors.Is(err, database.ErrWithdrawalClosed) {
			c.JSON(http.StatusForbidden, gin.H{"error": "ไม่สามารถถอนใบสมัครได้หลังจากอาจารย์ปิดรับสมัครแล้ว"})
			return
		}
		if errors.Is(err, database.ErrWithdrawAlreadyRequested) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ส่งคำขอถอนไปแล้ว กรุณารออาจารย์พิจารณา"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save application"})
		return
	}

	// An accepted Lab Boy's withdrawal waits for the instructor's approval.
	if updated.WithdrawRequested {
		if course, ok := database.CourseByID(updated.CourseID); ok {
			if applicant, ok := database.UserByID(studentID.(uint)); ok {
				notifs := make([]models.Notification, 0, 1)
				for _, ins := range database.InstructorsForCourse(course) {
					notifs = append(notifs, models.Notification{
						UserID:   ins.ID,
						CourseID: &course.ID,
						Title:    "มีคำขอถอนจาก Lab Boy",
						Body:     fmt.Sprintf("นักศึกษา %s ขอถอนจากการเป็น Lab Boy วิชา %s (%s) เหตุผล: %s", applicant.FullName, course.Title, course.Code, reason),
					})
				}
				database.CreateNotifications(notifs)
			}
		}
	}

	c.JSON(http.StatusOK, updated)
}

// ApplicationHistory godoc
// @Summary      ประวัติการสมัครรอบก่อนหน้า
// @Description  คืนรายการ snapshot ของใบสมัครที่ถูกปฏิเสธหรือถอนไปในรอบก่อน ก่อนที่นักศึกษาจะสมัครใหม่
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {array}   models.ApplicationHistory
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/history [get]
func (h *Handler) ApplicationHistory(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	history := database.ApplicationHistoryForApplication(uint(id))
	c.JSON(http.StatusOK, history)
}

// GetProfile godoc
// @Summary      ดูโปรไฟล์นักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.User
// @Router       /student/profile [get]
func (h *Handler) GetProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	user, _ := database.UserByID(studentID.(uint))
	c.JSON(http.StatusOK, user)
}

// UpdateProfile godoc
// @Summary      แก้ไขโปรไฟล์นักศึกษา
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      UpdateProfileRequest  true  "ข้อมูลโปรไฟล์ที่ต้องการแก้ไข"
// @Success      200   {object}  models.User
// @Router       /student/profile [put]
func (h *Handler) UpdateProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body UpdateProfileRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.FullName != nil {
		trimmed := strings.TrimSpace(*body.FullName)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อ-นามสกุล"})
			return
		}
		body.FullName = &trimmed
	}

	if body.StudentID != nil {
		trimmed := strings.TrimSpace(*body.StudentID)
		body.StudentID = &trimmed
		if trimmed != "" {
			if owner, ok := database.UserByStudentID(trimmed); ok && owner.ID != studentID.(uint) {
				c.JSON(http.StatusConflict, gin.H{"error": "รหัสนักศึกษานี้ถูกใช้งานแล้ว"})
				return
			}
		}
	}

	var username *string
	if body.Username != nil {
		trimmed := strings.TrimSpace(*body.Username)
		if trimmed != "" {
			if other, found := database.UserByUsername(trimmed); found && other.ID != studentID.(uint) {
				c.JSON(http.StatusConflict, gin.H{"error": "ชื่อผู้ใช้นี้ถูกใช้แล้ว"})
				return
			}
			username = &trimmed
		}
	}

	updated, ok := database.UpdateUser(studentID.(uint), func(u *models.User) {
		if username != nil {
			u.Username = username
		}
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.StudentID != nil {
			if *body.StudentID == "" {
				u.StudentID = nil
			} else {
				u.StudentID = body.StudentID
			}
		}
		if body.Year != nil {
			y := int8(*body.Year)
			u.Year = &y
		}
		if body.Faculty != nil {
			u.Faculty = body.Faculty
		}
	})
	if !ok {
		c.JSON(http.StatusConflict, gin.H{"error": "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่"})
		return
	}
	c.JSON(http.StatusOK, updated)
}
