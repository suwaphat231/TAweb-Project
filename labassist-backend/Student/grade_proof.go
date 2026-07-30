package student

import (
	"io"
	"net/http"
	"strconv"

	"labassist/database"

	"github.com/gin-gonic/gin"
)

// maxGradeProofSize caps the uploaded grade image at 5MB — generous for a
// phone screenshot of MyReg while keeping a single bytea row reasonable.
const maxGradeProofSize = 5 << 20

// UploadGradeProof godoc
// @Summary      แนบรูปภาพเกรดยืนยันสำหรับใบสมัคร
// @Description  ใช้เมื่อวิชานั้นเปิดให้ต้องแนบรูปเกรด (require_grade_proof) — อัปโหลดซ้ำจะแทนที่รูปเดิม
// @Tags         student
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int   true  "Application ID"
// @Param        file  formData  file  true  "รูปภาพเกรด (.jpg, .jpeg, .png, ไม่เกิน 5MB)"
// @Success      200   {object}  models.Application
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/grade-proof [post]
func (h *Handler) UploadGradeProof(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	if fileHeader.Size > maxGradeProofSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file exceeds 5MB limit"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot open uploaded file"})
		return
	}
	defer f.Close()

	data := make([]byte, fileHeader.Size)
	if _, err := io.ReadFull(f, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot read uploaded file"})
		return
	}
	// http.DetectContentType only inspects the first 512 bytes, so this is a
	// cheap sanity check that the file is actually an image.
	contentType := http.DetectContentType(data)
	if contentType != "image/jpeg" && contentType != "image/png" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .jpg and .png images are allowed"})
		return
	}

	updated, ok := database.SetApplicationGradeProof(uint(id), fileHeader.Filename, data)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// GetGradeProof godoc
// @Summary      ดูรูปภาพเกรดที่แนบไว้ (ของตัวเอง)
// @Tags         student
// @Produce      image/*
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {file}    file
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/grade-proof [get]
func (h *Handler) GetGradeProof(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	fileName, data, ok := database.ApplicationGradeProofData(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no grade proof uploaded yet"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="`+fileName+`"`)
	c.Data(http.StatusOK, http.DetectContentType(data), data)
}
