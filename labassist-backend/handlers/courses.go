package handlers

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type CourseHandler struct{}

func NewCourseHandler() *CourseHandler { return &CourseHandler{} }

func (h *CourseHandler) List(c *gin.Context) {
	status := c.Query("status")
	q := c.Query("q")

	query := database.DB.Preload("Instructor")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if q != "" {
		query = query.Where("code LIKE ? OR title LIKE ?", "%"+q+"%", "%"+q+"%")
	}

	var courses []models.Course
	if err := query.Order("created_at DESC").Find(&courses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range courses {
		courses[i].InstructorName = courses[i].Instructor.FullName
	}
	c.JSON(http.StatusOK, courses)
}

func (h *CourseHandler) Get(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var course models.Course
	if err := database.DB.Preload("Instructor").First(&course, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	course.InstructorName = course.Instructor.FullName
	c.JSON(http.StatusOK, course)
}

func (h *CourseHandler) InstructorList(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	query := database.DB.Preload("Instructor")
	if role.(string) != "admin" {
		query = query.Where("instructor_id = ?", instructorID)
	}

	var courses []models.Course
	if err := query.Order("created_at DESC").Find(&courses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range courses {
		courses[i].InstructorName = courses[i].Instructor.FullName
	}
	c.JSON(http.StatusOK, courses)
}

func (h *CourseHandler) Create(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	var body struct {
		Code         string               `json:"code" binding:"required"`
		Title        string               `json:"title" binding:"required"`
		Semester     string               `json:"semester" binding:"required"`
		AcademicYear int                  `json:"academic_year" binding:"required"`
		TASlots      int                  `json:"ta_slots"`
		LabBoySlots  int                  `json:"labboy_slots"`
		Status       models.CourseStatus  `json:"status"`
		Description  *string              `json:"description"`
		Requirements *string              `json:"requirements"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := body.Status
	if status == "" {
		status = models.StatusDraft
	}

	course := models.Course{
		Code:         body.Code,
		Title:        body.Title,
		InstructorID: instructorID.(uint),
		Semester:     body.Semester,
		AcademicYear: body.AcademicYear,
		TASlots:      body.TASlots,
		LabBoySlots:  body.LabBoySlots,
		Status:       status,
		Description:  body.Description,
		Requirements: body.Requirements,
	}
	if err := database.DB.Create(&course).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var instructor models.User
	database.DB.First(&instructor, instructorID)
	course.InstructorName = instructor.FullName
	c.JSON(http.StatusCreated, course)
}

func (h *CourseHandler) Update(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	var course models.Course
	if err := database.DB.First(&course, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body map[string]interface{}
	c.ShouldBindJSON(&body)
	database.DB.Model(&course).Updates(body)
	c.JSON(http.StatusOK, course)
}

func (h *CourseHandler) UpdateStatus(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	var course models.Course
	if err := database.DB.First(&course, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct{ Status models.CourseStatus `json:"status"` }
	c.ShouldBindJSON(&body)
	database.DB.Model(&course).Update("status", body.Status)
	c.JSON(http.StatusOK, course)
}

func (h *CourseHandler) Applicants(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	courseID, _ := strconv.Atoi(c.Param("id"))

	var course models.Course
	if err := database.DB.First(&course, courseID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && role.(string) != "staff" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	type AppRow struct {
		models.Application
		StudentName string  `gorm:"column:student_name"`
		StudentCode string  `gorm:"column:student_code"`
		StudentGPA  float64 `gorm:"column:student_gpa"`
		CourseCode  string  `gorm:"column:course_code"`
		CourseTitle string  `gorm:"column:course_title"`
	}

	var rows []AppRow
	database.DB.Table("applications a").
		Select("a.*, u.full_name AS student_name, u.student_id AS student_code, u.gpa AS student_gpa, c.code AS course_code, c.title AS course_title").
		Joins("JOIN users u ON u.id = a.student_id").
		Joins("JOIN courses c ON c.id = a.course_id").
		Where("a.course_id = ?", courseID).
		Order("a.applied_at DESC").
		Scan(&rows)

	apps := make([]models.Application, len(rows))
	for i, r := range rows {
		apps[i] = r.Application
		apps[i].StudentName = r.StudentName
		apps[i].StudentCode = r.StudentCode
		apps[i].StudentGPA = r.StudentGPA
		apps[i].CourseCode = r.CourseCode
		apps[i].CourseTitle = r.CourseTitle
	}
	c.JSON(http.StatusOK, apps)
}
