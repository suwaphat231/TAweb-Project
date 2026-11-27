// Package admin holds every backend endpoint under /api/v1/admin: user
// management, activity logs, system stats, and the course-import flow (in
// import.go). Keeping it separate from the other resource handlers means
// admin-only functionality always lives in one place.
package admin

import (
	"encoding/json"
	"errors"
	"fmt"
	"labassist/config"
	"labassist/database"
	"labassist/models"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreateUserRequest is the request body for creating a user. Admins only set
// a name and a role — the account has no username/password/email yet;
// instructors fill in their own email themselves (via Google sign-in, wired
// up separately) rather than having an admin type it in for them.
type CreateUserRequest struct {
	FullName   string          `json:"full_name" binding:"required" example:"สมชาย ใจดี"`
	FullNameEn string          `json:"full_name_en" example:"Somchai Jaidee"`
	Role       models.UserRole `json:"role" binding:"required" example:"instructor"`
}

// UpdateUserRequest is the request body for editing a user's name/role
type UpdateUserRequest struct {
	FullName   *string          `json:"full_name,omitempty" example:"สมชาย ใจดี"`
	FullNameEn *string          `json:"full_name_en,omitempty" example:"Somchai Jaidee"`
	Role       *models.UserRole `json:"role,omitempty" example:"instructor"`
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
	// Skipped lists the courses kept because of open recruitment or records
	// that must be kept, each with the reason.
	Skipped []database.SkippedCourse `json:"skipped"`
}

type Handler struct {
	// ocrURL is the OCR service that reads academic-calendar PDFs.
	ocrURL string
}

func NewHandler(cfg *config.Config) *Handler { return &Handler{ocrURL: cfg.OCRServiceURL} }

// Stats godoc
// @Summary      สถิติภาพรวมของระบบ
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  AdminStatsResponse
// @Router       /admin/stats [get]
func (h *Handler) Stats(c *gin.Context) {
	var stats AdminStatsResponse
	counts := []struct {
		dst   *int64
		count func() (int64, error)
	}{
		{&stats.TotalUsers, database.CountUsers},
		{&stats.TotalStudents, func() (int64, error) { return database.CountUsersByRole(models.RoleStudent) }},
		{&stats.TotalInstructors, func() (int64, error) { return database.CountUsersByRole(models.RoleInstructor) }},
		{&stats.TotalCourses, database.CountCourses},
		{&stats.OpenCourses, database.CountOpenCourses},
		{&stats.TotalApplications, database.CountApplications},
		{&stats.AcceptedApplications, func() (int64, error) { return database.CountApplicationsByStatus(models.AppAccepted) }},
		{&stats.PendingApplications, func() (int64, error) { return database.CountApplicationsByStatus(models.AppPending) }},
	}
	for _, ct := range counts {
		n, err := ct.count()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		*ct.dst = n
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

	users, err := database.ListUsers(c.Query("role"), c.Query("search"), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	rows, err := withRegCards(users)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, rows)
}

// withRegCards adds, for students, the status OCR read off their REG card
// (ocr_student_status) and whether the card image exists (has_reg_card), so
// the admin can spot students who are no longer ปกติ and suspend them.
// models.User has its own MarshalJSON, so the fields are merged into its
// JSON object rather than added by embedding.
func withRegCards(users []models.User) ([]map[string]any, error) {
	ids := make([]uint, 0, len(users))
	for _, u := range users {
		if u.Role == models.RoleStudent {
			ids = append(ids, u.ID)
		}
	}
	cards, err := database.StudentRegCardsByUserIDs(ids)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		raw, err := json.Marshal(u)
		if err != nil {
			return nil, err
		}
		row := map[string]any{}
		if err := json.Unmarshal(raw, &row); err != nil {
			return nil, err
		}
		if u.Role == models.RoleStudent {
			card := cards[u.ID]
			row["ocr_student_status"] = card.OcrStudentStatus
			row["has_reg_card"] = card.HasImage
		}
		out = append(out, row)
	}
	return out, nil
}

// StudentRegCardFile godoc
// @Summary      รูปบัตรโปรไฟล์ REG ของนักศึกษา (แอดมิน)
// @Tags         admin
// @Produce      image/png
// @Security     BearerAuth
// @Param        id  path  int  true  "User ID ของนักศึกษา"
// @Router       /admin/users/{id}/student-info/file [get]
func (h *Handler) StudentRegCardFile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	u, ok := database.UserByID(uint(id))
	if !ok || u.Role != models.RoleStudent {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบนักศึกษา"})
		return
	}
	fileName, data, ok := database.StudentInfoImageByUserID(u.ID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "นักศึกษายังไม่ได้อัปโหลดบัตร REG"})
		return
	}
	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, fileName))
	c.Data(http.StatusOK, contentType, data)
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
		FullName:   body.FullName,
		FullNameEn: strings.TrimSpace(body.FullNameEn),
		Role:       body.Role,
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

	// Prevent an admin from changing their own role — avoids accidental
	// lock-out and enforces the principle that role changes require another
	// admin to approve.
	callerID, _ := c.Get("user_id")
	if body.Role != nil && callerID != nil && uint(id) == callerID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่สามารถเปลี่ยนบทบาทของตัวเองได้"})
		return
	}

	updated, ok := database.UpdateUser(uint(id), func(u *models.User) {
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.FullNameEn != nil {
			u.FullNameEn = strings.TrimSpace(*body.FullNameEn)
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

// DeleteUser godoc
// @Summary      ลบผู้ใช้
// @Description  ลบแบบซ่อน: ผู้ใช้จะหายจากรายการและเข้าสู่ระบบไม่ได้ แต่ใบสมัคร วิชาที่สอน รายงาน และประวัติอื่นๆ ยังคงอยู่
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "User ID"
// @Success      204
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /admin/users/{id} [delete]
func (h *Handler) DeleteUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if uint(id) == c.GetUint("user_id") {
		c.JSON(http.StatusConflict, gin.H{"error": "ลบบัญชีของตัวเองไม่ได้"})
		return
	}

	if err := database.DeleteUser(uint(id)); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		default:
			log.Printf("delete user %d: %v", id, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบผู้ใช้ไม่สำเร็จ กรุณาลองใหม่"})
		}
		return
	}
	c.Status(http.StatusNoContent)
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

	logs, total, err := database.ListActivityLogs(c.Query("user_id"), c.Query("method"), offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

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
	courses, err := database.CoursesTaughtBy(user.ID, user.FullName, false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, courses)
}

// CoreCourseCatalog godoc
// @Summary      รายวิชาหลักของภาควิชา (สำหรับช่วยพิมพ์ตอนเพิ่มวิชาเอง)
// @Description  ดึงจากตาราง core_courses ซึ่งเป็นรายวิชาที่ใช้จับคู่กับ OCR ทรานสคริปต์ ไม่ใช่รายวิชาที่นำเข้าจาก Excel
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.CoreCourse
// @Router       /admin/core-courses [get]
func (h *Handler) CoreCourseCatalog(c *gin.Context) {
	catalog, err := database.CoreCourseCatalog()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, catalog)
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

	deleted, skipped, err := database.DeleteCoursesByTerm(semester, academicYear)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบรายวิชาไม่สำเร็จ กรุณาลองใหม่"})
		return
	}
	c.JSON(http.StatusOK, DeleteCoursesByTermResponse{Deleted: deleted, Skipped: skipped})
}

