package student

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"labassist/database"

	"github.com/gin-gonic/gin"
)

var allowedScheduleExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true,
}

// UploadClassSchedule godoc
// @Summary      อัปโหลดรูปตารางเรียนประกอบ (หลักฐานสำหรับอาจารย์)
// @Description  บันทึกรูปภาพเป็นหลักฐานประกอบเท่านั้น ไม่เรียก OCR และไม่เขียนทับช่วงเวลาที่นักศึกษากรอก
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "รูปตารางเรียน (PNG/JPG)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]string
// @Router       /student/profile/class-schedule [post]
func (h *Handler) UploadClassSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

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

	// Store only the image — no OCR call, no slots written.
	// Slot data lives in term_schedules (entered manually by the student).
	cs, err := database.UpsertClassSchedule(sid, fileHeader.Filename, imageBytes, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         cs.ID,
		"file_name":  cs.FileName,
		"updated_at": cs.UpdatedAt,
	})
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
