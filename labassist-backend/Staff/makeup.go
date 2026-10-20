package staff

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// staffMakeupRequest is the body for choosing a makeup day on the
// instructor's behalf.
type staffMakeupRequest struct {
	Date      string `json:"date" binding:"required"`       // YYYY-MM-DD
	StartTime string `json:"start_time" binding:"required"` // HH:MM
	EndTime   string `json:"end_time" binding:"required"`   // HH:MM
}

// ListCaseMakeupDays godoc
// @Summary วันทำงานที่ชนวันหยุดของ Staff Case พร้อมสถานะวันชดเชย
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

func respondMakeupError(c *gin.Context, err error) {
	if msg := database.MakeupErrorText(err); msg != "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": msg})
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "occurrence not found"})
		return
	}
	log.Printf("makeup decision: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

// StaffChooseMakeupDay godoc
// @Summary เจ้าหน้าที่เลือกวันชดเชยแทนอาจารย์
// @Description กฎเดียวกับฝั่งอาจารย์ — แจ้งเตือน Lab Boy ในกลุ่มและอาจารย์ผู้สอน
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Occurrence ID (วันที่ชนวันหยุด)"
// @Param body body staffMakeupRequest true "วันและเวลาชดเชย"
// @Success 201 {object} models.WorkOccurrence
// @Failure 422 {object} handlers.ErrorResponse
// @Router /staff/occurrences/{id}/makeup [post]
func (h *Handler) StaffChooseMakeupDay(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body staffMakeupRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	date, err := time.Parse("2006-01-02", body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date; use YYYY-MM-DD"})
		return
	}
	actorID := c.GetUint("user_id")
	clash, makeup, err := database.ChooseMakeupDay(uint(id), date, body.StartTime, body.EndTime, actorID)
	if err != nil {
		respondMakeupError(c, err)
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &clash.StaffCaseID, EntityType: "work_occurrence", EntityID: clash.ID,
		Action: "makeup_chosen_by_staff", ActorID: actorID, NewValue: body.Date + " " + body.StartTime + "-" + body.EndTime,
	})
	database.CreateNotifications(database.MakeupNotifications(clash, &makeup, true))
	c.JSON(http.StatusCreated, makeup)
}

// StaffDeclineMakeupDay godoc
// @Summary เจ้าหน้าที่กำหนดว่าไม่ชดเชยแทนอาจารย์
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Occurrence ID (วันที่ชนวันหยุด)"
// @Success 200 {object} models.WorkOccurrence
// @Failure 422 {object} handlers.ErrorResponse
// @Router /staff/occurrences/{id}/no-makeup [post]
func (h *Handler) StaffDeclineMakeupDay(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	actorID := c.GetUint("user_id")
	clash, err := database.DeclineMakeupDay(uint(id), actorID)
	if err != nil {
		respondMakeupError(c, err)
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &clash.StaffCaseID, EntityType: "work_occurrence", EntityID: clash.ID,
		Action: "no_makeup_by_staff", ActorID: actorID,
	})
	database.CreateNotifications(database.MakeupNotifications(clash, nil, true))
	c.JSON(http.StatusOK, clash)
}
