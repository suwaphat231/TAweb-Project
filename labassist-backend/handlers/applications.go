package handlers

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type ApplicationHandler struct{}

func NewApplicationHandler() *ApplicationHandler { return &ApplicationHandler{} }

func (h *ApplicationHandler) StudentDashboard(c *gin.Context) {
	studentID, _ := c.Get("user_id")

	type AppRow struct {
		models.Application
		StudentName string  `gorm:"column:student_name"`
		CourseCode  string  `gorm:"column:course_code"`
		CourseTitle string  `gorm:"column:course_title"`
	}

	var rows []AppRow
	database.DB.Table("applications a").
		Select("a.*, u.full_name AS student_name, c.code AS course_code, c.title AS course_title").
		Joins("JOIN users u ON u.id = a.student_id").
		Joins("JOIN courses c ON c.id = a.course_id").
		Where("a.student_id = ?", studentID).
		Order("a.applied_at DESC").
		Limit(10).Scan(&rows)

	apps := make([]models.Application, len(rows))
	for i, r := range rows {
		apps[i] = r.Application
		apps[i].StudentName = r.StudentName
		apps[i].CourseCode = r.CourseCode
		apps[i].CourseTitle = r.CourseTitle
	}

	var stats struct {
		Total    int64 `json:"total"`
		Accepted int64 `json:"accepted"`
		Rejected int64 `json:"rejected"`
	}
	database.DB.Model(&models.Application{}).Where("student_id = ?", studentID).Count(&stats.Total)
	database.DB.Model(&models.Application{}).Where("student_id = ? AND status = 'accepted'", studentID).Count(&stats.Accepted)
	database.DB.Model(&models.Application{}).Where("student_id = ? AND status = 'rejected'", studentID).Count(&stats.Rejected)

	c.JSON(http.StatusOK, gin.H{
		"applications": apps,
		"stats":        gin.H{"total": stats.Total, "accepted": stats.Accepted, "rejected": stats.Rejected},
	})
}

func (h *ApplicationHandler) MyApplications(c *gin.Context) {
	studentID, _ := c.Get("user_id")

	type AppRow struct {
		models.Application
		CourseCode  string `gorm:"column:course_code"`
		CourseTitle string `gorm:"column:course_title"`
		ReviewerName string `gorm:"column:reviewer_name"`
	}

	var rows []AppRow
	database.DB.Table("applications a").
		Select("a.*, c.code AS course_code, c.title AS course_title, r.full_name AS reviewer_name").
		Joins("JOIN courses c ON c.id = a.course_id").
		Joins("LEFT JOIN users r ON r.id = a.reviewed_by_id").
		Where("a.student_id = ?", studentID).
		Order("a.applied_at DESC").Scan(&rows)

	apps := make([]models.Application, len(rows))
	for i, r := range rows {
		apps[i] = r.Application
		apps[i].CourseCode = r.CourseCode
		apps[i].CourseTitle = r.CourseTitle
		apps[i].ReviewedByName = r.ReviewerName
	}
	c.JSON(http.StatusOK, apps)
}

func (h *ApplicationHandler) Apply(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body struct {
		CourseID    uint                `json:"course_id" binding:"required"`
		RoleApplied models.RoleApplied  `json:"role_applied" binding:"required"`
		Motivation  *string             `json:"motivation"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var course models.Course
	if err := database.DB.First(&course, body.CourseID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.Status == models.StatusClosed || course.Status == models.StatusDraft {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course is not accepting applications"})
		return
	}

	app := models.Application{
		StudentID:   studentID.(uint),
		CourseID:    body.CourseID,
		RoleApplied: body.RoleApplied,
		Status:      models.AppAccepted,
		Motivation:  body.Motivation,
	}
	if err := database.DB.Create(&app).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already applied"})
		return
	}

	// Update accepted count
	field := "ta_accepted"
	if body.RoleApplied == models.RoleLabBoy {
		field = "labboy_accepted"
	}
	database.DB.Model(&course).UpdateColumn(field, course.TAAccepted+1)

	c.JSON(http.StatusCreated, app)
}

func (h *ApplicationHandler) Withdraw(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	var app models.Application
	if err := database.DB.Where("id = ? AND student_id = ?", id, studentID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	database.DB.Model(&app).Update("status", models.AppWithdrawn)
	c.JSON(http.StatusOK, app)
}

func (h *ApplicationHandler) Review(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	var body struct {
		Status models.AppStatus `json:"status" binding:"required"`
		Note   *string          `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var app models.Application
	if err := database.DB.Preload("Course").First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	if role.(string) == "instructor" {
		var course models.Course
		database.DB.First(&course, app.CourseID)
		rid := reviewerID.(uint)
		if course.InstructorID != rid {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	now := time.Now()
	rid := reviewerID.(uint)
	database.DB.Model(&app).Updates(map[string]interface{}{
		"status":         body.Status,
		"reviewed_at":    now,
		"reviewed_by_id": rid,
		"note":           body.Note,
	})
	c.JSON(http.StatusOK, app)
}

func (h *ApplicationHandler) BulkReview(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	var body struct {
		ApplicationIDs []uint           `json:"application_ids" binding:"required"`
		Status         models.AppStatus `json:"status" binding:"required"`
		Note           *string          `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	rid := reviewerID.(uint)
	result := database.DB.Model(&models.Application{}).
		Where("id IN ?", body.ApplicationIDs).
		Updates(map[string]interface{}{
			"status": body.Status, "reviewed_at": now, "reviewed_by_id": rid, "note": body.Note,
		})
	c.JSON(http.StatusOK, gin.H{"updated": result.RowsAffected})
}

func (h *ApplicationHandler) GetProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var user models.User
	database.DB.First(&user, studentID)
	c.JSON(http.StatusOK, user)
}

func (h *ApplicationHandler) UpdateProfile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body map[string]interface{}
	c.ShouldBindJSON(&body)
	delete(body, "password_hash")
	delete(body, "role")
	var user models.User
	database.DB.First(&user, studentID)
	database.DB.Model(&user).Updates(body)
	c.JSON(http.StatusOK, user)
}
