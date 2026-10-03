package staff

import (
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

type createCalendarDateRequest struct {
	Date         string                   `json:"date" binding:"required"` // YYYY-MM-DD
	Name         string                   `json:"name" binding:"required"`
	DateType     models.CalendarDateType  `json:"date_type" binding:"required"`
	Scope        models.CalendarDateScope `json:"scope" binding:"required"`
	Semester     string                   `json:"semester"`
	AcademicYear int                      `json:"academic_year"`
	StaffCaseID  *uint                    `json:"staff_case_id"`
	AffectsWork  bool                     `json:"affects_work"`
	// OriginalDateID links a makeup/rescheduled day to the cancelled day it replaces.
	OriginalDateID *uint  `json:"original_date_id"`
	Reason         string `json:"reason"`
}

// ListCalendarDates godoc
// @Summary วันหยุดและวันงดสำหรับ Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} models.CalendarDate
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/calendar-dates [get]
func (h *Handler) ListCalendarDates(c *gin.Context) {
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
	dates := database.ListCalendarDates(uint(id), sc.Semester, sc.AcademicYear, nil, nil)
	c.JSON(http.StatusOK, dates)
}

// CreateCalendarDate godoc
// @Summary เพิ่มวันหยุด/วันงด/วันชดเชย
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body createCalendarDateRequest true "ข้อมูลวันหยุด"
// @Success 201 {object} models.CalendarDate
// @Failure 400 {object} handlers.ErrorResponse
// @Router /staff/calendar-dates [post]
func (h *Handler) CreateCalendarDate(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	var body createCalendarDateRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	date, err := time.Parse("2006-01-02", body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format; use YYYY-MM-DD"})
		return
	}
	// Validate date_type enum.
	switch body.DateType {
	case models.DateTypePublicHoliday, models.DateTypeUniversityHoliday,
		models.DateTypeNoClass, models.DateTypeCaseException, models.DateTypeMakeup:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date_type"})
		return
	}
	// Validate scope enum.
	switch body.Scope {
	case models.DateScopeGlobal, models.DateScopeSemester, models.DateScopeCase:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid scope"})
		return
	}

	cd := models.CalendarDate{
		Date:           date,
		Name:           body.Name,
		DateType:       body.DateType,
		Scope:          body.Scope,
		Semester:       body.Semester,
		AcademicYear:   body.AcademicYear,
		StaffCaseID:    body.StaffCaseID,
		AffectsWork:    body.AffectsWork,
		OriginalDateID: body.OriginalDateID,
		EditReason:     body.Reason,
		CreatedByID:    staffID.(uint),
	}
	created, err := database.CreateCalendarDate(cd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save calendar date"})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// DeleteCalendarDate godoc
// @Summary ลบวันหยุด/วันงด
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Calendar Date ID"
// @Success 204
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/calendar-dates/{id} [delete]
func (h *Handler) DeleteCalendarDate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if !database.DeleteCalendarDate(uint(id)) {
		c.JSON(http.StatusNotFound, gin.H{"error": "calendar date not found"})
		return
	}
	c.Status(http.StatusNoContent)
}
