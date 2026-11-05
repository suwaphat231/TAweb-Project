package staff

import (
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/holidaysync"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// HolidaySyncStatus is the state of the Thai public holiday sync.
type HolidaySyncStatus struct {
	Enabled       bool `json:"enabled"`
	IntervalHours int  `json:"interval_hours"`
	// LastSuccessAt is when holidays were last saved from the source (null if never).
	LastSuccessAt *time.Time `json:"last_success_at"`
	// Runs is the latest run of each year, newest year first.
	Runs []models.HolidaySyncRun `json:"runs"`
}

// HolidaySyncResult is the outcome of a manual sync.
type HolidaySyncResult struct {
	Runs []models.HolidaySyncRun `json:"runs"`
}

// HolidaySyncStatus godoc
// @Summary สถานะการซิงก์วันหยุดราชการอัตโนมัติ
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Success 200 {object} HolidaySyncStatus
// @Router /staff/holiday-sync [get]
func (h *Handler) HolidaySyncStatus(c *gin.Context) {
	runs, err := database.LatestHolidaySyncRuns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	last, err := database.LastSuccessfulHolidaySync()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	st := HolidaySyncStatus{Runs: runs}
	if runs == nil {
		st.Runs = []models.HolidaySyncRun{}
	}
	if !last.IsZero() {
		st.LastSuccessAt = &last
	}
	if svc := holidaysync.Shared(); svc != nil {
		st.Enabled = svc.Config().Enabled
		st.IntervalHours = int(svc.Config().Interval / time.Hour)
	}
	c.JSON(http.StatusOK, st)
}

// RunHolidaySync godoc
// @Summary สั่งซิงก์วันหยุดราชการด้วยตนเอง
// @Description ดึงวันหยุดของปีปัจจุบันและปีข้างเคียงจากแหล่งข้อมูล เพิ่ม/อัปเดตเฉพาะรายการที่นำเข้าอัตโนมัติ ไม่แตะวันหยุดที่เจ้าหน้าที่สร้างเอง
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Success 200 {object} HolidaySyncResult
// @Failure 409 {object} handlers.ErrorResponse
// @Router /staff/holiday-sync [post]
func (h *Handler) RunHolidaySync(c *gin.Context) {
	svc := holidaysync.Shared()
	if svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ยังไม่ได้ตั้งค่าการซิงก์วันหยุด"})
		return
	}
	uid := c.GetUint("user_id")
	runs, ran, err := svc.SyncAll(c.Request.Context(), holidaysync.TriggerManual, &uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if !ran {
		c.JSON(http.StatusConflict, gin.H{"error": "กำลังซิงก์วันหยุดอยู่ กรุณารอสักครู่แล้วลองใหม่"})
		return
	}
	c.JSON(http.StatusOK, HolidaySyncResult{Runs: runs})
}

// ListImportedHolidays godoc
// @Summary รายการวันหยุดที่นำเข้าอัตโนมัติ ในปี ค.ศ. ที่ระบุ
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param year query int true "ปี ค.ศ. เช่น 2026"
// @Success 200 {array} models.CalendarDate
// @Failure 400 {object} handlers.ErrorResponse
// @Router /staff/holiday-sync/holidays [get]
func (h *Handler) ListImportedHolidays(c *gin.Context) {
	year, err := strconv.Atoi(c.Query("year"))
	if err != nil || year < 1900 || year > 2200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	rows, err := database.ListExternalHolidays(year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []models.CalendarDate{}
	}
	c.JSON(http.StatusOK, rows)
}
