package staff

import (
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/docxgen"
	"labassist/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// roundSatang rounds a baht amount to the nearest satang (2 decimal places)
// using half-away-from-zero rounding, which is the standard in Thai finance.
// All monetary values in documents must pass through this function before
// being stored so that roster amounts and TotalAmount are always consistent.
func roundSatang(baht float64) float64 {
	return math.Round(baht*100) / 100
}

type createDocumentRequest struct {
	Type      models.DocType `json:"type"    binding:"required"`
	CourseRef string         `json:"course_ref" binding:"required"`
	Note      string         `json:"note"`

	// Line-item fields — required when Type is payment_evidence,
	// payment_request, or work_report. The frontend sends course_id; the
	// handler resolves it to the active posting_id before persisting.
	CourseID           *uint   `json:"course_id"`
	Month              int     `json:"month"`
	Year               int     `json:"year"`
	SessionDates       []int   `json:"session_dates"`
	HoursPerSession    float64 `json:"hours_per_session"`
	Rate               float64 `json:"rate"`
	ExcludedStudentIDs []uint  `json:"excluded_student_ids"`

	WorkDay       string `json:"work_day"`
	WorkTimeStart string `json:"work_time_start"`
	WorkTimeEnd   string `json:"work_time_end"`

	WorkSchedule     []models.WorkDaySlot `json:"work_schedule"`
	SessionsPerMonth int                  `json:"sessions_per_month"`

	// StaffCaseID links this document to a Staff Case so that sessions_per_month
	// and work_schedule can be derived from confirmed WorkOccurrence data.
	StaffCaseID *uint `json:"staff_case_id"`

	RefNumber        string `json:"ref_number"`
	PriorMemoRef     string `json:"prior_memo_ref"`
	PriorMemoDate    string `json:"prior_memo_date"`
	DeptHeadName     string `json:"dept_head_name"`
	DeanName         string `json:"dean_name"`
	StaffOfficerName string `json:"staff_officer_name"`
}

type updateDocStatusRequest struct {
	Status models.DocStatus `json:"status" binding:"required"`
}

type updateDocScheduleRequest struct {
	WorkSchedule     []models.WorkDaySlot `json:"work_schedule"`
	SessionsPerMonth int                  `json:"sessions_per_month"`
}

type regVerifyRequest struct {
	StudentCode string `json:"student_code" binding:"required"`
	Verified    bool   `json:"verified"`
	Note        string `json:"note"`
}

var docTypeLabel = map[models.DocType]string{
	models.DocHiringNotice:    "แบบฟอร์มแจ้งความประสงค์จ้าง",
	models.DocApprovalMemo:    "บันทึกขออนุมัติจ้างนักศึกษาปฏิบัติงาน",
	models.DocLabNotice:       "แบบแจ้งนักศึกษาช่วยคุมรายวิชาปฏิบัติการ",
	models.DocPaymentEvidence: "หลักฐานการจ่ายเงิน",
	models.DocPaymentRequest:  "บันทึกขอเบิกจ่าย",
	models.DocWorkReport:      "รายงานผลการปฏิบัติงานนอกเวลาราชการ",
}

// needsRoster reports whether a document type carries a per-student roster
// with financial line items (hours/rate/amount).
func needsRoster(t models.DocType) bool {
	return t == models.DocPaymentEvidence || t == models.DocPaymentRequest || t == models.DocWorkReport
}

// needsCourse reports whether a document type requires a course_id and
// builds its student list from that course's accepted applicants.
func needsCourse(t models.DocType) bool {
	return t == models.DocHiringNotice || needsRoster(t)
}

// ListDocuments godoc
// @Summary      รายการเอกสารของเจ้าหน้าที่
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        type    query  string  false  "approval_memo | payment_evidence | payment_request | work_report"
// @Param        status  query  string  false  "draft | pending | approved"
// @Param        q       query  string  false  "ค้นหา"
// @Success      200  {array}   models.StaffDocument
// @Router       /staff/documents [get]
func (h *Handler) ListDocuments(c *gin.Context) {
	t := c.Query("type")
	s := c.Query("status")
	q := c.Query("q")
	docs, err := database.ListStaffDocuments(t, s, q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, docs)
}

// CreateDocument godoc
// @Summary      สร้างเอกสารใหม่ (บันทึกขออนุมัติ / รายงานผลปฏิบัติงาน / หลักฐานจ่ายเงิน / บันทึกขอเบิก)
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  createDocumentRequest  true  "ข้อมูลเอกสาร"
// @Success      201  {object}  models.StaffDocument
// @Failure      400  {object}  handlers.ErrorResponse
// @Router       /staff/documents [post]
func (h *Handler) CreateDocument(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	var body createDocumentRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	label, ok := docTypeLabel[body.Type]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document type"})
		return
	}

	// Workflow documents (hiring notice, approval memo) always belong to one
	// course offering and go through the same prerequisite / duplicate rules
	// as the workflow endpoint, whichever page created them.
	if step, ok := stepFor(body.Type); ok {
		if body.CourseID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course_id is required for this document type"})
			return
		}
		course, found := database.CourseByID(*body.CourseID)
		if !found {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course not found"})
			return
		}
		posting, found := database.ActivePostingForCourse(course.ID)
		if !found {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no active recruitment posting for this course"})
			return
		}
		createStep(c, step, course, posting, CreateWorkflowStepRequest{
			Note: strings.TrimSpace(body.Note), RefNumber: strings.TrimSpace(body.RefNumber),
			DeptHeadName: strings.TrimSpace(body.DeptHeadName), StaffOfficerName: strings.TrimSpace(body.StaffOfficerName),
		})
		return
	}

	doc := models.StaffDocument{
		Name:             label + " " + body.CourseRef,
		Type:             body.Type,
		CourseRef:        body.CourseRef,
		StaffID:          staffID.(uint),
		Status:           models.DocDraft,
		Note:             body.Note,
		WorkDay:          body.WorkDay,
		WorkTimeStart:    body.WorkTimeStart,
		WorkTimeEnd:      body.WorkTimeEnd,
		WorkSchedule:     body.WorkSchedule,
		SessionsPerMonth: body.SessionsPerMonth,
		StaffCaseID:      body.StaffCaseID,
		RefNumber:        body.RefNumber,
		PriorMemoRef:     body.PriorMemoRef,
		PriorMemoDate:    body.PriorMemoDate,
		DeptHeadName:     body.DeptHeadName,
		DeanName:         body.DeanName,
		StaffOfficerName: body.StaffOfficerName,
	}

	if needsCourse(body.Type) {
		if body.CourseID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course_id is required for this document type"})
			return
		}
		if _, ok := database.CourseByID(*body.CourseID); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course not found"})
			return
		}
		// Resolve to the active posting for this course.
		posting, ok := database.ActivePostingForCourse(*body.CourseID)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no active recruitment posting for this course"})
			return
		}

		excluded := make(map[uint]bool, len(body.ExcludedStudentIDs))
		for _, id := range body.ExcludedStudentIDs {
			excluded[id] = true
		}

		doc.PostingID = &posting.ID
		doc.CourseID = body.CourseID

		if needsRoster(body.Type) {
			if body.HoursPerSession <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "hours_per_session must be greater than zero"})
				return
			}
			if body.Rate <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "rate must be greater than zero"})
				return
			}
			if body.Month < 1 || body.Month > 12 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "month must be between 1 and 12"})
				return
			}
			if body.Year <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "year must be a positive Buddhist era year"})
				return
			}
			if len(body.SessionDates) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "session_dates must not be empty"})
				return
			}
			// Validate each day is real in the given month and not duplicated.
			// ceYear converts Buddhist era (พ.ศ.) to Common Era for time.Date.
			ceYear := body.Year - 543
			daysInMonth := time.Date(ceYear, time.Month(body.Month+1), 0, 0, 0, 0, 0, time.UTC).Day()
			seen := make(map[int]bool, len(body.SessionDates))
			for _, day := range body.SessionDates {
				if day < 1 || day > daysInMonth {
					c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("day %d does not exist in the specified month", day)})
					return
				}
				if seen[day] {
					c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("day %d appears more than once in session_dates", day)})
					return
				}
				seen[day] = true
			}

			// Compute per-person hours and amount once, both rounded to the
			// nearest satang so that summing the roster always equals TotalAmount
			// with no floating-point drift.
			hours := roundSatang(body.HoursPerSession * float64(len(body.SessionDates)))
			perAmount := roundSatang(hours * body.Rate)
			accepted, err := database.AcceptedStudentsForCourse(*body.CourseID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
				return
			}
			var roster []models.RosterEntry
			for _, app := range accepted {
				if excluded[app.StudentID] {
					continue
				}
				roster = append(roster, models.RosterEntry{
					StudentID:   app.StudentID,
					StudentName: app.StudentName,
					StudentCode: app.StudentCode,
					Hours:       hours,
					Amount:      perAmount,
				})
			}
			// TotalAmount is the authoritative sum of individual amounts —
			// never re-derived from formula so document columns always balance.
			var total float64
			for _, e := range roster {
				total += e.Amount
			}
			doc.Period = &models.DocumentPeriod{Month: body.Month, Year: body.Year}
			doc.SessionDates = body.SessionDates
			doc.HoursPerSession = body.HoursPerSession
			doc.Rate = body.Rate
			doc.Roster = roster
			doc.TotalAmount = roundSatang(total)
		}
	}

	created, err := database.CreateStaffDocument(doc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save document"})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// UpdateDocumentStatus godoc
// @Summary      อัปเดตสถานะเอกสาร (draft → pending → approved)
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                    true  "Document ID"
// @Param        body  body  updateDocStatusRequest true  "สถานะใหม่"
// @Success      200  {object}  models.StaffDocument
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id}/status [put]
func (h *Handler) UpdateDocumentStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body updateDocStatusRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	switch body.Status {
	case models.DocDraft, models.DocPending, models.DocApproved,
		models.DocAwaitingSignature, models.DocSigned:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	doc, err := database.ChangeStaffDocumentStatus(uint(id), body.Status, c.GetUint("user_id"))
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
	case errors.Is(err, database.ErrDocumentInactive):
		c.JSON(http.StatusConflict, gin.H{"error": "เอกสารนี้ถูกยกเลิกหรือมีฉบับใหม่แทนแล้ว จึงเปลี่ยนสถานะไม่ได้"})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	default:
		c.JSON(http.StatusOK, doc)
	}
}

