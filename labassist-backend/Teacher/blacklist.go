package teacher

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const maxBlacklistReasonLen = 1000

// BlacklistRequest is the request body for blacklisting a Lab Boy
type BlacklistRequest struct {
	ApplicationID uint   `json:"application_id" binding:"required,gt=0" example:"12"`
	Reason        string `json:"reason" binding:"required" example:"ไม่มาปฏิบัติงานโดยไม่แจ้งล่วงหน้า"`
}

// ListBlacklist godoc
// @Summary      รายชื่อนักศึกษาที่ถูก blacklist (อาจารย์/สตาฟ/แอดมิน)
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.Blacklist
// @Router       /instructor/blacklist [get]
func (h *Handler) ListBlacklist(c *gin.Context) {
	c.JSON(http.StatusOK, database.ActiveBlacklists())
}

// CreateBlacklist godoc
// @Summary      Blacklist Lab Boy ในวิชาของตัวเอง (อาจารย์/แอดมิน)
// @Description  ทำได้เฉพาะใบสมัครที่ผ่านการคัดเลือก (accepted) ในวิชาที่อาจารย์เป็นเจ้าของ — ไม่ได้บล็อกการสมัคร แค่แสดงให้อาจารย์ทุกคนเห็น
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  BlacklistRequest  true  "ใบสมัครและเหตุผล"
// @Success      201   {object}  models.Blacklist
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /instructor/blacklist [post]
func (h *Handler) CreateBlacklist(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var body BlacklistRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผล"})
		return
	}
	if utf8.RuneCountInString(reason) > maxBlacklistReasonLen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เหตุผลยาวเกินไป"})
		return
	}

	app, ok := database.ApplicationByID(body.ApplicationID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	course, ok := database.CourseByID(app.CourseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	// Only students who actually worked as this course's Lab Boy — the
	// instructor has no basis to blacklist an applicant they never worked with.
	if app.Status != models.AppAccepted {
		c.JSON(http.StatusBadRequest, gin.H{"error": "blacklist ได้เฉพาะนักศึกษาที่เป็น Lab Boy ของวิชานี้"})
		return
	}
	if database.HasActiveBlacklistForApplication(app.ID) {
		c.JSON(http.StatusConflict, gin.H{"error": "นักศึกษาคนนี้ถูก blacklist จากวิชานี้แล้ว"})
		return
	}

	appID, courseID := app.ID, course.ID
	entry := models.Blacklist{
		StudentID:     app.StudentID,
		ApplicationID: &appID,
		CourseID:      &courseID,
		ReportedByID:  userID.(uint),
		Reason:        reason,
	}
	if err := database.CreateBlacklist(&entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save blacklist"})
		return
	}
	saved, _ := database.BlacklistByID(entry.ID)
	c.JSON(http.StatusCreated, saved)
}

// RevokeBlacklist godoc
// @Summary      ยกเลิก blacklist (เฉพาะผู้ที่กด หรือแอดมิน)
// @Tags         instructor
// @Security     BearerAuth
// @Param        id  path  int  true  "Blacklist ID"
// @Success      204
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /instructor/blacklist/{id} [delete]
func (h *Handler) RevokeBlacklist(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	entry, ok := database.BlacklistByID(uint(id))
	if !ok || entry.RevokedAt != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "blacklist not found"})
		return
	}
	uid := userID.(uint)
	if role.(string) != "admin" && entry.ReportedByID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "ยกเลิกได้เฉพาะผู้ที่ blacklist เองหรือผู้ดูแลระบบ"})
		return
	}
	if err := database.RevokeBlacklist(entry.ID, uid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot revoke blacklist"})
		return
	}
	c.Status(http.StatusNoContent)
}

// attachBlacklists fills in each applicant's active blacklist entries so the
// reviewer sees the warning next to the application.
func attachBlacklists(apps []models.Application) {
	ids := make([]uint, 0, len(apps))
	for _, a := range apps {
		ids = append(ids, a.StudentID)
	}
	byStudent := database.ActiveBlacklistsByStudent(ids)
	for i := range apps {
		apps[i].Blacklists = byStudent[apps[i].StudentID]
	}
}
