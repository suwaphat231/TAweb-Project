package staff

import (
	"net/http"
	"strconv"

	"labassist/database"

	"github.com/gin-gonic/gin"
)

// TeachingPlan godoc
// @Summary วันและเวลาสอนที่อาจารย์บันทึกไว้ตอนเปิดรับสมัคร
// @Description ใช้เป็นตั้งต้นของแผนปฏิบัติงาน ว่างเมื่ออาจารย์ไม่ได้แก้ไขวันสอน
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param courseId path int true "Course ID"
// @Router /staff/courses/{courseId}/teaching-plan [get]
func (h *Handler) TeachingPlan(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return
	}
	rows, err := database.TeachingPlanForCourse(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	type item struct {
		Date      string `json:"date"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
	}
	out := make([]item, 0, len(rows))
	for _, r := range rows {
		out = append(out, item{Date: r.Date.Format("2006-01-02"), StartTime: r.StartTime, EndTime: r.EndTime})
	}
	c.JSON(http.StatusOK, out)
}
