package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"maps"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"
	"labassist/ocrjob"

	"github.com/gin-gonic/gin"
)

// maxTranscriptImageSize caps a grade-sheet upload at 10MB.
const maxTranscriptImageSize = 10 << 20

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

// UploadTranscript godoc
// @Summary      แนบไฟล์ใบเกรดเพื่อให้ระบบ OCR อ่านและบันทึกผล
// @Description  ระบบจะอ่านเกรดเฉพาะรายวิชาที่กำหนดในระบบของสาขานักศึกษา OCR ทำงานเบื้องหลัง
// @Description  เมื่อเสร็จจะแจ้ง event "ocr_finished" ทาง WebSocket และดูสถานะได้ที่ /student/profile/ocr-jobs
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "ไฟล์ใบเกรด (PNG/JPG/PDF)"
// @Success      202   {object}  OCRJobAccepted
// @Failure      400   {object}  ErrorResponse
// @Failure      409   {object}  ErrorResponse
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

	if fileHeader.Size > maxTranscriptImageSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไฟล์ใหญ่เกิน 10MB"})
		return
	}
	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์ได้"})
		return
	}
	defer src.Close()
	// Read the file once: it goes to the OCR service and, after a successful
	// read, is kept so the student can compare it with the grades.
	fileData, err := io.ReadAll(io.LimitReader(src, maxTranscriptImageSize+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์ได้"})
		return
	}

	// The OCR can take minutes, so it runs as a background job: the student
	// may leave the page, and is told over WebSocket when the grades are in.
	fileName := fileHeader.Filename
	started := ocrjob.Start(sid, ocrjob.Transcript, func() error {
		return h.processTranscript(sid, fileName, ext, fileData, coreCourses, string(courseCodesJSON))
	})
	if !started {
		c.JSON(http.StatusConflict, gin.H{"error": "กำลังอ่านใบเกรดที่อัปโหลดก่อนหน้าอยู่ กรุณารอให้เสร็จก่อน"})
		return
	}
	c.JSON(http.StatusAccepted, OCRJobAccepted{Status: ocrjob.StatusProcessing})
}

// OCRJobAccepted answers an upload whose OCR now runs in the background.
type OCRJobAccepted struct {
	Status string `json:"status" example:"processing"`
}

// processTranscript sends the grade sheet to the OCR service and saves the
// grades it read. Its error is shown to the student as is.
func (h *AuthHandler) processTranscript(sid uint, fileName, ext string, fileData []byte, coreCourses []models.CoreCourse, courseCodesJSON string) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	internalErr := errors.New("เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง")
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return internalErr
	}
	if _, err := part.Write(fileData); err != nil {
		return internalErr
	}
	if err := writer.WriteField("criteria_json", "[]"); err != nil {
		return internalErr
	}
	if err := writer.WriteField("course_codes_json", courseCodesJSON); err != nil {
		return internalErr
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, h.cfg.OCRServiceURL+"/api/ocr/process-transcript", &body)
	if err != nil {
		return internalErr
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("ไม่สามารถติดต่อบริการ OCR ได้ กรุณาลองใหม่อีกครั้ง")
	}
	defer resp.Body.Close()

	// Reject non-2xx before attempting to decode as a success payload.
	// FastAPI error responses are {"detail":"..."} — surface that message when
	// available so the caller knows what went wrong, but never write to the DB.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errBody struct {
			Detail string `json:"detail"`
		}
		if jsonErr := json.NewDecoder(resp.Body).Decode(&errBody); jsonErr == nil && errBody.Detail != "" {
			return fmt.Errorf("บริการ OCR แจ้งข้อผิดพลาด: %s", errBody.Detail)
		}
		return fmt.Errorf("บริการ OCR ตอบกลับ HTTP %d", resp.StatusCode)
	}

	var ocrResult ocrResponse
	if err := json.NewDecoder(resp.Body).Decode(&ocrResult); err != nil {
		return errors.New("บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง")
	}

	// A proxy or misconfigured service might return 200 with a non-OCR body
	// that decodes without error but leaves Status empty.
	if ocrResult.Status == "" {
		return errors.New("บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง")
	}

	contentType := http.DetectContentType(fileData)
	if ext == ".pdf" {
		contentType = "application/pdf"
	}
	if err := database.SaveTranscriptImage(sid, fileName, contentType, fileData); err != nil {
		// The grades are still useful without the stored copy.
		log.Printf("save transcript image for user %d: %v", sid, err)
	}

	now := time.Now()
	_, ok := database.UpdateUser(sid, func(u *models.User) {
		// Keep only grades belonging to a course in the catalog. The OCR
		// service already filters by the codes we sent, but a course could
		// have been removed from the catalog between the request and the
		// response, and this also drops anything the service returned unasked.
		//
		// A student's transcript photo/PDF rarely covers every semester at
		// once, so each upload only surfaces the courses on that particular
		// page. Merge onto what's already on file (this upload's grade wins on
		// a repeat code, in case the earlier OCR read it wrong) instead of
		// overwriting, so a course confirmed by an earlier upload doesn't drop
		// off just because the latest file doesn't happen to show it.
		allGrades := make(models.StringMap, len(u.TranscriptGrades)+len(coreCourses))
		maps.Copy(allGrades, u.TranscriptGrades)
		ocrGrades := make(models.StringMap, len(u.TranscriptOcrGrades)+len(coreCourses))
		maps.Copy(ocrGrades, u.TranscriptOcrGrades)
		for _, cc := range coreCourses {
			if grade, found := ocrResult.ExtractedData[cc.Code]; found {
				allGrades[cc.Code] = grade
				ocrGrades[cc.Code] = grade
			}
		}
		u.TranscriptGrades = allGrades
		u.TranscriptOcrGrades = ocrGrades
		// A new reading has to be checked by the student again.
		u.TranscriptConfirmedAt = nil
		status := ocrResult.Status
		u.TranscriptStatus = &status
		message := ocrResult.Message
		u.TranscriptMessage = &message
		confidence := ocrResult.ConfidenceScore
		u.TranscriptConfidence = &confidence
		u.TranscriptUpdatedAt = &now
	})
	if !ok {
		return errors.New("บันทึกผลการอ่านเกรดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
	}
	return nil
}

