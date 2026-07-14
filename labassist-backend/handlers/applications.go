package handlers

import (
	"labassist/models"
	"labassist/store"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ApplyRequest is the request body for submitting an application
type ApplyRequest struct {
	CourseID    uint               `json:"course_id" binding:"required" example:"1"`
	RoleApplied models.RoleApplied `json:"role_applied" binding:"required" example:"ta"`
	Motivation  *string            `json:"motivation,omitempty" example:"ต้องการช่วยสอนนักศึกษา"`
}

// ReviewRequest is the request body for reviewing an application
type ReviewRequest struct {
	Status models.AppStatus `json:"status" binding:"required" example:"accepted"`
	Note   *string          `json:"note,omitempty" example:"ผ่านการคัดเลือก"`
}

// BulkReviewRequest is the request body for bulk reviewing applications
type BulkReviewRequest struct {
	ApplicationIDs []uint           `json:"application_ids" binding:"required"`
	Status         models.AppStatus `json:"status" binding:"required" example:"accepted"`
	Note           *string          `json:"note,omitempty"`
}

// UpdateProfileRequest is the request body for updating student profile
type UpdateProfileRequest struct {
	FullName *string `json:"full_name,omitempty" example:"สมชาย ใจดี"`
	Year     *int    `json:"year,omitempty" example:"3"`
	Faculty  *string `json:"faculty,omitempty" example:"วิทยาการคอมพิวเตอร์"`
}

type ApplicationHandler struct{}

func NewApplicationHandler() *ApplicationHandler { return &ApplicationHandler{} }

// StudentDashboard godoc
// @Summary      หน้าหลักนักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  StudentDashboardResponse
// @Router       /student/dashboard [get]
func (h *ApplicationHandler) StudentDashboard(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	recentApps := store.RecentStudentApplications(sid, 5)
	recentCourses := store.RecentOpenCourses(3)
	openCount := store.CountOpenCourses()
	appliedCount := store.CountAppliedByStudent(sid)

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
func (h *ApplicationHandler) MyApplications(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	apps := store.StudentApplications(studentID.(uint))
	c.JSON(http.StatusOK, apps)
}

// Apply godoc
// @Summary      สมัครเป็น TA หรือ Lab Boy
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ApplyRequest  true  "ข้อมูลการสมัคร"
// @Success      201   {object}  models.Application
// @Failure      400   {object}  ErrorResponse
// @Failure      404   {object}  ErrorResponse
// @Failure      409   {object}  ErrorResponse
// @Router       /student/applications [post]
func (h *ApplicationHandler) Apply(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body ApplyRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	course, ok := store.CourseByID(body.CourseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.Status == models.StatusClosed || course.Status == models.StatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course is not accepting applications"})
		return
	}

	// Check slot availability
	if body.RoleApplied == models.RoleTA && course.TAAccepted >= course.TASlots {
		c.JSON(http.StatusBadRequest, gin.H{"error": "TA slots are full"})
		return
	}
	if body.RoleApplied == models.RoleLabBoy && course.LabBoyAccepted >= course.LabBoySlots {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lab Boy slots are full"})
		return
	}

	app, err := store.CreateApplication(models.Application{
		StudentID:   studentID.(uint),
		CourseID:    body.CourseID,
		RoleApplied: body.RoleApplied,
		Status:      models.AppAccepted,
		Motivation:  body.Motivation,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already applied"})
		return
	}

	store.AdjustCourseAccepted(body.CourseID, body.RoleApplied, 1)

	c.JSON(http.StatusCreated, app)
}

// Withdraw godoc
// @Summary      ถอนใบสมัคร
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {object}  models.Application
// @Failure      400  {object}  ErrorResponse
// @Failure      404  {object}  ErrorResponse
// @Router       /student/applications/{id}/withdraw [put]
func (h *ApplicationHandler) Withdraw(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	app, ok := store.ApplicationByIDForStudent(uint(id), studentID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	if app.Status == models.AppWithdrawn {
		c.JSON(http.StatusBadRequest, gin.H{"error": "already withdrawn"})
		return
	}

	prevStatus := app.Status
	updated, _ := store.UpdateApplication(uint(id), func(a *models.Application) {
		a.Status = models.AppWithdrawn
	})

	// Decrement slot count if was accepted
	if prevStatus == models.AppAccepted {
		store.AdjustCourseAccepted(app.CourseID, app.RoleApplied, -1)
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
func (h *ApplicationHandler) GetProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	user, _ := store.UserByID(studentID.(uint))
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
func (h *ApplicationHandler) UpdateProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body UpdateProfileRequest
	c.ShouldBindJSON(&body)

	updated, _ := store.UpdateUser(studentID.(uint), func(u *models.User) {
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.Year != nil {
			y := int8(*body.Year)
			u.Year = &y
		}
		if body.Faculty != nil {
			u.Faculty = body.Faculty
		}
	})
	c.JSON(http.StatusOK, updated)
}

// Review godoc
// @Summary      ตรวจสอบใบสมัคร (อาจารย์/สตาฟ/แอดมิน)
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int            true  "Application ID"
// @Param        body  body  ReviewRequest  true  "ผลการตรวจสอบ"
// @Success      200   {object}  models.Application
// @Failure      400   {object}  ErrorResponse
// @Failure      403   {object}  ErrorResponse
// @Failure      404   {object}  ErrorResponse
// @Router       /instructor/applications/{id}/review [put]
func (h *ApplicationHandler) Review(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	var body ReviewRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	app, ok := store.ApplicationByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	rid := reviewerID.(uint)
	if role.(string) == "instructor" {
		course, _ := store.CourseByID(app.CourseID)
		if course.InstructorID != rid {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	prevStatus := app.Status

	if body.Status == models.AppAccepted && prevStatus != models.AppAccepted {
		course, _ := store.CourseByID(app.CourseID)
		if app.RoleApplied == models.RoleTA && course.TAAccepted >= course.TASlots {
			c.JSON(http.StatusBadRequest, gin.H{"error": "TA slots are full"})
			return
		}
		if app.RoleApplied == models.RoleLabBoy && course.LabBoyAccepted >= course.LabBoySlots {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Lab Boy slots are full"})
			return
		}
	}

	now := time.Now()
	updated, _ := store.UpdateApplication(uint(id), func(a *models.Application) {
		a.Status = body.Status
		a.ReviewedAt = &now
		a.ReviewedByID = &rid
		a.Note = body.Note
	})

	// Manage accepted count
	if body.Status == models.AppAccepted && prevStatus != models.AppAccepted {
		store.AdjustCourseAccepted(app.CourseID, app.RoleApplied, 1)
	} else if prevStatus == models.AppAccepted && body.Status != models.AppAccepted {
		store.AdjustCourseAccepted(app.CourseID, app.RoleApplied, -1)
	}

	c.JSON(http.StatusOK, updated)
}

// BulkReview godoc
// @Summary      ตรวจสอบใบสมัครแบบกลุ่ม
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      BulkReviewRequest  true  "รายการใบสมัครและผลการตรวจสอบ"
// @Success      200   {object}  BulkReviewResponse
// @Failure      400   {object}  ErrorResponse
// @Router       /instructor/applications/bulk-review [put]
func (h *ApplicationHandler) BulkReview(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	var body BulkReviewRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	rid := reviewerID.(uint)
	updated := store.BulkUpdateApplications(body.ApplicationIDs, func(a *models.Application) {
		a.Status = body.Status
		a.ReviewedAt = &now
		a.ReviewedByID = &rid
		a.Note = body.Note
	})
	c.JSON(http.StatusOK, gin.H{"updated": updated})
}
