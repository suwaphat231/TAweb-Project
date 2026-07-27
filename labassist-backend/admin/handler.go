// Package admin holds every backend endpoint under /api/v1/admin: user
// management, activity logs, system stats, and the course-import flow (in
// import.go). Keeping it separate from the other resource handlers means
// admin-only functionality always lives in one place.
package admin

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateUserRequest is the request body for creating a user. Admins only set
// a name and a role — the account has no username/password/email yet;
// instructors fill in their own email themselves (via Google sign-in, wired
// up separately) rather than having an admin type it in for them.
type CreateUserRequest struct {
	FullName string          `json:"full_name" binding:"required" example:"John Doe"`
	Role     models.UserRole `json:"role" binding:"required" example:"instructor"`
}

// UpdateUserRequest is the request body for editing a user's name/role
type UpdateUserRequest struct {
	FullName *string          `json:"full_name,omitempty" example:"John Doe"`
	Role     *models.UserRole `json:"role,omitempty" example:"instructor"`
}

// UpdateUserStatusRequest is the request body for updating user active status
type UpdateUserStatusRequest struct {
	IsActive bool `json:"is_active" example:"true"`
}

// AdminStatsResponse is the response for admin stats endpoint
type AdminStatsResponse struct {
	TotalUsers           int64 `json:"total_users" example:"100"`
	TotalStudents        int64 `json:"total_students" example:"80"`
	TotalInstructors     int64 `json:"total_instructors" example:"10"`
	TotalCourses         int64 `json:"total_courses" example:"15"`
	OpenCourses          int64 `json:"open_courses" example:"5"`
	TotalApplications    int64 `json:"total_applications" example:"200"`
	AcceptedApplications int64 `json:"accepted_applications" example:"50"`
	PendingApplications  int64 `json:"pending_applications" example:"30"`
}

// DeleteCoursesByTermResponse is the response for the bulk term-delete endpoint
type DeleteCoursesByTermResponse struct {
	Deleted int `json:"deleted" example:"12"`
}

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

// Stats godoc
// @Summary      สถิติภาพรวมของระบบ
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  AdminStatsResponse
// @Router       /admin/stats [get]
func (h *Handler) Stats(c *gin.Context) {
	stats := AdminStatsResponse{
		TotalUsers:           database.CountUsers(),
		TotalStudents:        database.CountUsersByRole(models.RoleStudent),
		TotalInstructors:     database.CountUsersByRole(models.RoleInstructor),
		TotalCourses:         database.CountCourses(),
		OpenCourses:          database.CountOpenCourses(),
		TotalApplications:    database.CountApplications(),
		AcceptedApplications: database.CountApplicationsByStatus(models.AppAccepted),
		PendingApplications:  database.CountApplicationsByStatus(models.AppPending),
	}
	c.JSON(http.StatusOK, stats)
}

// Users godoc
// @Summary      รายการผู้ใช้ทั้งหมด
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        role    query  string  false  "กรองตาม role" Enums(student, instructor, staff, admin)
// @Param        search  query  string  false  "ค้นหาด้วยชื่อหรืออีเมล"
// @Param        limit   query  int     false  "จำนวนต่อหน้า (default 100)"
// @Param        offset  query  int     false  "ออฟเซ็ต (default 0)"
// @Success      200     {array}   models.User
// @Router       /admin/users [get]
func (h *Handler) Users(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit < 1 || limit > 200 {
		limit = 100
	}

	users := database.ListUsers(c.Query("role"), c.Query("search"), limit, offset)
	c.JSON(http.StatusOK, users)
}

// CreateUser godoc
// @Summary      สร้างผู้ใช้ใหม่ (ชื่อ + บทบาทเท่านั้น)
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      CreateUserRequest  true  "ข้อมูลผู้ใช้"
// @Success      201   {object}  models.User
// @Failure      400   {object}  handlers.ErrorResponse
// @Router       /admin/users [post]
func (h *Handler) CreateUser(c *gin.Context) {
	var body CreateUserRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := database.CreateUser(models.User{
		FullName: body.FullName,
		Role:     body.Role,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "could not create user"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

// UpdateUser godoc
// @Summary      แก้ไขชื่อ/บทบาทผู้ใช้
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                 true  "User ID"
// @Param        body  body  UpdateUserRequest  true  "ข้อมูลที่ต้องการแก้ไข"
// @Success      200   {object}  models.User
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /admin/users/{id} [put]
func (h *Handler) UpdateUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var body UpdateUserRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, ok := database.UpdateUser(uint(id), func(u *models.User) {
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.Role != nil {
			u.Role = *body.Role
		}
	})
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// UpdateUserStatus godoc
// @Summary      อัพเดตสถานะผู้ใช้ (เปิด/ปิด)
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                      true  "User ID"
// @Param        body  body  UpdateUserStatusRequest  true  "สถานะใหม่"
// @Success      200   {object}  models.User
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /admin/users/{id}/status [put]
func (h *Handler) UpdateUserStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var body UpdateUserStatusRequest
	c.ShouldBindJSON(&body)

	updated, ok := database.UpdateUser(uint(id), func(u *models.User) {
		u.IsActive = body.IsActive
	})
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// Logs godoc
// @Summary      ดู activity log
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        user_id  query  int     false  "กรองตาม user ID"
// @Param        method   query  string  false  "กรองตาม HTTP method" Enums(GET, POST, PUT, DELETE)
// @Param        page     query  int     false  "หน้า (default 1)"
// @Param        limit    query  int     false  "จำนวนต่อหน้า (default 50)"
// @Success      200      {object}  handlers.LogsResponse
// @Router       /admin/logs [get]
func (h *Handler) Logs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	logs, total := database.ListActivityLogs(c.Query("user_id"), c.Query("method"), offset, limit)

	c.JSON(http.StatusOK, gin.H{
		"data":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// InstructorCourses godoc
// @Summary      รายวิชาที่อาจารย์คนนี้สอน
// @Description  จับคู่ด้วย ID บัญชีโดยตรง และด้วยชื่อกับข้อมูลผู้สอนที่นำเข้าจากไฟล์ Excel (ครอบคลุมทั้งผู้สอนหลักและผู้ร่วมสอน)
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "User ID"
// @Success      200  {array}   models.Course
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /admin/users/{id}/courses [get]
func (h *Handler) InstructorCourses(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	user, ok := database.UserByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	courses := database.CoursesTaughtBy(user.ID, user.FullName, false)
	c.JSON(http.StatusOK, courses)
}

// DeleteCoursesByTerm godoc
// @Summary      ลบวิชาทั้งหมดของภาคการศึกษาที่ระบุ
// @Description  ใช้เพื่อล้างข้อมูลที่นำเข้าผิดพลาด เช่น หลังจากอัปโหลดไฟล์ Excel ผิดเทอม
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        semester      query  string  true  "ภาคการศึกษา"
// @Param        academic_year query  int     true  "ปีการศึกษา"
// @Success      200  {object}  DeleteCoursesByTermResponse
// @Failure      400  {object}  handlers.ErrorResponse
// @Router       /admin/courses/term [delete]
func (h *Handler) DeleteCoursesByTerm(c *gin.Context) {
	semester := c.Query("semester")
	academicYear, yearErr := strconv.Atoi(c.Query("academic_year"))
	if semester == "" || yearErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "semester and academic_year are required"})
		return
	}

	deleted := database.DeleteCoursesByTerm(semester, academicYear)
	c.JSON(http.StatusOK, DeleteCoursesByTermResponse{Deleted: deleted})
}
