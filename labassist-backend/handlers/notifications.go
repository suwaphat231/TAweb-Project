package handlers

import (
	"fmt"
	"labassist/models"
	"labassist/store"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type NotificationHandler struct{}

func NewNotificationHandler() *NotificationHandler { return &NotificationHandler{} }

// NotifyCourse godoc
// @Summary      ส่งแจ้งเตือนนักศึกษาที่ผ่านการคัดเลือก
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Course ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      403  {object}  ErrorResponse
// @Failure      404  {object}  ErrorResponse
// @Router       /instructor/courses/{id}/notify [post]
func (h *NotificationHandler) NotifyCourse(c *gin.Context) {
	instructorID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	courseID, _ := strconv.Atoi(c.Param("id"))

	course, ok := store.CourseByID(uint(courseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if role.(string) != "admin" && course.InstructorID != instructorID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	accepted := store.AcceptedStudentsForCourse(uint(courseID))
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

	sent := store.CreateNotifications(notifs)
	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// MyNotifications godoc
// @Summary      รายการแจ้งเตือนของนักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.Notification
// @Router       /student/notifications [get]
func (h *NotificationHandler) MyNotifications(c *gin.Context) {
	userID, _ := c.Get("user_id")
	notifs := store.UserNotifications(userID.(uint))
	c.JSON(http.StatusOK, notifs)
}

// MarkRead godoc
// @Summary      ทำเครื่องหมายแจ้งเตือนว่าอ่านแล้ว
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Notification ID"
// @Success      200  {object}  map[string]bool
// @Router       /student/notifications/{id}/read [put]
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	store.MarkNotifRead(uint(id), userID.(uint))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarkAllRead godoc
// @Summary      ทำเครื่องหมายแจ้งเตือนทั้งหมดว่าอ่านแล้ว
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]bool
// @Router       /student/notifications/read-all [put]
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	store.MarkAllNotifsRead(userID.(uint))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
