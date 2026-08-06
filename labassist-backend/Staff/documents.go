package staff

import (
	"errors"
	"net/http"
	"strconv"

	"labassist/database"
	"labassist/docxgen"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

type createDocumentRequest struct {
	Type      models.DocType `json:"type"    binding:"required"`
	CourseRef string         `json:"course_ref" binding:"required"`
	Note      string         `json:"note"`

	// Line-item fields — required when Type is payment_evidence,
	// payment_request, or work_report.
	CourseID           *uint   `json:"course_id"`
	Month              int     `json:"month"`
	Year               int     `json:"year"`
	SessionDates       []int   `json:"session_dates"`
	HoursPerSession    float64 `json:"hours_per_session"`
	Rate               float64 `json:"rate"`
	ExcludedStudentIDs []uint  `json:"excluded_student_ids"`

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

var docTypeLabel = map[models.DocType]string{
	models.DocApprovalMemo:    "บันทึกขออนุมัติจ้าง",
	models.DocPaymentEvidence: "หลักฐานการจ่ายเงิน",
	models.DocPaymentRequest:  "บันทึกขอเบิกจ่าย",
	models.DocWorkReport:      "รายงานผลการปฏิบัติงานนอกเวลาราชการ",
}

// needsRoster reports whether a document type carries a per-student roster
// built from the course's currently-accepted applicants.
func needsRoster(t models.DocType) bool {
	return t == models.DocPaymentEvidence || t == models.DocPaymentRequest || t == models.DocWorkReport
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
	c.JSON(http.StatusOK, database.ListStaffDocuments(t, s, q))
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

	doc := models.StaffDocument{
		Name:             label + " " + body.CourseRef,
		Type:             body.Type,
		CourseRef:        body.CourseRef,
		StaffID:          staffID.(uint),
		Status:           models.DocDraft,
		Note:             body.Note,
		RefNumber:        body.RefNumber,
		PriorMemoRef:     body.PriorMemoRef,
		PriorMemoDate:    body.PriorMemoDate,
		DeptHeadName:     body.DeptHeadName,
		DeanName:         body.DeanName,
		StaffOfficerName: body.StaffOfficerName,
	}

	if needsRoster(body.Type) {
		if body.CourseID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course_id is required for this document type"})
			return
		}
		if _, ok := database.CourseByID(*body.CourseID); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "course not found"})
			return
		}

		excluded := make(map[uint]bool, len(body.ExcludedStudentIDs))
		for _, id := range body.ExcludedStudentIDs {
			excluded[id] = true
		}

		hours := body.HoursPerSession * float64(len(body.SessionDates))
		var roster []models.RosterEntry
		var total float64
		for _, app := range database.AcceptedStudentsForCourse(*body.CourseID) {
			if excluded[app.StudentID] {
				continue
			}
			amount := hours * body.Rate
			roster = append(roster, models.RosterEntry{
				StudentID:   app.StudentID,
				StudentName: app.StudentName,
				StudentCode: app.StudentCode,
				Hours:       hours,
				Amount:      amount,
			})
			total += amount
		}

		doc.CourseID = body.CourseID
		doc.Period = &models.DocumentPeriod{Month: body.Month, Year: body.Year}
		doc.SessionDates = body.SessionDates
		doc.HoursPerSession = body.HoursPerSession
		doc.Rate = body.Rate
		doc.Roster = roster
		doc.TotalAmount = total
	}

	created := database.CreateStaffDocument(doc)
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
	case models.DocDraft, models.DocPending, models.DocApproved:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	doc, ok := database.UpdateStaffDocumentStatus(uint(id), body.Status)
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
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate document failed"})
		return
	}

	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}
