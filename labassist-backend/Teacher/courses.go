package teacher

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const dateOnlyLayout = "2006-01-02"

func parseDeadline(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(dateOnlyLayout, s)
	if err != nil {
		return nil
	}
	return &t
}

// CreateCourseRequest is the request body for creating a course
type CreateCourseRequest struct {
	Code         string              `json:"code" binding:"required" example:"CS101"`
	Title        string              `json:"title" binding:"required" example:"Introduction to Programming"`
	Semester     string              `json:"semester" binding:"required" example:"1"`
	AcademicYear int                 `json:"academic_year" binding:"required" example:"2567"`
	TASlots      int                 `json:"ta_slots" example:"3"`
	LabBoySlots  int                 `json:"labboy_slots" example:"2"`
	Status       models.CourseStatus `json:"status" example:"draft"`
	Description  *string             `json:"description,omitempty"`
	Requirements *string             `json:"requirements,omitempty"`
	Deadline     string              `json:"deadline,omitempty" example:"2026-08-01"`
}

// UpdateCourseRequest is the request body for updating a course
type UpdateCourseRequest struct {
	Code         *string              `json:"code,omitempty" example:"CS101"`
	Title        *string              `json:"title,omitempty" example:"Introduction to Programming"`
	Semester     *string              `json:"semester,omitempty" example:"1"`
	AcademicYear *int                 `json:"academic_year,omitempty" example:"2567"`
	TASlots      *int                 `json:"ta_slots,omitempty" example:"3"`
	LabBoySlots  *int                 `json:"labboy_slots,omitempty" example:"2"`
	Status       *models.CourseStatus `json:"status,omitempty" example:"open"`
	Description  *string              `json:"description,omitempty"`
	Requirements *string              `json:"requirements,omitempty"`
	Deadline     *string              `json:"deadline,omitempty" example:"2026-08-01"`
}

// UpdateCourseStatusRequest is the request body for updating course status only
type UpdateCourseStatusRequest struct {
	Status models.CourseStatus `json:"status" example:"open"`
}

// InstructorList godoc
// @Summary      รายการวิชาของอาจารย์
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.Course
// @Failure      500  {object}  handlers.ErrorResponse
// @Router       /instructor/courses [get]
func (h *Handler) InstructorList(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	courses := database.InstructorCourses(instructorID.(uint), role.(string) == "admin", nil)
	c.JSON(http.StatusOK, courses)
}

// CourseCatalog godoc
// @Summary      รายวิชาที่อาจารย์คนนี้สอน (สำหรับ dropdown ตอนสร้างประกาศ)
// @Description  จับคู่ด้วยชื่ออาจารย์กับข้อมูลผู้สอนที่นำเข้าจากไฟล์ Excel เพื่อจำกัดตัวเลือกรหัสวิชาให้เหลือแค่วิชาที่ตัวเองสอนจริง
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   models.Course
// @Router       /instructor/course-catalog [get]
func (h *Handler) CourseCatalog(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	isAdmin := role.(string) == "admin"

	fullName := ""
	if u, ok := database.UserByID(instructorID.(uint)); ok {
		fullName = u.FullName
	}

	courses := database.CoursesTaughtBy(instructorID.(uint), fullName, isAdmin)
	c.JSON(http.StatusOK, courses)
}

// Create godoc
// @Summary      สร้างวิชาใหม่
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      CreateCourseRequest  true  "ข้อมูลวิชา"
// @Success      201   {object}  models.Course
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      500   {object}  handlers.ErrorResponse
// @Router       /instructor/courses [post]
func (h *Handler) Create(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	var body CreateCourseRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := body.Status
	if status == "" {
		status = models.StatusDraft
	}

	course := database.CreateCourse(models.Course{
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
		Deadline:     parseDeadline(body.Deadline),
	})
	c.JSON(http.StatusCreated, course)
}

// Update godoc
// @Summary      แก้ไขข้อมูลวิชา
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                 true  "Course ID"
// @Param        body  body  UpdateCourseRequest  true  "ข้อมูลที่ต้องการแก้ไข"
// @Success      200   {object}  models.Course
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id} [put]
func (h *Handler) Update(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body UpdateCourseRequest
	c.ShouldBindJSON(&body)

	updated, _ := database.UpdateCourse(uint(id), func(cs *models.Course) {
		if body.Code != nil {
			cs.Code = *body.Code
		}
		if body.Title != nil {
			cs.Title = *body.Title
		}
		if body.Semester != nil {
			cs.Semester = *body.Semester
		}
		if body.AcademicYear != nil {
			cs.AcademicYear = *body.AcademicYear
		}
		if body.TASlots != nil {
			cs.TASlots = *body.TASlots
		}
		if body.LabBoySlots != nil {
			cs.LabBoySlots = *body.LabBoySlots
		}
		if body.Status != nil {
			cs.Status = *body.Status
		}
		if body.Description != nil {
			cs.Description = body.Description
		}
		if body.Requirements != nil {
			cs.Requirements = body.Requirements
		}
		if body.Deadline != nil {
			cs.Deadline = parseDeadline(*body.Deadline)
		}
	})
	c.JSON(http.StatusOK, updated)
}

// UpdateStatus godoc
// @Summary      อัพเดตสถานะวิชา
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                        true  "Course ID"
// @Param        body  body  UpdateCourseStatusRequest  true  "สถานะใหม่"
// @Success      200   {object}  models.Course
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/status [put]
func (h *Handler) UpdateStatus(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body UpdateCourseStatusRequest
	c.ShouldBindJSON(&body)
	updated, _ := database.UpdateCourse(uint(id), func(cs *models.Course) {
		cs.Status = body.Status
	})
	c.JSON(http.StatusOK, updated)
}

// Delete godoc
// @Summary      ลบวิชา
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Course ID"
// @Success      204
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id} [delete]
func (h *Handler) Delete(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	database.DeleteCourse(uint(id))
	c.Status(http.StatusNoContent)
}

// Applicants godoc
// @Summary      รายชื่อผู้สมัครของวิชา
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id           path   int     true   "Course ID"
// @Param        role_applied query  string  false  "กรองตามประเภทที่สมัคร" Enums(ta, labboy)
// @Param        status       query  string  false  "กรองตามสถานะ" Enums(pending, accepted, rejected, withdrawn)
// @Param        search       query  string  false  "ค้นหาด้วยชื่อหรือรหัสนักศึกษา"
// @Success      200          {array}   models.Application
// @Failure      403          {object}  handlers.ErrorResponse
// @Failure      404          {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/applicants [get]
func (h *Handler) Applicants(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	courseID, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(courseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && role.(string) != "staff" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	apps := database.ApplicantsForCourse(uint(courseID), c.Query("role_applied"), c.Query("status"), c.Query("search"))
	c.JSON(http.StatusOK, apps)
}
