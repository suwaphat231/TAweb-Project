package student

import (
	"errors"
	"fmt"
	"labassist/database"
	"labassist/models"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ApplyRequest is the request body for submitting an application
type ApplyRequest struct {
	CourseID    uint               `json:"course_id" binding:"required" example:"1"`
	RoleApplied models.RoleApplied `json:"role_applied" binding:"required,oneof=labboy" example:"labboy"`
	// Grade is the letter grade the student got when they previously took
	// this course, so the instructor can check it against the posting's
	// minimum-grade requirement. Required — Apply rejects a missing grade.
	Grade *string `json:"grade" binding:"omitempty,oneof=A B+ B C+ C D+ D F" example:"A"`
}

type WithdrawRequest struct {
	Reason string `json:"reason" binding:"required" example:"มีตารางเรียนชนกับเวลาปฏิบัติงาน"`
}

// UpdateProfileRequest is the request body for updating student profile
type UpdateProfileRequest struct {
	// FullName is the Thai name — the primary name shown everywhere.
	FullName *string `json:"full_name,omitempty" example:"สมชาย ใจดี"`
	// NamePrefix is the Thai title: "นาย" or "นางสาว".
	NamePrefix *string `json:"name_prefix,omitempty" example:"นาย"`
	// FullNameEn is the English spelling; "" clears it.
	FullNameEn *string `json:"full_name_en,omitempty" example:"Somchai Jaidee"`
	StudentID *string `json:"student_id,omitempty" example:"640710112"`
	Year      *int    `json:"year,omitempty" binding:"omitempty,min=0,max=4" example:"3"`
	Faculty   *string `json:"faculty,omitempty" example:"วิทยาการคอมพิวเตอร์"`
	// Username is the login name used by /auth/login. Passwords are changed
	// through /auth/password/* instead.
	Username *string `json:"username,omitempty" example:"somchai"`
	// Phone is the student's contact number; "" clears it.
	Phone *string `json:"phone,omitempty" example:"0812345678"`
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

	recentApps, err := database.RecentStudentApplications(sid, 5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	openCourses, err := database.RecentOpenCourses(3)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	recentCourses := enrichConflicts(sid, openCourses)
	openCount, err := database.CountOpenCourses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	appliedCount, err := database.CountAppliedByStudent(sid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

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
	apps, err := database.StudentApplications(studentID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
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
	if body.Grade == nil || *body.Grade == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเกรดที่เคยได้ในวิชานี้"})
		return
	}

	course, ok := database.CourseByID(body.CourseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if course.Status != models.StatusOpen && course.Status != models.StatusClosingSoon {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course is not accepting applications"})
		return
	}
	// Only a student whose confirmed registrar document says สถานภาพ ปกติ
	// may apply.
	if status := database.VerifiedStudentStatus(studentID.(uint)); !database.IsNormalStudentStatus(status) {
		msg := "กรุณาแนบเอกสารแสดงสถานภาพนักศึกษาและยืนยันข้อมูลในหน้าโปรไฟล์ก่อนสมัคร Lab Boy"
		if status != "" {
			msg = "สมัคร Lab Boy ได้เฉพาะนักศึกษาที่มีสถานภาพปกติ (สถานภาพของคุณ: " + status + ")"
		}
		c.JSON(http.StatusForbidden, gin.H{"error": msg, "student_status_required": true})
		return
	}
	// Hiring documents print the student's title, so it must be set.
	if me, _ := database.UserByID(studentID.(uint)); !models.IsValidNamePrefix(me.NamePrefix) {
		c.JSON(http.StatusForbidden, gin.H{"error": "กรุณาเลือกคำนำหน้าชื่อ (นาย/นางสาว) ในหน้าโปรไฟล์ก่อนสมัคร Lab Boy", "name_prefix_required": true})
		return
	}
	// A Google sign-up starts with only the English name.
	if me, _ := database.UserByID(studentID.(uint)); !database.HasThaiLetter(me.FullName) {
		c.JSON(http.StatusForbidden, gin.H{"error": "กรุณากรอกชื่อ-นามสกุลภาษาไทยในหน้าโปรไฟล์ก่อนสมัคร Lab Boy", "thai_name_required": true})
		return
	}

	// The student must have saved a schedule for this course's own term — a
	// term 1 schedule says nothing about clashes with a term 2 course.
	ts := database.TermScheduleByUserTerm(studentID.(uint), course.Semester, course.AcademicYear)
	if !ts.Confirmed() {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             fmt.Sprintf("กรุณากรอกและบันทึกตารางเรียนภาคเรียนที่ %s ในหน้าโปรไฟล์ก่อนสมัครวิชานี้", course.Semester),
			"schedule_required": true,
		})
		return
	}

	// Block if the student's term schedule conflicts with this course.
	if day := database.ConflictingDay(course.Schedule, ts); day != "" {
		c.JSON(http.StatusConflict, gin.H{
			"error":             "ตารางเรียนของคุณมีวิชาที่เรียนใน" + day + " ซึ่งตรงกับเวลาของวิชานี้ กรุณาตรวจสอบตารางเรียนของคุณในหน้าโปรไฟล์",
			"schedule_conflict": true,
			"conflict_day":      day,
		})
		return
	}

	newApp := models.Application{
		StudentID:   studentID.(uint),
		CourseID:    body.CourseID,
		RoleApplied: body.RoleApplied,
		Status:      models.AppPending,
		Grade:       body.Grade,
	}
	// On postings that require grade proof, a grade the student already
	// submitted on the grade-check page stands in for the image — it wins
	// over the self-reported grade.
	if course.RequireGradeProof {
		if grade, ok := database.TranscriptGrade(studentID.(uint), course.Code); ok {
			newApp.Grade = &grade
			newApp.GradeFromTranscript = true
			var warnParts []string
			if student, ok := database.UserByID(studentID.(uint)); ok {
				if ocrGrade, edited := database.TranscriptGradeEdited(student, course.Code); edited {
					warnParts = append(warnParts, fmt.Sprintf("นักศึกษาแก้เกรดเอง (%s) ต่างจากที่ OCR อ่านได้จากใบเกรด (%s)", grade, ocrGrade))
				}
			}
			if min := minGradeFromRequirements(course.Requirements); min != "" && !gradeAtLeast(grade, min) {
				warnParts = append(warnParts, fmt.Sprintf("เกรดจากใบเกรดที่ยื่นไว้ (%s) ต่ำกว่าเกณฑ์ขั้นต่ำ (%s)", grade, min))
			}
			if len(warnParts) > 0 {
				warn := strings.Join(warnParts, "; ")
				newApp.OcrWarning = &warn
			}
		}
	}
	app, err := database.CreateApplication(newApp)
	if err != nil {
		if err == database.ErrConflict {
			c.JSON(http.StatusConflict, gin.H{"error": "already applied"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save application"})
		}
		return
	}

	// Notify the instructor account linked to this course.
	if applicant, ok := database.UserByID(studentID.(uint)); ok {
		notifs := make([]models.Notification, 0, 1)
		// The application is already saved, so a failed lookup only skips
		// the notification instead of failing the request.
		instructors, err := database.InstructorsForCourse(course)
		if err != nil {
			log.Printf("notify instructors of course %d: %v", course.ID, err)
		}
		for _, ins := range instructors {
			notifs = append(notifs, models.Notification{
				UserID:   ins.ID,
				CourseID: &body.CourseID,
				Title:    "มีผู้สมัครใหม่",
				Body:     fmt.Sprintf("นักศึกษา %s สมัครวิชา %s (%s)", applicant.DisplayName(), course.Title, course.Code),
			})
		}
		database.CreateNotifications(notifs)
	}

	c.JSON(http.StatusCreated, app)
}

// Withdraw godoc
// @Summary      ถอนใบสมัคร
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Param        body  body  WithdrawRequest  true  "เหตุผลที่ถอนใบสมัคร"
// @Success      200  {object}  models.Application
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/withdraw [put]
func (h *Handler) Withdraw(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	var body WithdrawRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่ถอนใบสมัคร"})
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่ถอนใบสมัคร"})
		return
	}
	if len([]rune(reason)) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เหตุผลต้องมีความยาวไม่เกิน 1000 ตัวอักษร"})
		return
	}

	updated, err := database.WithdrawApplication(uint(id), studentID.(uint), reason)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
			return
		}
		if errors.Is(err, database.ErrAlreadyWithdrawn) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "already withdrawn"})
			return
		}
		if errors.Is(err, database.ErrWithdrawalClosed) {
			c.JSON(http.StatusForbidden, gin.H{"error": "ไม่สามารถถอนใบสมัครได้หลังจากอาจารย์ปิดรับสมัครแล้ว"})
			return
		}
		if errors.Is(err, database.ErrWithdrawAlreadyRequested) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ส่งคำขอถอนไปแล้ว กรุณารออาจารย์พิจารณา"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save application"})
		return
	}

	// An accepted Lab Boy's withdrawal waits for the instructor's approval.
	if updated.WithdrawRequested {
		if course, ok := database.CourseByID(updated.CourseID); ok {
			if applicant, ok := database.UserByID(studentID.(uint)); ok {
				notifs := make([]models.Notification, 0, 1)
				// The withdrawal request is already saved, so a failed lookup
				// only skips the notification instead of failing the request.
				instructors, err := database.InstructorsForCourse(course)
				if err != nil {
					log.Printf("notify instructors of course %d: %v", course.ID, err)
				}
				for _, ins := range instructors {
					notifs = append(notifs, models.Notification{
						UserID:   ins.ID,
						CourseID: &course.ID,
						Title:    "มีคำขอถอนจาก Lab Boy",
						Body:     fmt.Sprintf("นักศึกษา %s ขอถอนจากการเป็น Lab Boy วิชา %s (%s) เหตุผล: %s", applicant.DisplayName(), course.Title, course.Code, reason),
					})
				}
				database.CreateNotifications(notifs)
			}
		}
	}

	c.JSON(http.StatusOK, updated)
}

