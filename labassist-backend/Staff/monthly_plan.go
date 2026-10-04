package staff

import (
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// isValidHHMM reports whether s is a valid "HH:MM" 24-hour time string.
func isValidHHMM(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	h, err1 := strconv.Atoi(s[:2])
	m, err2 := strconv.Atoi(s[3:])
	return err1 == nil && err2 == nil && h >= 0 && h <= 23 && m >= 0 && m <= 59
}

// GroupMonthPlanEntry holds the occurrences and computed summary for one month
// within a schedule group.
type GroupMonthPlanEntry struct {
	Month       models.ScheduleGroupMonth     `json:"month"`
	Occurrences []models.WorkOccurrence       `json:"occurrences"`
	Summary     models.MonthOccurrenceSummary `json:"summary"`
}

// GroupMonthPlan holds a schedule group with all its registered months.
type GroupMonthPlan struct {
	Group  models.ScheduleGroup  `json:"group"`
	Months []GroupMonthPlanEntry `json:"months"`
}

// GetMonthlyPlan godoc
// @Summary แผนปฏิบัติงานรายเดือนทั้งหมดของ Staff Case (ทุก group + ทุกเดือน + สรุป)
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} GroupMonthPlan
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/monthly-plan [get]
func (h *Handler) GetMonthlyPlan(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	groups := database.ScheduleGroupsForCase(uint(caseID))
	result := make([]GroupMonthPlan, 0, len(groups))

	for _, sg := range groups {
		months := database.ListScheduleGroupMonths(sg.ID)
		entries := make([]GroupMonthPlanEntry, 0, len(months))
		labBoyCount := len(database.GroupStudentIDs(sg.ID))
		effectiveRate := sg.RatePerHourSatang
		if effectiveRate == 0 {
			effectiveRate = sc.RatePerHour
		}
		for _, m := range months {
			occs := database.WorkOccurrencesForGroupInMonth(sg.ID, m.Year, m.Month)
			summary := database.ComputeMonthOccurrenceSummary(occs, m.Year, m.Month, effectiveRate, labBoyCount)
			entries = append(entries, GroupMonthPlanEntry{
				Month:       m,
				Occurrences: occs,
				Summary:     summary,
			})
		}
		result = append(result, GroupMonthPlan{
			Group:  sg,
			Months: entries,
		})
	}

	c.JSON(http.StatusOK, result)
}

// GetHiringNoticeSnapshot godoc
// @Summary ข้อมูลแผนงานสำหรับสร้างเอกสาร hiring_notice อัตโนมัติ
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {object} database.HiringNoticePlanSnapshot
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/hiring-notice-snapshot [get]
func (h *Handler) GetHiringNoticeSnapshot(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	if _, ok := database.StaffCaseByID(uint(caseID)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	snap := database.BuildHiringNoticeSnapshot(uint(caseID))
	c.JSON(http.StatusOK, snap)
}

type setGroupMonthDatesRequest struct {
	Dates []string `json:"dates" binding:"required"`
}

// SetGroupMonthDatesList godoc
// @Summary กำหนดวันที่ทำงานแบบเลือกเองสำหรับ schedule group ในเดือนที่ระบุ
// @Description แทนที่ draft occurrences ทั้งหมดของเดือนนั้นด้วยวันที่ที่เลือกมา (idempotent)
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Param year path int true "CE Year"
// @Param month path int true "Month 1–12"
// @Success 200 {array} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months/{year}/{month}/set-dates [post]
func (h *Handler) SetGroupMonthDatesList(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil || month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}

	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	groups := database.ScheduleGroupsForCase(uint(caseID))
	var sg models.ScheduleGroup
	for _, g := range groups {
		if g.ID == uint(groupID) {
			sg = g
			break
		}
	}
	if sg.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	if sg.LockedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schedule group is locked"})
		return
	}

	months := database.ListScheduleGroupMonths(uint(groupID))
	var sgMonth *models.ScheduleGroupMonth
	for i, m := range months {
		if m.Year == year && m.Month == month {
			sgMonth = &months[i]
			break
		}
	}
	if sgMonth == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "month not found for this schedule group — add it first"})
		return
	}

	var body setGroupMonthDatesRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dates := make([]time.Time, 0, len(body.Dates))
	for _, ds := range body.Dates {
		t, parseErr := time.Parse("2006-01-02", ds)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date " + ds + "; use YYYY-MM-DD"})
			return
		}
		dates = append(dates, t)
	}

	// Holiday map for the effective month range.
	firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)
	startDate, endDate := firstDay, lastDay
	if sgMonth.MonthStartDate != nil {
		startDate = *sgMonth.MonthStartDate
	}
	if sgMonth.MonthEndDate != nil {
		endDate = *sgMonth.MonthEndDate
	}
	calDates := database.ListCalendarDates(uint(caseID), sc.Semester, sc.AcademicYear, &startDate, &endDate)
	cancelledDates := make(map[string]uint)
	for _, cd := range calDates {
		if cd.AffectsWork {
			cancelledDates[cd.Date.Format("2006-01-02")] = cd.ID
		}
	}

	occs, err := database.SetGroupMonthDates(uint(caseID), uint(groupID), sg, *sgMonth, dates, cancelledDates)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "work_occurrence",
		EntityID:    uint(groupID),
		Action:      "group_month_dates_set_manual",
		ActorID:     staffID.(uint),
		NewValue:    strconv.Itoa(len(occs)),
	})
	c.JSON(http.StatusOK, occs)
}

