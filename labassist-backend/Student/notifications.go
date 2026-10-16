package student

import (
	"labassist/database"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MyNotifications godoc
// @Summary      รายการแจ้งเตือนของนักศึกษา
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.Notification
// @Router       /student/notifications [get]
func (h *Handler) MyNotifications(c *gin.Context) {
	userID, _ := c.Get("user_id")
	notifs, err := database.UserNotifications(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
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
func (h *Handler) MarkRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))
	if err := database.MarkNotifRead(uint(id), userID.(uint)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarkAllRead godoc
// @Summary      ทำเครื่องหมายแจ้งเตือนทั้งหมดว่าอ่านแล้ว
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]bool
// @Router       /student/notifications/read-all [put]
func (h *Handler) MarkAllRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	if err := database.MarkAllNotifsRead(userID.(uint)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
