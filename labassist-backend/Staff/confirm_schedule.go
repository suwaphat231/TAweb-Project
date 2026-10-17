package staff

import (
	"fmt"
	"log"
	"net/http"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// ConfirmSchedule godoc
// @Summary      ยืนยันตารางปฏิบัติงาน Lab Boy (เจ้าหน้าที่)
// @Description  เจ้าหน้าที่ยืนยันตารางปฏิบัติงานหลังอาจารย์รับ Lab Boy แล้ว: สร้าง Staff Case ให้ workflow เอกสารเริ่มได้ และแจ้งเตือนนักศึกษาที่ผ่านการคัดเลือก ยืนยันซ้ำได้โดยไม่แจ้งเตือนซ้ำ
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int  true  "Course ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /staff/courses/{courseId}/confirm-schedule [post]
func (h *Handler) ConfirmSchedule(c *gin.Context) {
	course, posting, ok := offering(c)
	if !ok {
		return
	}
	accepted, err := database.AcceptedStudentsForPosting(posting.ID)
	if err != nil {
		log.Printf("confirm schedule %d: %v", course.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if len(accepted) == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ยังไม่มีนักศึกษาที่อาจารย์รับเป็น Lab Boy"})
		return
	}

	staffID := c.GetUint("user_id")
	alreadyConfirmed := posting.LabBoyScheduleConfirmed
	if !alreadyConfirmed {
		if _, saved := database.UpdateCourse(course.ID, func(cs *models.Course) {
			cs.LabBoyScheduleConfirmed = true
		}); !saved {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save course"})
			return
		}
	}
	if _, err := database.EnsureStaffCase(posting.ID, course.ID, course.Semester, course.AcademicYear, staffID); err != nil {
		log.Printf("confirm schedule %d: ensure staff case: %v", course.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	notified := 0
	if !alreadyConfirmed {
		notifs := make([]models.Notification, 0, len(accepted))
		for _, app := range accepted {
			cid := course.ID
			notifs = append(notifs, models.Notification{
				UserID:   app.StudentID,
				CourseID: &cid,
				Title:    fmt.Sprintf("ตารางปฏิบัติงาน Lab Boy — %s", course.Code),
				Body:     fmt.Sprintf("เจ้าหน้าที่ยืนยันตารางปฏิบัติงานแล้ว กรุณาตรวจสอบตารางในระบบ วิชา %s (%s) ภาค %s/%d", course.Title, course.Code, course.Semester, course.AcademicYear),
			})
		}
		notified = database.CreateNotifications(notifs)
	}
	c.JSON(http.StatusOK, gin.H{"confirmed": true, "notified": notified, "accepted_count": len(accepted)})
}
