package student

import (
	"labassist/database"
	"net/http"

	"github.com/gin-gonic/gin"
)

// WorkSchedule godoc
// @Summary      ตารางปฏิบัติงาน Lab Boy
// @Description  รายการวันปฏิบัติงานทั้งหมด ดึงจากเอกสารที่เจ้าหน้าที่สร้างไว้สำหรับ course ที่นักศึกษาได้รับการคัดเลือก
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   database.WorkSession
// @Router       /student/work-schedule [get]
func (h *Handler) WorkSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sessions := database.WorkScheduleForStudent(studentID.(uint))
	c.JSON(http.StatusOK, sessions)
}
