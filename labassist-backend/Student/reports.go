package student

import (
	"errors"
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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

func cleanStudentReportText(s string, max int, required bool) (string, error) {
	s = strings.TrimSpace(s)
	if required && s == "" {
		return "", errors.New("กรุณากรอกข้อความรายงาน")
	}
	if utf8.RuneCountInString(s) > max {
		return "", errors.New("ข้อความรายงานยาวเกินกำหนด")
	}
	return s, nil
}

func validateStudentReportInput(in StudentCreateReportInput) (models.ReportCategory, time.Time, string, string, error) {
	category := models.ReportCategory(strings.TrimSpace(in.Category))
	if !category.Valid() {
		return "", time.Time{}, "", "", errors.New("ประเภทเหตุการณ์ไม่ถูกต้อง")
	}
	incident, err := time.Parse("2006-01-02", strings.TrimSpace(in.IncidentDate))
	if err != nil {
		return "", time.Time{}, "", "", errors.New("วันที่เกิดเหตุไม่ถูกต้อง (YYYY-MM-DD)")
	}
	bangkok := time.FixedZone("Asia/Bangkok", 7*60*60)
	now := time.Now().In(bangkok)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if incident.After(today) {
		return "", time.Time{}, "", "", errors.New("วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต")
	}
	description, err := cleanStudentReportText(in.Description, 2000, true)
	if err != nil {
		return "", time.Time{}, "", "", err
	}
	impact, err := cleanStudentReportText(in.Impact, 2000, false)
	if err != nil {
		return "", time.Time{}, "", "", err
	}
	return category, incident, description, impact, nil
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
	reporterID, ok := studentID.(uint)
	if !ok || reporterID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}
	var in StudentCreateReportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}
	category, incident, description, impact, err := validateStudentReportInput(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	app, ok := database.ApplicationByID(in.ApplicationID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบใบสมัคร"})
		return
	}
	if app.Status != models.AppAccepted {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รายงานได้เฉพาะ Lab Boy ที่ได้รับการยืนยันในรายวิชานี้"})
		return
	}
	if app.StudentID == reporterID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถรายงานตนเองได้"})
		return
	}
	rep := models.LabBoyReport{
		ApplicationID: app.ID,
		StudentID:     app.StudentID,
		CourseID:      app.CourseID,
		ReporterID:    reporterID,
		IncidentDate:  incident,
		Category:      category,
		Description:   description,
		Impact:        impact,
	}
	if err := database.CreateSubmittedPeerReport(&rep); err != nil {
		switch {
		case errors.Is(err, database.ErrDuplicateReport):
			c.JSON(http.StatusConflict, gin.H{"error": "มีรายงานเหตุการณ์ประเภทนี้ของนักศึกษาคนนี้ในวันเดียวกันอยู่แล้ว"})
		case errors.Is(err, database.ErrPeerReporterNotAccepted):
			c.JSON(http.StatusForbidden, gin.H{"error": "ส่งรายงานได้เฉพาะนักศึกษาที่เป็น Lab Boy ที่ได้รับการยืนยันในรายวิชาเดียวกัน"})
		case errors.Is(err, database.ErrPeerTargetNotAccepted):
			c.JSON(http.StatusBadRequest, gin.H{"error": "รายงานได้เฉพาะ Lab Boy ที่ได้รับการยืนยันในรายวิชาเดียวกัน"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างรายงานได้"})
		}
		return
	}
	saved, _ := database.ReportByID(rep.ID)
	c.JSON(http.StatusCreated, saved)
}
