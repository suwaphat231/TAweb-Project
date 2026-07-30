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

// ownsCourse checks whether the caller may act on this course — the same
// rule the course-catalog listings use (exact account match, or a
// classlist-name match for cases where the Excel import created a separate
// account for the same real person). Every write handler in this package
// must use this instead of a bare InstructorID comparison, or a course that
// shows up in the instructor's own section picker can end up rejected the
// moment they try to actually open/edit it.
func ownsCourse(c *gin.Context, course models.Course) bool {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	isAdmin := role.(string) == "admin"
	fullName := ""
	if u, ok := database.UserByID(instructorID.(uint)); ok {
		fullName = u.FullName
	}
	return database.InstructorOwnsCourse(course, instructorID.(uint), fullName, isAdmin)
}

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

// SectionInput is one teaching section (group) + time slot within a posting.
// A course commonly runs several sections at different times (e.g. sec 1 MWF
// 9-12, sec 2 MWF 13-16) — each becomes its own Course row sharing the same
// code/title/semester/year so students can apply to whichever time suits them.
type SectionInput struct {
	Section  int    `json:"section" example:"1"`
	Schedule string `json:"schedule,omitempty" example:"จ,พ,ศ 09:00-12:00"`
}

// CreateCourseRequest is the request body for creating a course
type CreateCourseRequest struct {
	Code         string              `json:"code" binding:"required" example:"CS101"`
	Title        string              `json:"title" binding:"required" example:"Introduction to Programming"`
	Semester     string              `json:"semester" binding:"required" example:"1"`
	AcademicYear int                 `json:"academic_year" binding:"required" example:"2567"`
	LabBoySlots  int                 `json:"labboy_slots" example:"2"`
	Status       models.CourseStatus `json:"status" example:"draft"`
	Description  *string             `json:"description,omitempty"`
	Requirements *string             `json:"requirements,omitempty"`
	Deadline     string              `json:"deadline,omitempty" example:"2026-08-01"`
	// RequireGradeProof: when true, applicants must attach an image of their
	// grade instead of just self-reporting it — guards against a typed-in
	// fake grade.
	RequireGradeProof bool `json:"require_grade_proof" example:"false"`
	// Sections lists the teaching sections/time slots for this posting. One
	// Course row is created per entry; when omitted, a single section with
	// no section number/schedule is created (unchanged single-section behavior).
	Sections []SectionInput `json:"sections,omitempty"`
	// InstructorID: admin-only. An instructor posting for themselves always
	// owns the course they create, but an admin adding a course on an
	// instructor's behalf (e.g. one they asked for that never made it into
	// the Excel import) needs to name who it actually belongs to. Ignored
	// for non-admin callers.
	InstructorID *uint `json:"instructor_id,omitempty" example:"5"`
}

// UpdateCourseRequest is the request body for updating a course
type UpdateCourseRequest struct {
	Code              *string              `json:"code,omitempty" example:"CS101"`
	Title             *string              `json:"title,omitempty" example:"Introduction to Programming"`
	Semester          *string              `json:"semester,omitempty" example:"1"`
	AcademicYear      *int                 `json:"academic_year,omitempty" example:"2567"`
	LabBoySlots       *int                 `json:"labboy_slots,omitempty" example:"2"`
	Status            *models.CourseStatus `json:"status,omitempty" example:"open"`
	Description       *string              `json:"description,omitempty"`
	Requirements      *string              `json:"requirements,omitempty"`
	Deadline          *string              `json:"deadline,omitempty" example:"2026-08-01"`
	Section           *int                 `json:"section,omitempty" example:"1"`
	Schedule          *string              `json:"schedule,omitempty" example:"จ,พ,ศ 09:00-12:00"`
	RequireGradeProof *bool                `json:"require_grade_proof,omitempty" example:"false"`
}