type addGroupMonthOccurrenceRequest struct {
	Date      string `json:"date" binding:"required"`
	StartTime string `json:"start_time" binding:"required"`
	EndTime   string `json:"end_time" binding:"required"`
}

// AddGroupMonthOccurrence godoc
// @Summary เพิ่มวันทำงานเดี่ยวๆ ให้ schedule group ในเดือนที่ระบุ
// @Description ตรวจสอบวันหยุดและวันซ้ำก่อนบันทึก
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Param year path int true "CE Year"
// @Param month path int true "Month 1–12"
// @Success 201 {object} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Failure 409 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months/{year}/{month}/occurrences [post]
func (h *Handler) AddGroupMonthOccurrence(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil || month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}

	// Parse and validate body before any DB calls (fail fast on bad input).
	var body addGroupMonthOccurrenceRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !isValidHHMM(body.StartTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time; use HH:MM"})
		return
	}
	if !isValidHHMM(body.EndTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time; use HH:MM"})
		return
	}
	date, parseErr := time.Parse("2006-01-02", body.Date)
	if parseErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date; use YYYY-MM-DD"})
		return
	}
	if int(date.Month()) != month || date.Year() != year {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must fall within the specified year/month"})
		return
	}

	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	groups := database.ScheduleGroupsForCase(uint(caseID))
	var sg models.ScheduleGroup
	for _, g := range groups {
		if g.ID == uint(groupID) {
			sg = g
			break
		}
	}
	if sg.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	if sg.LockedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schedule group is locked"})
		return
	}

	// Holiday check for this single date.
	calDates := database.ListCalendarDates(uint(caseID), sc.Semester, sc.AcademicYear, &date, &date)
	cancelledDates := make(map[string]uint)
	for _, cd := range calDates {
		if cd.AffectsWork {
			cancelledDates[cd.Date.Format("2006-01-02")] = cd.ID
		}
	}

	occ, occErr := database.AddSingleGroupOccurrence(uint(caseID), uint(groupID), date, body.StartTime, body.EndTime, cancelledDates)
	if occErr == database.ErrDuplicateOccurrence {
		c.JSON(http.StatusConflict, gin.H{"error": "occurrence already exists on this date for the group"})
		return
	}
	if occErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot add occurrence: " + occErr.Error()})
		return
	}

	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "work_occurrence",
		EntityID:    occ.ID,
		Action:      "single_occurrence_added",
		ActorID:     staffID.(uint),
	})
	c.JSON(http.StatusCreated, occ)
}
