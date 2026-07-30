package teacher

import (
	"fmt"
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// NotifyCourse godoc
// @Summary      ส่งแจ้งเตือนนักศึกษาที่ผ่านการคัดเลือก
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Course ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/notify [post]
func (h *Handler) NotifyCourse(c *gin.Context) {
	courseID, _ := strconv.Atoi(c.Param("id"))

	course, ok := database.CourseByID(uint(courseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	accepted := database.AcceptedStudentsForCourse(uint(courseID))
	if len(accepted) == 0 {
		c.JSON(http.StatusOK, gin.H{"sent": 0, "message": "ไม่มีนักศึกษาที่ผ่านการคัดเลือก"})
		return
	}

	notifs := make([]models.Notification, 0, len(accepted))
	for _, app := range accepted {
		roleLabel := "TA"
		if app.RoleApplied == models.RoleLabBoy {
			roleLabel = "Lab Boy"
		}
		cid := uint(courseID)
		notifs = append(notifs, models.Notification{
			UserID:   app.StudentID,
			CourseID: &cid,
			Title:    fmt.Sprintf("ผลการคัดเลือก%s — %s", roleLabel, course.Code),
			Body:     fmt.Sprintf("คุณผ่านการคัดเลือกเป็น%s วิชา %s (%s) ภาค %s/%d", roleLabel, course.Title, course.Code, course.Semester, course.AcademicYear),
		})
	}

	sent := database.CreateNotifications(notifs)
	c.JSON(http.StatusOK, gin.H{"sent": sent})
}
