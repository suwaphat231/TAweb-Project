package handlers

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func (h *AdminHandler) Logs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	var total int64
	q := database.DB.Model(&models.ActivityLog{})
	if userID := c.Query("user_id"); userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if method := c.Query("method"); method != "" {
		q = q.Where("method = ?", method)
	}
	q.Count(&total)

	var logs []models.ActivityLog
	q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"data":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

type AdminHandler struct{}

func NewAdminHandler() *AdminHandler { return &AdminHandler{} }

func (h *AdminHandler) Stats(c *gin.Context) {
	var stats struct {
		TotalUsers         int64 `json:"total_users"`
		TotalStudents      int64 `json:"total_students"`
		TotalInstructors   int64 `json:"total_instructors"`
		TotalCourses       int64 `json:"total_courses"`
		OpenCourses        int64 `json:"open_courses"`
		TotalApplications  int64 `json:"total_applications"`
		AcceptedApplications int64 `json:"accepted_applications"`
	}
	database.DB.Model(&models.User{}).Count(&stats.TotalUsers)
	database.DB.Model(&models.User{}).Where("role = 'student'").Count(&stats.TotalStudents)
	database.DB.Model(&models.User{}).Where("role = 'instructor'").Count(&stats.TotalInstructors)
	database.DB.Model(&models.Course{}).Count(&stats.TotalCourses)
	database.DB.Model(&models.Course{}).Where("status = 'open' OR status = 'closing_soon'").Count(&stats.OpenCourses)
	database.DB.Model(&models.Application{}).Count(&stats.TotalApplications)
	database.DB.Model(&models.Application{}).Where("status = 'accepted'").Count(&stats.AcceptedApplications)
	c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) Users(c *gin.Context) {
	var users []models.User
	database.DB.Order("created_at DESC").Find(&users)
	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) CreateUser(c *gin.Context) {
	var body struct {
		Username string          `json:"username" binding:"required"`
		Password string          `json:"password" binding:"required"`
		FullName string          `json:"full_name" binding:"required"`
		Email    string          `json:"email" binding:"required"`
		Role     models.UserRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash error"})
		return
	}
	ph := string(hash)
	user := models.User{
		Username:     &body.Username,
		PasswordHash: &ph,
		FullName:     body.FullName,
		Email:        body.Email,
		Role:         body.Role,
	}
	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username or email already exists"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func (h *AdminHandler) UpdateUserStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var body struct{ IsActive bool `json:"is_active"` }
	c.ShouldBindJSON(&body)
	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	database.DB.Model(&user).Update("is_active", body.IsActive)
	c.JSON(http.StatusOK, user)
}
