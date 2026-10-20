package teacher

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

// MakeupDayRequest is the body for choosing a makeup day.
type MakeupDayRequest struct {
	Date      string `json:"date" binding:"required"`       // YYYY-MM-DD
	StartTime string `json:"start_time" binding:"required"` // HH:MM
	EndTime   string `json:"end_time" binding:"required"`   // HH:MM
}

// MyMakeupDays godoc
// @Summary      วันทำงานที่ชนวันหยุดในรายวิชาของอาจารย์ พร้อมสถานะวันชดเชย
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  database.MakeupDay
// @Router       /instructor/makeup-days [get]
func (h *Handler) MyMakeupDays(c *gin.Context) {
	days, err := database.MakeupDaysForInstructor(c.GetUint("user_id"), c.GetString("role") == "admin")
	if err != nil {
		log.Printf("makeup days for instructor: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, days)
}

// ownedClash loads the holiday clash in the URL and checks that the caller
// manages its course.
func ownedClash(c *gin.Context) (models.WorkOccurrence, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return models.WorkOccurrence{}, false
	}
	var occ models.WorkOccurrence
	if err := database.DB.First(&occ, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบวันทำงาน"})
		return occ, false
	}
	sc, ok := database.StaffCaseByID(occ.StaffCaseID)
	course, ok2 := database.CourseByID(sc.CourseID)
	if !ok || !ok2 || !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์จัดการรายวิชานี้"})
		return occ, false
	}
	return occ, true
}

// respondMakeupError maps a refused makeup decision to its response.
func respondMakeupError(c *gin.Context, err error) {
	if msg := database.MakeupErrorText(err); msg != "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": msg})
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบวันทำงาน"})
		return
	}
	log.Printf("makeup decision: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

// ChooseMakeupDay godoc
// @Summary      เลือกวันชดเชยให้วันทำงานที่ชนวันหยุด
// @Description  วันชดเชยต้องอยู่ในช่วงแผนปฏิบัติงาน ไม่ใช่วันหยุด ไม่ซ้ำวันทำงานเดิม และชั่วโมงไม่เกินวันเดิม — แจ้งเตือน Lab Boy ในกลุ่ม
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int               true  "Occurrence ID (วันที่ชนวันหยุด)"
// @Param        body  body  MakeupDayRequest  true  "วันและเวลาชดเชย"
// @Success      201  {object}  models.WorkOccurrence
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /instructor/occurrences/{id}/makeup [post]
func (h *Handler) ChooseMakeupDay(c *gin.Context) {
	occ, ok := ownedClash(c)
	if !ok {
		return
	}
	var body MakeupDayRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}
	date, err := time.Parse("2006-01-02", body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date; use YYYY-MM-DD"})
		return
	}
	clash, makeup, err := database.ChooseMakeupDay(occ.ID, date, body.StartTime, body.EndTime, c.GetUint("user_id"))
	if err != nil {
		respondMakeupError(c, err)
		return
	}
	database.CreateNotifications(database.MakeupNotifications(clash, &makeup, false))
	c.JSON(http.StatusCreated, makeup)
}

// DeclineMakeupDay godoc
// @Summary      ไม่ชดเชยวันทำงานที่ชนวันหยุด
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Occurrence ID (วันที่ชนวันหยุด)"
// @Success      200  {object}  models.WorkOccurrence
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /instructor/occurrences/{id}/no-makeup [post]
func (h *Handler) DeclineMakeupDay(c *gin.Context) {
	occ, ok := ownedClash(c)
	if !ok {
		return
	}
	clash, err := database.DeclineMakeupDay(occ.ID, c.GetUint("user_id"))
	if err != nil {
		respondMakeupError(c, err)
		return
	}
	database.CreateNotifications(database.MakeupNotifications(clash, nil, false))
	c.JSON(http.StatusOK, clash)
}