// UpdateDocumentSchedule godoc
// @Summary      อัปเดตตารางปฏิบัติงานและจำนวนครั้งต่อเดือนของเอกสาร hiring_notice
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                        true  "Document ID"
// @Param        body  body  updateDocScheduleRequest   true  "ตารางงาน"
// @Success      200  {object}  models.StaffDocument
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id}/schedule [put]
func (h *Handler) UpdateDocumentSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body updateDocScheduleRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	doc, ok := database.UpdateStaffDocumentSchedule(uint(id), body.WorkSchedule, body.SessionsPerMonth)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

// DownloadDocument godoc
// @Summary      ดาวน์โหลดไฟล์เอกสาร (.docx)
// @Tags         staff
// @Produce      application/vnd.openxmlformats-officedocument.wordprocessingml.document
// @Security     BearerAuth
// @Param        id  path  int  true  "Document ID"
// @Success      200  {file}    file
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      501  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id}/file [get]
func (h *Handler) DownloadDocument(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	doc, ok := database.StaffDocumentByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	data, filename, err := docxgen.RenderDocument(doc)
	if errors.Is(err, docxgen.ErrNoTemplate) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "เอกสารประเภทนี้ยังไม่รองรับการสร้างไฟล์"})
		return
	}
	if errors.Is(err, docxgen.ErrIncompleteDocumentData) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ข้อมูลของเอกสารไม่ครบ (ต้องมีรายชื่อนักศึกษา วันปฏิบัติงาน และอัตราค่าจ้าง) — กรุณาสร้างฉบับใหม่"})
		return
	}
	if err != nil {
		log.Printf("staff document download failed: document_id=%d type=%s: %v", id, doc.Type, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate document failed"})
		return
	}

	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}

