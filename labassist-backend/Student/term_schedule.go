package student

import (
	"net/http"
	"strconv"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// GetTermSchedule returns the student's manually-entered schedule for one term.
func (h *Handler) GetTermSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	semester := c.Query("semester")
	academicYear, err := strconv.Atoi(c.Query("academic_year"))
	if err != nil || semester == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "semester and academic_year are required"})
		return
	}
	ts := database.TermScheduleByUserTerm(studentID.(uint), semester, academicYear)
	c.JSON(http.StatusOK, ts)
}

type saveTermScheduleRequest struct {
	Semester     string                    `json:"semester" binding:"required"`
	AcademicYear int                       `json:"academic_year" binding:"required"`
	Slots        []models.ScheduleSlot     `json:"slots"`
	Status       models.TermScheduleStatus `json:"status" binding:"required"`
}

// SaveTermSchedule saves the student's manually-entered schedule for one term.
func (h *Handler) SaveTermSchedule(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	var body saveTermScheduleRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch body.Status {
	case models.TermScheduleSet, models.TermScheduleNoClass, models.TermScheduleUnset:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	if body.Status == models.TermScheduleNoClass && len(body.Slots) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถมีช่วงเวลาเรียนพร้อมกับสถานะไม่มีคาบเรียน"})
		return
	}

	validDays := map[string]bool{
		"MON": true, "TUE": true, "WED": true, "THU": true,
		"FRI": true, "SAT": true, "SUN": true,
	}
	for _, slot := range body.Slots {
		if !validDays[slot.Day] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "วันที่ไม่ถูกต้อง: " + slot.Day})
			return
		}
		if slot.StartTime >= slot.EndTime {
			c.JSON(http.StatusBadRequest, gin.H{"error": "เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด"})
			return
		}
	}

	ts, err := database.UpsertTermSchedule(studentID.(uint), body.Semester, body.AcademicYear, body.Slots, body.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, ts)
}

// GetAvailableTerms returns distinct (semester, academic_year) pairs from
// the courses catalog, newest-first. Used to populate the semester picker.
func (h *Handler) GetAvailableTerms(c *gin.Context) {
	terms := database.DistinctCourseTerms()
	c.JSON(http.StatusOK, terms)
}
