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

// UploadTranscript godoc
// @Summary      แนบไฟล์ใบเกรดเพื่อให้ระบบ OCR อ่านและบันทึกผล
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "ไฟล์ใบเกรด (PNG/JPG/PDF)"
// @Success      200   {object}  models.User
// @Failure      400   {object}  ErrorResponse
// @Failure      502   {object}  ErrorResponse
// @Router       /student/profile/transcript [post]
func (h *AuthHandler) UploadTranscript(c *gin.Context) {
	studentID, _ := c.Get("user_id")

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

	now := time.Now()
	updated, _ := database.UpdateUser(studentID.(uint), func(u *models.User) {
		u.TranscriptGrades = ocrResult.ExtractedData
		status := ocrResult.Status
		u.TranscriptStatus = &status
		message := ocrResult.Message
		u.TranscriptMessage = &message
		confidence := ocrResult.ConfidenceScore
		u.TranscriptConfidence = &confidence
		u.TranscriptUpdatedAt = &now
	})

	c.JSON(http.StatusOK, updated)
}