// DownloadEvidenceFile godoc
// @Summary      ดาวน์โหลดใบขวาง (หลักฐานการจ่ายเงินค่าจ้างนักศึกษาปฏิบัติงาน) ที่คู่กับบันทึกขออนุมัติเบิกจ่ายเงิน (.docx)
// @Description  เดือนละ 1 หน้า จากแผนชุดเดียวกับบันทึกขออนุมัติเบิกจ่ายเงิน (ขั้นที่ 3)
// @Tags         staff
// @Produce      application/vnd.openxmlformats-officedocument.wordprocessingml.document
// @Security     BearerAuth
// @Param        id  path  int  true  "Document ID (payment_request)"
// @Success      200  {file}    file
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id}/evidence-file [get]
func (h *Handler) DownloadEvidenceFile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	doc, ok := database.StaffDocumentByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	data, filename, err := docxgen.RenderPaymentRequestEvidence(doc)
	if errors.Is(err, docxgen.ErrNoTemplate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ใบขวางมีเฉพาะบันทึกขออนุมัติเบิกจ่ายเงิน"})
		return
	}
	if errors.Is(err, docxgen.ErrIncompleteDocumentData) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ข้อมูลของเอกสารไม่ครบ (ต้องมีรายชื่อนักศึกษาและวันปฏิบัติงาน) — กรุณาสร้างฉบับใหม่"})
		return
	}
	if err != nil {
		log.Printf("payment evidence download failed: document_id=%d: %v", id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate document failed"})
		return
	}

	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}