// ApplicationHistory godoc
// @Summary      ประวัติการสมัครรอบก่อนหน้า
// @Description  คืนรายการ snapshot ของใบสมัครที่ถูกปฏิเสธหรือถอนไปในรอบก่อน ก่อนที่นักศึกษาจะสมัครใหม่
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {array}   models.ApplicationHistory
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/history [get]
func (h *Handler) ApplicationHistory(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	history, err := database.ApplicationHistoryForApplication(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, history)
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
	c.JSON(http.StatusOK, database.WithTranscriptCourseTitles(user))
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
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.NamePrefix != nil && !models.IsValidNamePrefix(*body.NamePrefix) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกคำนำหน้าชื่อ (นาย หรือ นางสาว)"})
		return
	}
	if body.FullName != nil {
		// A title typed into the name box moves to NamePrefix, so it is not
		// printed twice ("นายนายสมชาย").
		prefix, trimmed := database.SplitNamePrefix(*body.FullName)
		if prefix != "" && body.NamePrefix == nil {
			body.NamePrefix = &prefix
		}
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อ-นามสกุล"})
			return
		}
		if !database.HasThaiLetter(trimmed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อ-นามสกุลเป็นภาษาไทย"})
			return
		}
		body.FullName = &trimmed
	}
	if body.FullNameEn != nil {
		trimmed := strings.Join(strings.Fields(*body.FullNameEn), " ")
		if trimmed != "" && !database.IsEnglishName(trimmed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อ-นามสกุลภาษาอังกฤษต้องเป็นตัวอักษรภาษาอังกฤษเท่านั้น"})
			return
		}
		body.FullNameEn = &trimmed
	}

	if body.StudentID != nil {
		trimmed, ok := database.NormalizeStudentID(*body.StudentID)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสนักศึกษาต้องเป็นตัวเลข 9-10 หลัก (ตรวจว่าไม่ได้พิมพ์ด้วยแป้นภาษาไทย)"})
			return
		}
		body.StudentID = &trimmed
		if trimmed != "" {
			if owner, ok := database.UserByStudentID(trimmed); ok && owner.ID != studentID.(uint) {
				c.JSON(http.StatusConflict, gin.H{"error": "รหัสนักศึกษานี้ถูกใช้งานแล้ว"})
				return
			}
		}
	}

	if body.Phone != nil {
		phone, ok := normalizePhone(*body.Phone)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "เบอร์ติดต่อต้องเป็นตัวเลข 9-10 หลัก"})
			return
		}
		body.Phone = &phone
	}

	var username *string
	if body.Username != nil {
		trimmed := strings.TrimSpace(*body.Username)
		if trimmed != "" {
			if other, found := database.UserByUsername(trimmed); found && other.ID != studentID.(uint) {
				c.JSON(http.StatusConflict, gin.H{"error": "ชื่อผู้ใช้นี้ถูกใช้แล้ว"})
				return
			}
			username = &trimmed
		}
	}

	updated, ok := database.UpdateUser(studentID.(uint), func(u *models.User) {
		if username != nil {
			u.Username = username
		}
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.NamePrefix != nil {
			u.NamePrefix = *body.NamePrefix
		}
		if body.FullNameEn != nil {
			u.FullNameEn = *body.FullNameEn
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
		if body.Phone != nil {
			if *body.Phone == "" {
				u.Phone = nil
			} else {
				u.Phone = body.Phone
			}
		}
	})
	if !ok {
		c.JSON(http.StatusConflict, gin.H{"error": "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่"})
		return
	}
	c.JSON(http.StatusOK, updated)
}
