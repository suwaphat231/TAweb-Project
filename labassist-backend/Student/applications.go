package student

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ApplyRequest is the request body for submitting an application
type ApplyRequest struct {
	CourseID    uint               `json:"course_id" binding:"required" example:"1"`
	RoleApplied models.RoleApplied `json:"role_applied" binding:"required,oneof=labboy" example:"labboy"`
	// Grade is the letter grade the student got when they previously took
	// this course, so the instructor can check it against the posting's
	// minimum-grade requirement.
	Grade *string `json:"grade,omitempty" example:"A"`
}

// UpdateProfileRequest is the request body for updating student profile
type UpdateProfileRequest struct {
	FullName  *string `json:"full_name,omitempty" example:"สมชาย ใจดี"`
	StudentID *string `json:"student_id,omitempty" example:"640710112"`
	Year      *int    `json:"year,omitempty" example:"3"`
	Faculty   *string `json:"faculty,omitempty" example:"วิทยาการคอมพิวเตอร์"`
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
	recentCourses := database.RecentOpenCourses(3)
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
	if course.Status == models.StatusClosed || course.Status == models.StatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course is not accepting applications"})
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
		c.JSON(http.StatusConflict, gin.H{"error": "already applied"})
		return
	}

	c.JSON(http.StatusCreated, app)
}

// Withdraw godoc
// @Summary      ถอนใบสมัคร
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {object}  models.Application
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/withdraw [put]
func (h *Handler) Withdraw(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	app, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	if app.Status == models.AppWithdrawn {
		c.JSON(http.StatusBadRequest, gin.H{"error": "already withdrawn"})
		return
	}

	prevStatus := app.Status
	updated, _ := database.UpdateApplication(uint(id), func(a *models.Application) {
		a.Status = models.AppWithdrawn
	})

	// Decrement slot count if was accepted
	if prevStatus == models.AppAccepted {
		database.AdjustCourseAccepted(app.CourseID, app.RoleApplied, -1)
	}

	c.JSON(http.StatusOK, updated)
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
	c.ShouldBindJSON(&body)

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

	updated, ok := database.UpdateUser(studentID.(uint), func(u *models.User) {
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
