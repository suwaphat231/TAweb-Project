package admin

import (
	"net/http"
	"strconv"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// ListYearHolidays godoc
// @Summary วันหยุดทั้งหมดในปี ค.ศ. ที่ระบุ (ทุกแหล่งที่มา) สำหรับปฏิทินของแอดมิน
// @Tags admin
// @Produce json
// @Security BearerAuth
// @Param year query int true "ปี ค.ศ. เช่น 2026"
// @Success 200 {array} models.CalendarDate
// @Router /admin/calendar/holidays [get]
func (h *Handler) ListYearHolidays(c *gin.Context) {
	year, err := strconv.Atoi(c.Query("year"))
	if err != nil || year < 1900 || year > 2200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	rows, err := database.ListHolidaysInYear(year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []models.CalendarDate{}
	}
	c.JSON(http.StatusOK, rows)
}
