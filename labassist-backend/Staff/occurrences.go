package staff

import (
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

type generateOccurrencesRequest struct {
	WeekDay   string `json:"week_day" binding:"required"`    // MON TUE WED THU FRI SAT SUN
	StartTime string `json:"start_time" binding:"required"`  // HH:MM
	EndTime   string `json:"end_time" binding:"required"`    // HH:MM
	StartDate string `json:"start_date" binding:"required"`  // YYYY-MM-DD
	EndDate   string `json:"end_date" binding:"required"`    // YYYY-MM-DD
}

// GenerateOccurrences godoc
// @Summary สร้างรายการวันทำงานจากตารางประจำสัปดาห์
// @Description แตกตารางรายสัปดาห์ออกเป็นรายการวันที่ทำงานจริง วันที่ตรงกับวันหยุดในระบบจะถูกตั้ง status=cancelled_holiday
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 201 {array} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/generate-occurrences [post]
func (h *Handler) GenerateOccurrences(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	var body generateOccurrencesRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	startDate, err := time.Parse("2006-01-02", body.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_date; use YYYY-MM-DD"})
		return
	}
	endDate, err := time.Parse("2006-01-02", body.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_date; use YYYY-MM-DD"})
		return
	}
	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_date must be on or after start_date"})
		return
	}

	// Collect calendar dates that cancel work in the date range.
	calDates := database.ListCalendarDates(uint(id), sc.Semester, sc.AcademicYear, &startDate, &endDate)
	cancelledDates := make(map[string]uint)
	for _, cd := range calDates {
		if cd.AffectsWork {
			cancelledDates[cd.Date.Format("2006-01-02")] = cd.ID
		}
	}

	occurrences, err := database.GenerateWorkOccurrences(
		uint(id), nil, body.WeekDay, body.StartTime, body.EndTime,
		startDate, endDate, cancelledDates,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot generate occurrences: " + err.Error()})
		return
	}

	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "work_occurrence",
		EntityID:    sc.ID,
		Action:      "occurrences_generated",
		ActorID:     staffID.(uint),
		NewValue:    strconv.Itoa(len(occurrences)),
	})
	c.JSON(http.StatusCreated, occurrences)
}

// ListOccurrences godoc
// @Summary รายการวันทำงานทั้งหมดของ Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} models.WorkOccurrence
// @Router /staff/cases/{id}/occurrences [get]
func (h *Handler) ListOccurrences(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	occurrences := database.WorkOccurrencesForCase(uint(id))
	c.JSON(http.StatusOK, occurrences)
}

type updateOccurrenceRequest struct {
	Status models.OccurrenceStatus `json:"status" binding:"required"`
	Reason string                  `json:"reason"`
}

// UpdateOccurrence godoc
// @Summary เปลี่ยนสถานะวันทำงาน (เสร็จ / ขาด / ยกเลิก ฯลฯ)
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Occurrence ID"
// @Success 200 {object} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/occurrences/{id} [put]
func (h *Handler) UpdateOccurrence(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body updateOccurrenceRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	switch body.Status {
	case models.OccurrenceScheduled, models.OccurrenceCancelledHoliday,
		models.OccurrenceCompleted, models.OccurrenceAbsent, models.OccurrenceCancelledOther:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status; use scheduled, cancelled_holiday, completed, absent, or cancelled_other"})
		return
	}
	occ, ok := database.UpdateOccurrenceStatus(uint(id), body.Status, body.Reason, staffID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "occurrence not found"})
		return
	}
	c.JSON(http.StatusOK, occ)
}

type rescheduleRequest struct {
	NewDate  string `json:"new_date" binding:"required"`  // YYYY-MM-DD
	NewStart string `json:"new_start" binding:"required"` // HH:MM
	NewEnd   string `json:"new_end" binding:"required"`   // HH:MM
	Reason   string `json:"reason"`
}

// RescheduleOccurrence godoc
// @Summary เลื่อนวันทำงาน
// @Description ทำเครื่องหมาย occurrence เดิมว่า rescheduled แล้วสร้าง occurrence ใหม่ในวันที่ใหม่
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Occurrence ID"
// @Success 201 {object} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/occurrences/{id}/reschedule [post]
func (h *Handler) RescheduleOccurrence(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body rescheduleRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	newDate, err := time.Parse("2006-01-02", body.NewDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid new_date; use YYYY-MM-DD"})
		return
	}
	_, newOcc, err := database.RescheduleOccurrence(
		uint(id), newDate, body.NewStart, body.NewEnd, body.Reason, staffID.(uint),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot reschedule occurrence: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, newOcc)
}