// AddSectionRequest is the request body for adding another section/time slot
// to an existing posting
type AddSectionRequest struct {
	Section  int    `json:"section" example:"2"`
	Schedule string `json:"schedule,omitempty" example:"อ,พฤ 13:00-16:00"`
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

// CourseCatalogSections godoc
// @Summary      รายชื่อ section จริงของวิชา (สำหรับเลือกตอนเปิดรับสมัคร)
// @Description  ดึงจากข้อมูลที่แอดมินนำเข้าจากไฟล์ Excel เท่านั้น — section และเวลาเรียนมาจากไฟล์เสมอ ไม่ให้อาจารย์พิมพ์เอง เพื่อลดความผิดพลาด
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        code           query  string  true  "รหัสวิชา"
// @Param        semester       query  string  true  "ภาคเรียน"
// @Param        academic_year  query  int     true  "ปีการศึกษา"
// @Success      200  {array}   models.Course
// @Router       /instructor/course-catalog/sections [get]
func (h *Handler) CourseCatalogSections(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	isAdmin := role.(string) == "admin"

	fullName := ""
	if u, ok := database.UserByID(instructorID.(uint)); ok {
		fullName = u.FullName
	}

	academicYear, _ := strconv.Atoi(c.Query("academic_year"))
	sections := database.TaughtCourseSections(instructorID.(uint), fullName, isAdmin, c.Query("code"), c.Query("semester"), academicYear)
	c.JSON(http.StatusOK, sections)
}

// Create godoc
// @Summary      สร้างวิชาใหม่ (รองรับหลาย section/เวลาเรียนในประกาศเดียว)
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      CreateCourseRequest  true  "ข้อมูลวิชา"
// @Success      201   {array}   models.Course
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      500   {object}  handlers.ErrorResponse
// @Router       /instructor/courses [post]
func (h *Handler) Create(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	var body CreateCourseRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Only an admin may assign the course to someone other than themselves —
	// an instructor's own InstructorID field in the request (if they somehow
	// sent one) is ignored so they can't post on another instructor's behalf.
	ownerID := instructorID.(uint)
	if role.(string) == "admin" && body.InstructorID != nil {
		ownerID = *body.InstructorID
	}

	status := body.Status
	if status == "" {
		status = models.StatusDraft
	}

	sections := body.Sections
	if len(sections) == 0 {
		// Single-section posting — unchanged behavior for callers that don't
		// specify sections at all.
		sections = []SectionInput{{}}
	}

	created := make([]models.Course, 0, len(sections))
	for _, sec := range sections {
		created = append(created, database.CreateCourse(models.Course{
			Code:              body.Code,
			Title:             body.Title,
			Section:           sec.Section,
			Schedule:          sec.Schedule,
			InstructorID:      ownerID,
			Semester:          body.Semester,
			AcademicYear:      body.AcademicYear,
			LabBoySlots:       body.LabBoySlots,
			Status:            status,
			Description:       body.Description,
			Requirements:      body.Requirements,
			Deadline:          parseDeadline(body.Deadline),
			RequireGradeProof: body.RequireGradeProof,
		}))
	}
	c.JSON(http.StatusCreated, created)
}

// AddSection godoc
// @Summary      เพิ่ม section/เวลาเรียนใหม่ให้ประกาศที่มีอยู่
// @Description  คัดลอกข้อมูลที่ใช้ร่วมกัน (รหัสวิชา ชื่อวิชา ภาค ปีการศึกษา จำนวนรับ ฯลฯ) จากวิชาต้นแบบ แล้วสร้างแถวใหม่ด้วย section/เวลาที่ระบุ
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                 true  "Course ID ของ section ใดๆ ในประกาศเดียวกัน (ใช้เป็นต้นแบบ)"
// @Param        body  body  AddSectionRequest   true  "section/เวลาใหม่ที่ต้องการเพิ่ม"
// @Success      201   {object}  models.Course
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/sections [post]
func (h *Handler) AddSection(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	template, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, template) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body AddSectionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created := database.CreateCourse(models.Course{
		Code:              template.Code,
		Title:             template.Title,
		EnglishTitle:      template.EnglishTitle,
		Section:           body.Section,
		Schedule:          body.Schedule,
		InstructorID:      template.InstructorID,
		Semester:          template.Semester,
		AcademicYear:      template.AcademicYear,
		LabBoySlots:       template.LabBoySlots,
		Status:            template.Status,
		Description:       template.Description,
		Requirements:      template.Requirements,
		Deadline:          template.Deadline,
		RequireGradeProof: template.RequireGradeProof,
	})
	c.JSON(http.StatusCreated, created)
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
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
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
		if body.Section != nil {
			cs.Section = *body.Section
		}
		if body.Schedule != nil {
			cs.Schedule = *body.Schedule
		}
		if body.RequireGradeProof != nil {
			cs.RequireGradeProof = *body.RequireGradeProof
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
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
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
	id, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
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
// @Param        role_applied query  string  false  "กรองตามประเภทที่สมัคร" Enums(labboy)
// @Param        status       query  string  false  "กรองตามสถานะ" Enums(pending, accepted, rejected, withdrawn)
// @Param        search       query  string  false  "ค้นหาด้วยชื่อหรือรหัสนักศึกษา"
// @Success      200          {array}   models.Application
// @Failure      403          {object}  handlers.ErrorResponse
// @Failure      404          {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/applicants [get]
func (h *Handler) Applicants(c *gin.Context) {
	role, _ := c.Get("role")
	courseID, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(courseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "staff" && !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	apps := database.ApplicantsForCourse(uint(courseID), c.Query("role_applied"), c.Query("status"), c.Query("search"))
	c.JSON(http.StatusOK, apps)
}
