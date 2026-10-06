package staff

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"labassist/database"
	"labassist/docxgen"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// MonthlyPeriodResponse enriches MonthlyPeriod with computed session totals.
type MonthlyPeriodResponse struct {
	models.MonthlyPeriod
	TotalSessions     int     `json:"total_sessions"`
	CompletedSessions int     `json:"completed_sessions"`
	AbsentSessions    int     `json:"absent_sessions"`
	CancelledSessions int     `json:"cancelled_sessions"`
	TotalHours        float64 `json:"total_hours"`
	TotalAmountSatang int64   `json:"total_amount_satang"`
}

func enrichMonthlyPeriod(p models.MonthlyPeriod, sc models.StaffCase) MonthlyPeriodResponse {
	occs := database.WorkOccurrencesForMonth(p.StaffCaseID, p.Year, p.Month)
	resp := MonthlyPeriodResponse{MonthlyPeriod: p}
	for _, o := range occs {
		if o.Status == models.OccurrenceRescheduled {
			continue // replaced by the new occurrence, not counted
		}
		resp.TotalSessions++
		switch o.Status {
		case models.OccurrenceCompleted:
			resp.CompletedSessions++
			if o.ActualHours > 0 {
				resp.TotalHours += o.ActualHours
			} else {
				resp.TotalHours += sc.HoursPerSession
			}
		case models.OccurrenceAbsent:
			resp.AbsentSessions++
		case models.OccurrenceCancelledHoliday, models.OccurrenceCancelledOther:
			resp.CancelledSessions++
		}
	}
	resp.TotalAmountSatang = int64(math.Round(resp.TotalHours * float64(sc.RatePerHour)))
	return resp
}

// ListMonthlyPeriods godoc
// @Summary รายการ monthly periods ของ Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} MonthlyPeriodResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/monthly-periods [get]
func (h *Handler) ListMonthlyPeriods(c *gin.Context) {
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
	periods := database.MonthlyPeriodsForCase(uint(id))
	out := make([]MonthlyPeriodResponse, 0, len(periods))
	for _, p := range periods {
		out = append(out, enrichMonthlyPeriod(p, sc))
	}
	c.JSON(http.StatusOK, out)
}

type openPeriodRequest struct {
	Month int `json:"month" binding:"required,min=1,max=12"`
	Year  int `json:"year" binding:"required"`
}

// OpenMonthlyPeriod godoc
// @Summary เปิดรอบเดือน (สร้างหรือคืนค่าถ้ามีอยู่แล้ว)
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 201 {object} MonthlyPeriodResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/monthly-periods [post]
func (h *Handler) OpenMonthlyPeriod(c *gin.Context) {
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
	var body openPeriodRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p, err := database.OpenMonthlyPeriod(uint(id), body.Month, body.Year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot open period: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, enrichMonthlyPeriod(p, sc))
}

// CloseMonthlyPeriod godoc
// @Summary ปิดรอบเดือน (ล็อกไม่ให้แก้ไขเพิ่มเติม)
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Monthly Period ID"
// @Success 200 {object} MonthlyPeriodResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/monthly-periods/{id}/close [post]
func (h *Handler) CloseMonthlyPeriod(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	p, err := database.CloseMonthlyPeriod(uint(id), staffID.(uint))
	if err != nil {
		if errors.Is(err, database.ErrPeriodAlreadyClosed) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "period is already closed"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "period not found or cannot be closed"})
		return
	}
	sc, ok := database.StaffCaseByID(p.StaffCaseID)
	if !ok {
		c.JSON(http.StatusOK, p)
		return
	}
	c.JSON(http.StatusOK, enrichMonthlyPeriod(p, sc))
}

// GetMonthlyOccurrences godoc
// @Summary รายการวันทำงานในรอบเดือน
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Monthly Period ID"
// @Success 200 {array} models.WorkOccurrence
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/monthly-periods/{id}/occurrences [get]
func (h *Handler) GetMonthlyOccurrences(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	p, ok := database.MonthlyPeriodByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "period not found"})
		return
	}
	occs := database.WorkOccurrencesForMonth(p.StaffCaseID, p.Year, p.Month)
	c.JSON(http.StatusOK, occs)
}

