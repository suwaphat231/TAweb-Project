package admin

import (
	"errors"
	"labassist/database"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RejectCourseEditRequestBody carries the reason shown to the instructor.
type RejectCourseEditRequestBody struct {
	Reason string `json:"reason" example:"เวลาเรียนไม่ตรงกับตารางสอนของคณะ"`
}

// CourseEditRequests godoc
// @Summary      รายการคำขอแก้ไขรายละเอียดวิชาจากอาจารย์
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "pending | approved | rejected"
// @Success      200  {array}  models.CourseEditRequest
// @Router       /admin/course-edit-requests [get]
func (h *Handler) CourseEditRequests(c *gin.Context) {
	list, err := database.ListCourseEditRequests(0, c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, list)
}

// ApproveCourseEditRequest godoc
// @Summary      อนุมัติคำขอแก้ไข — นำรายละเอียดใหม่ไปใช้กับวิชาทันที
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Edit request ID"
// @Success      200  {object}  models.CourseEditRequest
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /admin/course-edit-requests/{id}/approve [post]
func (h *Handler) ApproveCourseEditRequest(c *gin.Context) {
	h.reviewCourseEditRequest(c, true, "")
}

// RejectCourseEditRequest godoc
// @Summary      ปฏิเสธคำขอแก้ไข
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                          true  "Edit request ID"
// @Param        body  body  RejectCourseEditRequestBody  false "เหตุผล"
// @Success      200  {object}  models.CourseEditRequest
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /admin/course-edit-requests/{id}/reject [post]
func (h *Handler) RejectCourseEditRequest(c *gin.Context) {
	var body RejectCourseEditRequestBody
	_ = c.ShouldBindJSON(&body)
	h.reviewCourseEditRequest(c, false, strings.TrimSpace(body.Reason))
}

func (h *Handler) reviewCourseEditRequest(c *gin.Context, approve bool, reason string) {
	id, _ := strconv.Atoi(c.Param("id"))
	req, err := database.ReviewCourseEditRequest(uint(id), c.GetUint("user_id"), approve, reason)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบคำขอแก้ไข"})
	case errors.Is(err, database.ErrEditRequestNotPending):
		c.JSON(http.StatusConflict, gin.H{"error": "คำขอนี้ถูกพิจารณาหรือยกเลิกไปแล้ว"})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	default:
		c.JSON(http.StatusOK, req)
	}
}
