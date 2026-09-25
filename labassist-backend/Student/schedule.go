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

// LabBoyAssignments godoc
// @Summary      รายวิชาที่นักศึกษาได้รับเลือกเป็น Lab Boy และอาจารย์ยืนยันตารางแล้ว
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   database.LabBoyAssignment
// @Router       /student/labboy-assignments [get]
func (h *Handler) LabBoyAssignments(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	assignments := database.LabBoyAssignmentsForStudent(studentID.(uint))
	c.JSON(http.StatusOK, assignments)
}
