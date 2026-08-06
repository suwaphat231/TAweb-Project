package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

var allowedTranscriptExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".pdf": true,
}

// ocrResponse mirrors labassist-ocr's OCRResponse schema.
type ocrResponse struct {
	Status          string            `json:"status"`
	Message         string            `json:"message"`
	ExtractedData   map[string]string `json:"extracted_data"`
	ConfidenceScore float64           `json:"confidence_score"`
}

// CourseGrade pairs one course from the core_courses catalog with the grade
// OCR found for it, so the client can show the Thai course title instead of a
// bare code. Grade is empty and Found is false when the course isn't on the
// transcript (not taken yet, or OCR couldn't read that row).
type CourseGrade struct {
	Code  string `json:"code" example:"517121"`
	Title string `json:"title" example:"ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1"`
	Grade string `json:"grade,omitempty" example:"A"`
	Found bool   `json:"found" example:"true"`
}

// TranscriptOCRResponse is the result of one transcript upload: the OCR
// verdict plus every core course of the student's program, matched up with
// the grades read off the file.
type TranscriptOCRResponse struct {
	Status     string        `json:"status" example:"pass"`
	Message    string        `json:"message"`
	Confidence float64       `json:"confidence_score" example:"0.92"`
	Program    string        `json:"program" example:"CS"`
	Courses    []CourseGrade `json:"courses"`
	UpdatedAt  time.Time     `json:"updated_at"`
	// User is the refreshed profile, kept so existing callers that read
	// transcript_grades off the user object keep working.
	User models.User `json:"user"`
}

// UploadTranscript godoc
// @Summary      แนบไฟล์ใบเกรดเพื่อให้ระบบ OCR อ่านและบันทึกผล
// @Description  ระบบจะอ่านเกรดเฉพาะรายวิชาในตาราง core_courses ของสาขานักศึกษา (ดู database/migrations/allcourse.sql)
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "ไฟล์ใบเกรด (PNG/JPG/PDF)"
// @Success      200   {object}  TranscriptOCRResponse
// @Failure      400   {object}  ErrorResponse
// @Failure      502   {object}  ErrorResponse
// @Router       /student/profile/transcript [post]
func (h *AuthHandler) UploadTranscript(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	user, ok := database.UserByID(sid)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบข้อมูลนักศึกษา"})
		return
	}

	// Which courses to look for: the catalog for this student's program.
	// An unrecognised/blank faculty falls back to every program's courses so
	// the upload still returns something useful.
	program := database.ProgramForFaculty(user.Faculty)
	coreCourses := database.CoreCoursesForProgram(program)
	if len(coreCourses) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ยังไม่ได้ตั้งค่ารายวิชาสำหรับตรวจเกรด กรุณาติดต่อผู้ดูแลระบบ"})
		return
	}

	courseCodes := make([]string, 0, len(coreCourses))
	for _, cc := range coreCourses {
		courseCodes = append(courseCodes, cc.Code)
	}
	courseCodesJSON, err := json.Marshal(courseCodes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedTranscriptExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("ไม่รองรับไฟล์นามสกุล '%s' กรุณาอัปโหลดไฟล์ PNG, JPG หรือ PDF เท่านั้น", ext)})
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์ได้"})
		return
	}
	defer src.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", fileHeader.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if _, err := io.Copy(part, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if err := writer.WriteField("criteria_json", "[]"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if err := writer.WriteField("course_codes_json", string(courseCodesJSON)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, h.cfg.OCRServiceURL+"/api/ocr/process-transcript", &body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "ไม่สามารถติดต่อบริการ OCR ได้ กรุณาลองใหม่อีกครั้ง"})
		return
	}
	defer resp.Body.Close()

	var ocrResult ocrResponse
	if err := json.NewDecoder(resp.Body).Decode(&ocrResult); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง"})
		return
	}

	// Keep only grades belonging to a course in the catalog. The OCR service
	// already filters by the codes we sent, but a course could have been
	// removed from allcourse.sql between the request and the response, and
	// this also drops anything the service returned unasked.
	courses := make([]CourseGrade, 0, len(coreCourses))
	matchedGrades := make(models.StringMap, len(coreCourses))
	for _, cc := range coreCourses {
		grade, found := ocrResult.ExtractedData[cc.Code]
		courses = append(courses, CourseGrade{
			Code:  cc.Code,
			Title: cc.Title,
			Grade: grade,
			Found: found,
		})
		if found {
			matchedGrades[cc.Code] = grade
		}
	}

	now := time.Now()
	updated, _ := database.UpdateUser(sid, func(u *models.User) {
		u.TranscriptGrades = matchedGrades
		status := ocrResult.Status
		u.TranscriptStatus = &status
		message := ocrResult.Message
		u.TranscriptMessage = &message
		confidence := ocrResult.ConfidenceScore
		u.TranscriptConfidence = &confidence
		u.TranscriptUpdatedAt = &now
	})

	c.JSON(http.StatusOK, TranscriptOCRResponse{
		Status:     ocrResult.Status,
		Message:    ocrResult.Message,
		Confidence: ocrResult.ConfidenceScore,
		Program:    program,
		Courses:    courses,
		UpdatedAt:  now,
		User:       updated,
	})
}
