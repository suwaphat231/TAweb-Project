package staff

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type createDocumentRequest struct {
	Type      models.DocType `json:"type"    binding:"required"`
	CourseRef string         `json:"course_ref" binding:"required"`
	Note      string         `json:"note"`
}

type updateDocStatusRequest struct {
	Status models.DocStatus `json:"status" binding:"required"`
}

// ListDocuments godoc
// @Summary      รายการเอกสารของเจ้าหน้าที่
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        type    query  string  false  "approval_memo | payment_evidence | payment_request"
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
// @Summary      สร้างเอกสารใหม่ (บันทึกขออนุมัติ / หลักฐานจ่ายเงิน / บันทึกขอเบิก)
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

	typeLabel := map[models.DocType]string{
		models.DocApprovalMemo:    "บันทึกขออนุมัติจ้าง",
		models.DocPaymentEvidence: "หลักฐานการจ่ายเงิน",
		models.DocPaymentRequest:  "บันทึกขอเบิกจ่าย",
	}
	label, ok := typeLabel[body.Type]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document type"})
		return
	}

	doc := database.CreateStaffDocument(models.StaffDocument{
		Name:      label + " " + body.CourseRef,
		Type:      body.Type,
		CourseRef: body.CourseRef,
		StaffID:   staffID.(uint),
		Status:    models.DocDraft,
		Note:      body.Note,
	})
	c.JSON(http.StatusCreated, doc)
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
