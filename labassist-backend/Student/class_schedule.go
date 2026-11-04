package student

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

var allowedScheduleExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true,
}

// UploadClassSchedule godoc
// @Summary      อัปโหลดรูปตารางเรียนและให้ OCR อ่านช่วงเวลาเรียน
// @Description  ต้องยินยอม PDPA (consent=true) ระบบเก็บรูปไว้เป็นหลักฐาน แล้วอ่านช่วงเวลาเรียนเป็นร่างให้นักศึกษาตรวจและแก้ไข
// @Description  ถ้า OCR อ่านไม่ได้ จะยังเก็บรูปไว้และตอบ ocr_error กลับมา นักศึกษากรอกช่วงเวลาเองได้
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file     formData  file    true  "รูปตารางเรียน (PNG/JPG)"
// @Param        consent  formData  string  true  "ยินยอม PDPA ต้องเป็น true"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]string
// @Router       /student/profile/class-schedule [post]
func (h *Handler) UploadClassSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	if c.PostForm("consent") != "true" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณายินยอมให้ระบบเก็บและประมวลผลรูปตารางเรียนก่อนอัปโหลด"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedScheduleExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("ไม่รองรับไฟล์นามสกุล '%s' กรุณาอัปโหลดไฟล์ PNG หรือ JPG เท่านั้น", ext)})
		return
	}

	if fileHeader.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไฟล์ขนาดใหญ่เกินไป กรุณาอัปโหลดไฟล์ไม่เกิน 10 MB"})
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์ได้"})
		return
	}
	defer src.Close()

	imageBytes, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	// The slots are only a draft: the student checks them and saves through
	// the term schedule, so a failed OCR leaves the image stored and nothing else.
	slots, ocrErr := h.readScheduleSlots(fileHeader.Filename, imageBytes)
	if ocrErr != nil {
		log.Printf("read class schedule for user %d: %v", sid, ocrErr)
		slots = nil
	}

	cs, err := database.UpsertClassSchedule(sid, fileHeader.Filename, imageBytes, slots, time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ"})
		return
	}

	resp := gin.H{
		"id":         cs.ID,
		"file_name":  cs.FileName,
		"updated_at": cs.UpdatedAt,
		"slots":      cs.Slots,
	}
	if ocrErr != nil {
		resp["ocr_error"] = "ระบบอ่านช่วงเวลาจากรูปไม่ได้ กรุณากรอกเองในตารางด้านล่าง"
	}
	c.JSON(http.StatusOK, resp)
}

// readScheduleSlots sends the timetable image to the OCR service and returns
// the day/time slots it found. The caller decides how to report a failure.
func (h *Handler) readScheduleSlots(fileName string, imageBytes []byte) ([]models.ScheduleSlot, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, err
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, h.cfg.OCRServiceURL+"/api/ocr/process-schedule", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.New("ไม่สามารถติดต่อบริการ OCR ได้")
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("บริการ OCR ตอบกลับ HTTP %d", resp.StatusCode)
	}

	var result struct {
		Slots []models.ScheduleSlot `json:"slots"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, errors.New("บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง")
	}
	// An image OCR cannot read gives no slots; report it so the student is not left with an empty draft.
	if len(result.Slots) == 0 {
		return nil, errors.New("ไม่พบช่วงเวลาเรียนในรูป")
	}
	return result.Slots, nil
}

// GetClassSchedule godoc
// @Summary      ดูข้อมูลรูปตารางเรียนที่แนบไว้
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.ClassSchedule
// @Failure      404  {object}  map[string]string
// @Router       /student/profile/class-schedule [get]
func (h *Handler) GetClassSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	cs, ok := database.ClassScheduleByUserID(studentID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ยังไม่มีรูปตารางเรียน"})
		return
	}
	c.JSON(http.StatusOK, cs)
}

// GetClassScheduleImage godoc
// @Summary      ดาวน์โหลดรูปตารางเรียนที่อัปโหลดไว้
// @Tags         student
// @Produce      image/jpeg
// @Security     BearerAuth
// @Success      200  {file}   binary
// @Failure      404  {object} map[string]string
// @Router       /student/profile/class-schedule/file [get]
func (h *Handler) GetClassScheduleImage(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	fileName, data, ok := database.ClassScheduleImageByUserID(studentID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรูปตารางเรียน"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	contentType := "image/jpeg"
	if ext == ".png" {
		contentType = "image/png"
	}
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, fileName))
	c.Data(http.StatusOK, contentType, data)
}
