package staff

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"labassist/database"
	"labassist/docxgen"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// PaymentMonthView is one month of the approval memo's plan in step 4.
type PaymentMonthView struct {
	Year        int                   `json:"year"` // CE
	Month       int                   `json:"month"`
	Sessions    int                   `json:"sessions"`
	TotalAmount float64               `json:"total_amount"`
	Document    *models.StaffDocument `json:"document,omitempty"`
}

// paymentMonths lists the months to bill from the active approval memo, each
// with its active payment request (if created).
func paymentMonths(docs []models.StaffDocument) []PaymentMonthView {
	out := []PaymentMonthView{}
	var memo *models.StaffDocument
	for i := range docs {
		if docs[i].Type == models.DocApprovalMemo && database.IsActiveDocStatus(docs[i].Status) {
			memo = &docs[i]
		}
	}
	if memo == nil {
		return out
	}
	months, rate := database.PlannedMonths(*memo)
	for _, pm := range months {
		v := PaymentMonthView{Year: pm.Year, Month: pm.Month, Sessions: pm.Sessions,
			TotalAmount: database.PlannedMonthAmount(pm, rate, len(memo.Roster))}
		for i := range docs {
			d := docs[i]
			if d.Type == models.DocPaymentRequest && database.IsActiveDocStatus(d.Status) &&
				d.Period != nil && d.Period.Month == pm.Month && d.Period.Year == pm.Year+543 {
				v.Document = &d
			}
		}
		out = append(out, v)
	}
	return out
}

// CreatePaymentRequestRequest picks the month to bill (CE year).
type CreatePaymentRequestRequest struct {
	Year    int    `json:"year" binding:"required"`
	Month   int    `json:"month" binding:"required,min=1,max=12"`
	Replace bool   `json:"replace"`
	Reason  string `json:"reason"`
}

// CreatePaymentRequest godoc
// @Summary      สร้างบันทึกขออนุมัติเบิกจ่ายเงินค่าตอบแทน (ขั้นที่ 4) ของเดือนหนึ่ง
// @Description  สร้างจากบันทึกขออนุมัติจ้าง (ขั้นที่ 2) ทั้งหมด: รายชื่อ Lab Boy, วันทำงานของเดือนนั้นตามแผน, อัตรา และเลขที่/วันที่บันทึกเดิม กดครั้งเดียวไม่ต้องกรอก
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int                          true  "Course ID"
// @Param        body      body  CreatePaymentRequestRequest  true  "เดือนที่เบิก"
// @Success      201  {object}  models.StaffDocument
// @Failure      409  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /staff/courses/{courseId}/payment-requests [post]
func (h *Handler) CreatePaymentRequest(c *gin.Context) {
	course, posting, ok := offering(c)
	if !ok {
		return
	}
	var body CreatePaymentRequestRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Replace && body.Reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่สร้างฉบับใหม่"})
		return
	}
	officer := c.GetString("name")
	doc, err := database.CreatePaymentRequest(database.NewPaymentRequest{
		PostingID: posting.ID, Year: body.Year, Month: body.Month,
		Replace: body.Replace, Reason: body.Reason, ActorID: c.GetUint("user_id"),
		Fill: func(d *models.StaffDocument, memo models.StaffDocument) {
			d.Name = fmt.Sprintf("%s %s เดือน%s %d", docTypeLabel[models.DocPaymentRequest], d.CourseRef,
				docxgen.ThaiMonthName(body.Month), d.Period.Year)
			d.PriorMemoDate = docxgen.ThaiLongDate(memo.CreatedAt)
			d.StaffOfficerName = officer
		},
	})
	switch {
	case errors.Is(err, database.ErrPrerequisiteMissing):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ต้องสร้าง \"บันทึกข้อความ ขออนุมัติจ้างนักศึกษาปฏิบัติงาน\" ก่อน"})
	case errors.Is(err, database.ErrNoPlannedSessions):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "เดือนนี้ไม่มีวันปฏิบัติงานในแผนของบันทึกขออนุมัติจ้าง"})
	case errors.Is(err, database.ErrDocumentExists):
		c.JSON(http.StatusConflict, gin.H{"error": "เดือนนี้มีบันทึกขอเบิกจ่ายอยู่แล้ว — หากต้องการสร้างใหม่ให้เลือกสร้างฉบับใหม่พร้อมระบุเหตุผล"})
	case err != nil:
		log.Printf("create payment request %d: %v", course.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	default:
		c.JSON(http.StatusCreated, doc)
	}
}
