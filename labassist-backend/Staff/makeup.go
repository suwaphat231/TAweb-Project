package staff

import (
	"log"
	"net/http"
	"strconv"

	"labassist/database"

	"github.com/gin-gonic/gin"
)

// ListCaseMakeupDays godoc
// @Summary วันทำงานที่ชนวันหยุดของ Staff Case พร้อมสถานะวันชดเชย (ดูอย่างเดียว — อาจารย์เป็นผู้เลือกวันชดเชย)
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} database.MakeupDay
// @Router /staff/cases/{id}/makeup-days [get]
func (h *Handler) ListCaseMakeupDays(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	days, err := database.MakeupDaysForCases([]uint{uint(id)})
	if err != nil {
		log.Printf("makeup days for case %d: %v", id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, days)
}
