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

// List godoc
// @Summary      ดูรายวิชาทั้งหมด (public)
// @Tags         courses
// @Produce      json
// @Param        status  query     string  false  "กรองตาม status: open, closing_soon, closed, draft"
// @Param        q       query     string  false  "ค้นหาจาก code หรือ title"
// @Success      200     {array}   models.Course
// @Router       /courses [get]
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

// Get godoc
// @Summary      ดูรายวิชาตาม ID (public)
// @Tags         courses
// @Produce      json
// @Param        id   path      int  true  "Course ID"
// @Success      200  {object}  models.Course
// @Failure      404  {object}  object{error=string}
// @Router       /courses/{id} [get]
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

// InstructorList godoc
// @Summary      ดูรายวิชาของอาจารย์ (instructor/admin)
// @Description  อาจารย์เห็นแค่รายวิชาของตัวเอง admin เห็นทั้งหมด พร้อม applicant_count
// @Tags         courses
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.Course
// @Failure      401  {object}  object{error=string}
// @Router       /instructor/courses [get]
func (h *CourseHandler) InstructorList(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	type Row struct {
		models.Course
		InstructorFull string `gorm:"column:instructor_full"`
		AppCount       int    `gorm:"column:app_count"`
	}

	q := database.DB.Table("courses c").
		Select("c.*, u.full_name AS instructor_full, COUNT(a.id) AS app_count").
		Joins("JOIN users u ON u.id = c.instructor_id").
		Joins("LEFT JOIN applications a ON a.course_id = c.id AND a.status != 'withdrawn'").
		Group("c.id, u.full_name, u.id")

	if role.(string) != "admin" {
		q = q.Where("c.instructor_id = ?", instructorID)
	}

	var rows []Row
	if err := q.Order("c.created_at DESC").Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	courses := make([]models.Course, len(rows))
	for i, r := range rows {
		courses[i] = r.Course
		courses[i].InstructorName = r.InstructorFull
		courses[i].ApplicantCount = r.AppCount
	}
	c.JSON(http.StatusOK, courses)
}

// Create godoc
// @Summary      สร้างรายวิชาใหม่ (instructor/admin)
// @Tags         courses
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{code=string,title=string,semester=string,academic_year=int,ta_slots=int,labboy_slots=int,status=string,description=string,requirements=string}  true  "ข้อมูลรายวิชา"
// @Success      201   {object}  models.Course
// @Failure      400   {object}  object{error=string}
// @Failure      401   {object}  object{error=string}
// @Router       /instructor/courses [post]
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

// Update godoc
// @Summary      แก้ไขรายวิชา (instructor/admin)
// @Tags         courses
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int             true  "Course ID"
// @Param        body  body      models.Course   true  "ข้อมูลที่ต้องการแก้ไข"
// @Success      200   {object}  models.Course
// @Failure      403   {object}  object{error=string}
// @Failure      404   {object}  object{error=string}
// @Router       /instructor/courses/{id} [put]
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

// UpdateStatus godoc
// @Summary      เปลี่ยนสถานะรายวิชา (instructor/admin)
// @Tags         courses
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int                           true  "Course ID"
// @Param        body  body      object{status=string}         true  "สถานะใหม่: open, closing_soon, closed, draft"
// @Success      200   {object}  models.Course
// @Failure      403   {object}  object{error=string}
// @Failure      404   {object}  object{error=string}
// @Router       /instructor/courses/{id}/status [put]
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

// Applicants godoc
// @Summary      ดูรายชื่อผู้สมัครของรายวิชา (instructor/staff/admin)
// @Tags         courses
// @Produce      json
// @Security     BearerAuth
// @Param        id           path      int     true   "Course ID"
// @Param        role_applied query     string  false  "กรองตาม role: ta, labboy"
// @Param        status       query     string  false  "กรองตาม status: pending, accepted, rejected, withdrawn"
// @Param        search       query     string  false  "ค้นหาจากชื่อหรือรหัสนักศึกษา"
// @Success      200          {array}   models.Application
// @Failure      403          {object}  object{error=string}
// @Failure      404          {object}  object{error=string}
// @Router       /instructor/courses/{id}/applicants [get]
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

	roleFilter  := c.Query("role_applied")
	statusFilter := c.Query("status")
	search       := c.Query("search")

	type AppRow struct {
		models.Application
		StudentName    string  `gorm:"column:student_name"`
		StudentCode    string  `gorm:"column:student_code"`
		StudentGPA     float64 `gorm:"column:student_gpa"`
		StudentEmail   string  `gorm:"column:student_email"`
		StudentFaculty string  `gorm:"column:student_faculty"`
		StudentYear    int     `gorm:"column:student_year"`
		CourseCode     string  `gorm:"column:course_code"`
		CourseTitle    string  `gorm:"column:course_title"`
	}

	q := database.DB.Table("applications a").
		Select("a.*, u.full_name AS student_name, u.student_id AS student_code, u.gpa AS student_gpa, u.email AS student_email, u.faculty AS student_faculty, u.year AS student_year, c.code AS course_code, c.title AS course_title").
		Joins("JOIN users u ON u.id = a.student_id").
		Joins("JOIN courses c ON c.id = a.course_id").
		Where("a.course_id = ?", courseID)

	if roleFilter != "" {
		q = q.Where("a.role_applied = ?", roleFilter)
	}
	if statusFilter != "" {
		q = q.Where("a.status = ?", statusFilter)
	}
	if search != "" {
		q = q.Where("u.full_name ILIKE ? OR u.student_id ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var rows []AppRow
	q.Order("u.gpa DESC NULLS LAST").Scan(&rows)

	apps := make([]models.Application, len(rows))
	for i, r := range rows {
		apps[i] = r.Application
		apps[i].StudentName = r.StudentName
		apps[i].StudentCode = r.StudentCode
		apps[i].StudentGPA = r.StudentGPA
		apps[i].StudentEmail = r.StudentEmail
		apps[i].StudentFaculty = r.StudentFaculty
		apps[i].StudentYear = r.StudentYear
		apps[i].CourseCode = r.CourseCode
		apps[i].CourseTitle = r.CourseTitle
	}
	c.JSON(http.StatusOK, apps)
}
