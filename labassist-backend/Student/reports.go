package student

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type PeerItem struct {
	ApplicationID uint   `json:"application_id"`
	StudentID     uint   `json:"student_id"`
	Name          string `json:"student_name"`
	Code          string `json:"student_code"`
	RoleApplied   string `json:"role_applied"`
	Status        string `json:"status"`
	IsSelf        bool   `json:"is_self"`
}

// CoursePeers godoc
// @Summary      รายชื่อนักศึกษาที่สมัคร/ได้รับคัดเลือกเป็น Lab Boy ในวิชาเดียวกัน
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Course ID"
// @Success      200  {array}   PeerItem
// @Router       /student/courses/{id}/peers [get]
func (h *Handler) CoursePeers(c *gin.Context) {
	studentIDVal, _ := c.Get("user_id")
	currentUID, _ := studentIDVal.(uint)

	courseID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}

	var apps []models.Application
	if err := database.DB.Where("course_id = ? AND status = ?", courseID, models.AppAccepted).Order("id ASC").Find(&apps).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	out := make([]PeerItem, 0, len(apps))
	for _, a := range apps {
		// ห้ามเห็นชื่อตัวเอง เห็นได้เฉพาะชื่อเพื่อน และไม่แสดงคนที่ถอนใบสมัครหรือถูกปฏิเสธแล้ว
		if a.StudentID == currentUID || a.Status == models.AppWithdrawn || a.Status == models.AppRejected {
			continue
		}
		user, ok := database.UserByID(a.StudentID)
		if !ok {
			continue
		}
		code := ""
		if user.StudentID != nil {
			code = *user.StudentID
		}
		out = append(out, PeerItem{
			ApplicationID: a.ID,
			StudentID:     a.StudentID,
			Name:          user.FullName,
			Code:          code,
			RoleApplied:   string(a.RoleApplied),
			Status:        string(a.Status),
			IsSelf:        false,
		})
	}
	c.JSON(http.StatusOK, out)
}

type StudentCreateReportInput struct {
	ApplicationID uint   `json:"application_id" binding:"required"`
	IncidentDate  string `json:"incident_date" binding:"required"`
	Category      string `json:"category" binding:"required"`
	Description   string `json:"description" binding:"required"`
	Impact        string `json:"impact"`
}

// CreateStudentReport godoc
// @Summary      นักศึกษาส่งรายงานการปฏิบัติงานเกี่ยวกับผู้ช่วยแล็บในวิชาเดียวกัน
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      StudentCreateReportInput  true  "ข้อมูลรายงาน"
// @Success      201   {object}  models.LabBoyReport
// @Router       /student/reports [post]
func (h *Handler) CreateStudentReport(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var in StudentCreateReportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}

	app, ok := database.ApplicationByID(in.ApplicationID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบใบสมัคร"})
		return
	}

	if app.StudentID == studentID.(uint) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถรายงานตนเองได้"})
		return
	}

	date, err := time.Parse("2006-01-02", in.IncidentDate)
	if err != nil {
		date = time.Now()
	}

	now := time.Now()
	rep := models.LabBoyReport{
		ApplicationID: app.ID,
		StudentID:     app.StudentID,
		CourseID:      app.CourseID,
		ReporterID:    studentID.(uint),
		IncidentDate:  date,
		Category:      models.ReportCategory(in.Category),
		Description:   in.Description,
		Impact:        in.Impact,
		Status:        models.ReportSubmitted,
		SubmittedAt:   &now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := database.DB.Create(&rep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างรายงานได้"})
		return
	}

	fromStatus := models.ReportDraft
	database.DB.Create(&models.LabBoyReportStatusHistory{
		ReportID:   rep.ID,
		FromStatus: &fromStatus,
		ToStatus:   models.ReportSubmitted,
		ActorID:    studentID.(uint),
		Reason:     "รายงานการปฏิบัติงานจากเพื่อนร่วมรายวิชา",
		CreatedAt:  now,
	})

	c.JSON(http.StatusCreated, rep)
}
