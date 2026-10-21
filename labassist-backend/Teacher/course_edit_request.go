package teacher

import (
	"errors"
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// CourseEditRequestBody is the proposed meeting time. Instructors may only
// change the schedule; the name and credits are copied from the course so the
// admin still sees the full end result.
type CourseEditRequestBody struct {
	Schedule string `json:"schedule" binding:"required" example:"Tu 13:00 - 16:00"`
	Note     string `json:"note" example:"เวลาเรียนในไฟล์ Excel ไม่ตรงกับที่สอนจริง"`
}

// RequestCourseEdit godoc
// @Summary      ส่งคำขอแก้ไขเวลาเรียนให้แอดมินอนุมัติ
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                    true  "Course ID"
// @Param        body  body  CourseEditRequestBody  true  "เวลาเรียนที่ต้องการ"
// @Success      201   {object}  models.CourseEditRequest
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/edit-requests [post]
func (h *Handler) RequestCourseEdit(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body CourseEditRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกเวลาเรียน"})
		return
	}
	body.Schedule = strings.TrimSpace(body.Schedule)
	if body.Schedule == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกเวลาเรียน"})
		return
	}
	// Each course row is one meeting day; another day is another course.
	if len(database.SplitScheduleDays(body.Schedule)) != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "วิชาหนึ่งแถวมีวันเรียนได้วันเดียว"})
		return
	}
	// Only the time may change — the meeting day stays as imported.
	if day := database.ScheduleWeekday(course.Schedule); day != "" && database.ScheduleWeekday(body.Schedule) != day {
		c.JSON(http.StatusBadRequest, gin.H{"error": "แก้ไขได้เฉพาะเวลาเรียน ไม่สามารถเปลี่ยนวันเรียนได้"})
		return
	}
	if body.Schedule == course.Schedule {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ยังไม่มีการเปลี่ยนแปลงเวลาเรียน"})
		return
	}

	userID, _ := c.Get("user_id")
	req, err := database.CreateCourseEditRequest(models.CourseEditRequest{
		CourseID:     course.ID,
		RequestedBy:  userID.(uint),
		Title:        course.Title,
		EnglishTitle: course.EnglishTitle,
		Credits:      course.Credits,
		Schedule:     body.Schedule,
		Note:         strings.TrimSpace(body.Note),
	})
	if errors.Is(err, database.ErrEditRequestPending) {
		c.JSON(http.StatusConflict, gin.H{"error": "วิชานี้มีคำขอแก้ไขที่รอแอดมินอนุมัติอยู่แล้ว"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save edit request"})
		return
	}
	c.JSON(http.StatusCreated, req)
}

// MyCourseEditRequests godoc
// @Summary      คำขอแก้ไขรายละเอียดวิชาของฉัน
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.CourseEditRequest
// @Router       /instructor/course-edit-requests [get]
func (h *Handler) MyCourseEditRequests(c *gin.Context) {
	userID, _ := c.Get("user_id")
	list, err := database.ListCourseEditRequests(userID.(uint), "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, list)
}

// CancelCourseEditRequest godoc
// @Summary      ยกเลิกคำขอแก้ไขที่ยังรออนุมัติ
// @Tags         instructor
// @Security     BearerAuth
// @Param        id  path  int  true  "Edit request ID"
// @Success      204
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /instructor/course-edit-requests/{id} [delete]
func (h *Handler) CancelCourseEditRequest(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID, _ := c.Get("user_id")
	err := database.CancelCourseEditRequest(uint(id), userID.(uint))
	if errors.Is(err, database.ErrEditRequestNotPending) {
		c.JSON(http.StatusConflict, gin.H{"error": "คำขอนี้ถูกพิจารณาแล้วหรือไม่พบคำขอ"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.Status(http.StatusNoContent)
}