type generateMonthlyDocRequest struct {
	Type             models.DocType `json:"type" binding:"required"`
	ScheduleGroupID  *uint          `json:"schedule_group_id"` // optional, nil = whole case
	RefNumber        string         `json:"ref_number"`
	PriorMemoRef     string         `json:"prior_memo_ref"`
	PriorMemoDate    string         `json:"prior_memo_date"`
	DeptHeadName     string         `json:"dept_head_name"`
	DeanName         string         `json:"dean_name"`
	StaffOfficerName string         `json:"staff_officer_name"`
}

// GenerateMonthlyDocument godoc
// @Summary สร้างเอกสารรายเดือน (รายงานผลปฏิบัติงาน หรือ บันทึกขอเบิกจ่าย)
// @Description สร้าง StaffDocument จากข้อมูล WorkOccurrence ที่ status=completed ใน MonthlyPeriod นี้
//   - ผลรวมชั่วโมงและยอดเงินคำนวณจากฝั่ง Backend เสมอ; Frontend ไม่ต้องส่งค่าเงิน
//   - ใช้ RatePerHour (satang) และ HoursPerSession จาก StaffCase
//   - บันทึก DataSnapshot ณ เวลาที่สร้างเพื่อให้สามารถสร้างซ้ำได้แม้ต้นทางเปลี่ยน
//
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Monthly Period ID"
// @Param body body generateMonthlyDocRequest true "ข้อมูลเพิ่มเติมสำหรับเอกสาร"
// @Success 201 {object} models.StaffDocument
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Failure 422 {object} handlers.ErrorResponse
// @Router /staff/monthly-periods/{id}/documents [post]
func (h *Handler) GenerateMonthlyDocument(c *gin.Context) {
	staffIDRaw, _ := c.Get("user_id")
	staffID := staffIDRaw.(uint)

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	p, ok := database.MonthlyPeriodByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "monthly period not found"})
		return
	}

	sc, ok := database.StaffCaseByID(p.StaffCaseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	var body generateMonthlyDocRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch body.Type {
	case models.DocWorkReport, models.DocPaymentRequest:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be work_report or payment_request"})
		return
	}

	// Determine effective rate and hours — group overrides case if present
	effectiveRate := sc.RatePerHour
	effectiveHours := sc.HoursPerSession
	if body.ScheduleGroupID != nil {
		groups := database.ScheduleGroupsForCase(sc.ID)
		for _, sg := range groups {
			if sg.ID == *body.ScheduleGroupID {
				if sg.RatePerHourSatang > 0 {
					effectiveRate = sg.RatePerHourSatang
				}
				if sg.HoursPerSession > 0 {
					effectiveHours = sg.HoursPerSession
				}
				break
			}
		}
	}
	// Apply system-wide default rate (50 THB/hr) when none has been explicitly set.
	if effectiveRate == 0 {
		effectiveRate = database.DefaultHourlyRateSatang
	}

	// HoursPerSession must still be configured explicitly — there is no sensible
	// universal default for this value.
	if effectiveHours == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "กรุณาตั้งค่า hours_per_session ก่อนสร้างเอกสาร",
		})
		return
	}

	// Collect completed occurrences for this month.
	var occs []models.WorkOccurrence
	if body.ScheduleGroupID != nil {
		occs = database.WorkOccurrencesForGroupInMonth(*body.ScheduleGroupID, p.Year, p.Month)
	} else {
		occs = database.WorkOccurrencesForMonth(sc.ID, p.Year, p.Month)
	}
	var completedDays []int
	for _, o := range occs {
		if o.Status == models.OccurrenceCompleted {
			completedDays = append(completedDays, o.ScheduledDate.Day())
		}
	}
	if len(completedDays) == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ไม่มีวันทำงานที่เสร็จสิ้นในรอบเดือนนี้"})
		return
	}

	// Retrieve posting and lab boys for this staff case.
	posting, postingOK := database.PostingByIDExported(sc.PostingID)
	if !postingOK {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ไม่พบข้อมูล Posting ของ Staff Case นี้"})
		return
	}

	var labBoys []models.Application
	if body.ScheduleGroupID != nil {
		assignedIDs := database.GroupStudentIDs(*body.ScheduleGroupID)
		if len(assignedIDs) > 0 {
			// Use only the assigned students for this group
			allBoys := database.AcceptedStudentsForPosting(sc.PostingID)
			idSet := make(map[uint]bool, len(assignedIDs))
			for _, id := range assignedIDs {
				idSet[id] = true
			}
			for _, lb := range allBoys {
				if idSet[lb.StudentID] {
					labBoys = append(labBoys, lb)
				}
			}
		} else {
			labBoys = database.AcceptedStudentsForPosting(sc.PostingID)
		}
	} else {
		labBoys = database.AcceptedStudentsForPosting(sc.PostingID)
	}
	if len(labBoys) == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ไม่พบ Lab Boy ที่ได้รับการคัดเลือก"})
		return
	}

	// Compute financial totals on the backend.
	// Rate is stored as int64 satang; convert to baht for document rendering.
	rateBaht := float64(effectiveRate) / 100.0
	sessions := len(completedDays)
	totalHours := roundSatang(effectiveHours * float64(sessions))
	perAmount := roundSatang(totalHours * rateBaht)

	var roster []models.RosterEntry
	for _, lb := range labBoys {
		roster = append(roster, models.RosterEntry{
			StudentID:   lb.StudentID,
			StudentName: lb.StudentName,
			StudentCode: lb.StudentCode,
			Hours:       totalHours,
			Amount:      perAmount,
		})
	}
	var totalAmount float64
	for _, r := range roster {
		totalAmount += r.Amount
	}
	totalAmount = roundSatang(totalAmount)

	courseID := &sc.CourseID
	docName := docTypeLabel[body.Type] + fmt.Sprintf(" %s/%s-%d/%d",
		sc.Semester, func() string {
			if c, ok2 := database.CourseByID(sc.CourseID); ok2 {
				return c.Code
			}
			return fmt.Sprintf("course%d", sc.CourseID)
		}(),
		sc.AcademicYear, p.Month,
	)

	// Freeze a JSON snapshot using the canonical DocumentDataSnapshot format so
	// renderWorkReport can reconstruct per-occurrence rows from this document later.
	ds := database.BuildMonthlyDocumentSnapshot(occs, sc.ID, rateBaht, len(labBoys))
	snapBytes, _ := json.Marshal(ds)

	doc := models.StaffDocument{
		Name:             docName,
		Type:             body.Type,
		CourseRef:        fmt.Sprintf("%s-%d", sc.Semester, sc.AcademicYear),
		StaffID:          staffID,
		PostingID:        &posting.ID,
		CourseID:         courseID,
		StaffCaseID:      &sc.ID,
		MonthlyPeriodID:  &p.ID,
		Status:           models.DocDraft,
		Period:           &models.DocumentPeriod{Month: p.Month, Year: p.Year + 543},
		SessionDates:     completedDays,
		HoursPerSession:  effectiveHours,
		Rate:             rateBaht,
		Roster:           roster,
		TotalAmount:      totalAmount,
		WorkDay:          "", // populated from schedule group if needed in future
		RefNumber:        body.RefNumber,
		PriorMemoRef:     body.PriorMemoRef,
		PriorMemoDate:    body.PriorMemoDate,
		DeptHeadName:     body.DeptHeadName,
		DeanName:         body.DeanName,
		StaffOfficerName: body.StaffOfficerName,
		DataSnapshot:     string(snapBytes),
		SnapshotVersion:  1,
		Version:          1,
	}

	created, err := database.CreateStaffDocument(doc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save document"})
		return
	}

	// Verify the template exists before returning success; if not, we still
	// persist the record (so the staff can fill in missing fields later) but
	// warn the caller.
	if _, _, renderErr := docxgen.RenderDocument(created); errors.Is(renderErr, docxgen.ErrNoTemplate) {
		// The document was saved but cannot be rendered yet.
		c.Header("X-Render-Warning", "template not available for this document type")
	}

	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "staff_document",
		EntityID:    created.ID,
		Action:      string(body.Type) + "_generated",
		ActorID:     staffID,
		NewValue:    fmt.Sprintf("period=%d sessions=%d total_baht=%.2f", p.ID, sessions, totalAmount),
	})

	c.JSON(http.StatusCreated, created)
}
