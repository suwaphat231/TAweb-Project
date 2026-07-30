package staff

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type reviewActionRequest struct {
	Note string `json:"note"`
}

// ListReviews godoc
// @Summary      รายการแบบฟอร์มที่รอตรวจสอบ (ทุก course ที่เปิดรับ Lab Boy)
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "pending | verified | returned"
// @Param        q       query  string  false  "ค้นหารหัสวิชา / อาจารย์"
// @Success      200  {array}   models.FormReview
// @Router       /staff/reviews [get]
func (h *Handler) ListReviews(c *gin.Context) {
	status := c.Query("status")
	search := c.Query("q")
	c.JSON(http.StatusOK, database.ListFormReviews(status, search))
}

// VerifyForm godoc
// @Summary      ยืนยันว่าแบบฟอร์มของ course นี้ผ่านการตรวจสอบ
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int  true  "Course ID"
// @Success      200  {object}  models.FormReview
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/reviews/{courseId}/verify [put]
func (h *Handler) VerifyForm(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid courseId"})
		return
	}
	if _, ok := database.CourseByID(uint(courseID)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	result := database.UpsertFormReview(uint(courseID), staffID.(uint), models.ReviewVerified, "")
	c.JSON(http.StatusOK, result)
}

// ReturnForm godoc
// @Summary      ส่งแบบฟอร์มกลับให้อาจารย์แก้ไข
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int                   true  "Course ID"
// @Param        body      body  reviewActionRequest   true  "หมายเหตุ"
// @Success      200  {object}  models.FormReview
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/reviews/{courseId}/return [put]
func (h *Handler) ReturnForm(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	courseID, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid courseId"})
		return
	}
	if _, ok := database.CourseByID(uint(courseID)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	var body reviewActionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Note == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note is required when returning a form"})
		return
	}
	result := database.UpsertFormReview(uint(courseID), staffID.(uint), models.ReviewReturned, body.Note)
	c.JSON(http.StatusOK, result)
}