// DeleteDocument godoc
// @Summary      ยกเลิกเอกสาร (ไม่ลบจริง เก็บประวัติไว้)
// @Tags         staff
// @Security     BearerAuth
// @Param        id  path  int  true  "Document ID"
// @Success      204
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id} [delete]
func (h *Handler) DeleteDocument(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	// Documents are never hard-deleted: "delete" cancels the document and
	// records who did it, so the issued history stays intact.
	reason := strings.TrimSpace(c.Query("reason"))
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่ยกเลิกเอกสาร"})
		return
	}
	err = database.CancelStaffDocument(uint(id), c.GetUint("user_id"), reason)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound), errors.Is(err, database.ErrDocumentInactive):
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
	case errors.Is(err, database.ErrDocumentHasDependents):
		c.JSON(http.StatusConflict, gin.H{"error": "มีเอกสารขั้นถัดไปที่สร้างจากเอกสารนี้ — ต้องยกเลิกเอกสารขั้นถัดไปก่อน"})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel document"})
	default:
		c.Status(http.StatusNoContent)
	}
}

// RegVerifyRosterEntry godoc
// @Summary      ทำเครื่องหมายว่าตรวจสอบนักศึกษากับ REG แล้ว
// @Description  เจ้าหน้าที่เทียบชื่อ รหัสนักศึกษา และสถานภาพกับ REG แล้วบันทึกผล ทำได้ทีละคน
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int                true  "Document ID"
// @Param        body  body  regVerifyRequest   true  "ผลการตรวจ REG"
// @Success      200  {object}  models.StaffDocument
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/documents/{id}/reg-verify [put]
func (h *Handler) RegVerifyRosterEntry(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body regVerifyRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	doc, ok := database.UpdateRosterRegEntry(uint(id), body.StudentCode, body.Verified, body.Note)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "document or student not found in roster"})
		return
	}
	c.JSON(http.StatusOK, doc)
}
