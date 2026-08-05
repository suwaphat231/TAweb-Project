package teacher

import (
	"fmt"
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// acceptanceNotification builds the "you got in" notification for a student
// whose Lab Boy application was just accepted — shared by Review/BulkReview
// (sent the instant an application is accepted) and NotifyCourse (a manual
// re-send-to-everyone-accepted action).
func acceptanceNotification(app models.Application, course models.Course) models.Notification {
	cid := course.ID
	return models.Notification{
		UserID:   app.StudentID,
		CourseID: &cid,
		Title:    fmt.Sprintf("ผลการคัดเลือก Lab Boy — %s", course.Code),
		Body:     fmt.Sprintf("คุณผ่านการคัดเลือกเป็น Lab Boy วิชา %s (%s) ภาค %s/%d", course.Title, course.Code, course.Semester, course.AcademicYear),
	}
}

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
		notifs = append(notifs, acceptanceNotification(app, course))
	}

	sent := database.CreateNotifications(notifs)
	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// MyNotifications godoc
// @Summary      รายการแจ้งเตือนของอาจารย์
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.Notification
// @Router       /instructor/notifications [get]
func (h *Handler) MyNotifications(c *gin.Context) {
	userID, _ := c.Get("user_id")
	notifs := database.UserNotifications(userID.(uint))
	c.JSON(http.StatusOK, notifs)
}

// MarkRead godoc
// @Summary      ทำเครื่องหมายแจ้งเตือนว่าอ่านแล้ว
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Notification ID"
// @Success      200  {object}  map[string]bool
// @Router       /instructor/notifications/{id}/read [put]
func (h *Handler) MarkRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	database.MarkNotifRead(uint(id), userID.(uint))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarkAllRead godoc
// @Summary      ทำเครื่องหมายแจ้งเตือนทั้งหมดว่าอ่านแล้ว
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]bool
// @Router       /instructor/notifications/read-all [put]
func (h *Handler) MarkAllRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	database.MarkAllNotifsRead(userID.(uint))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