// validTranscriptGrades are the letter grades a student may enter by hand.
var validTranscriptGrades = map[string]bool{
	"A": true, "B+": true, "B": true, "C+": true, "C": true, "D+": true, "D": true,
}

// ConfirmTranscriptGradesBody is the student's checked grades, keyed by
// course code. Only courses already read from a transcript may be sent.
type ConfirmTranscriptGradesBody struct {
	Grades map[string]string `json:"grades" binding:"required"`
}

// ConfirmTranscriptGrades godoc
// @Summary      ยืนยันหรือแก้ไขเกรดที่ระบบ OCR อ่านได้
// @Description  เกรดที่แก้ต่างจากที่ OCR อ่านได้จะถูกแจ้งให้อาจารย์เห็นตอนสมัคร
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  ConfirmTranscriptGradesBody  true  "เกรดรายวิชา"
// @Success      200   {object}  models.User
// @Failure      400   {object}  ErrorResponse
// @Router       /student/profile/transcript/confirm [put]
func (h *AuthHandler) ConfirmTranscriptGrades(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	var body ConfirmTranscriptGradesBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลเกรดไม่ถูกต้อง"})
		return
	}
	user, ok := database.UserByID(sid)
	if !ok || len(user.TranscriptGrades) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาอัปโหลดใบเกรดก่อน"})
		return
	}
	grades := make(models.StringMap, len(user.TranscriptGrades))
	maps.Copy(grades, user.TranscriptGrades)
	for code, grade := range body.Grades {
		grade = strings.ToUpper(strings.TrimSpace(grade))
		current, onFile := grades[code]
		if !onFile {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("ไม่พบวิชา %s ในใบเกรดที่อัปโหลด", code)})
			return
		}
		// An unchanged grade is confirmed as is, even one OCR read in an
		// unusual form; only hand-entered grades must be a known letter.
		if grade != current && !validTranscriptGrades[grade] {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("เกรด '%s' ของวิชา %s ไม่ถูกต้อง", grade, code)})
			return
		}
		grades[code] = grade
	}

	now := time.Now()
	updated, ok := database.UpdateUser(sid, func(u *models.User) {
		u.TranscriptGrades = grades
		u.TranscriptConfirmedAt = &now
	})
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกเกรดไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, database.WithTranscriptCourseTitles(updated))
}

// TranscriptImages godoc
// @Summary      รายการไฟล์ใบเกรดที่เคยอัปโหลดให้ OCR อ่าน
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.TranscriptImage
// @Router       /student/profile/transcript/images [get]
func (h *AuthHandler) TranscriptImages(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	list, err := database.TranscriptImagesForUser(studentID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, list)
}

// TranscriptImageFile godoc
// @Summary      เปิดไฟล์ใบเกรดที่เคยอัปโหลด
// @Tags         student
// @Security     BearerAuth
// @Param        id  path  int  true  "Image ID"
// @Success      200  {file}  binary
// @Failure      404  {object}  ErrorResponse
// @Router       /student/profile/transcript/images/{id} [get]
func (h *AuthHandler) TranscriptImageFile(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	img, ok := database.TranscriptImageForUser(uint(id), studentID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบไฟล์ใบเกรด"})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, img.FileName))
	c.Header("Cache-Control", "private, max-age=3600")
	c.Data(http.StatusOK, img.ContentType, img.FileData)
}
