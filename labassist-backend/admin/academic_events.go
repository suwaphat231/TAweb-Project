package admin

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

const maxCalendarEvents = 500

var eventCategories = map[string]bool{
	models.EventRegistration: true, models.EventExam: true, models.EventDeadline: true, models.EventOther: true,
}

var (
	eventRegistrationRe = regexp.MustCompile(`ลงทะเบียน|เพิ่ม\s*[-–]?\s*ถอน|ถอนรายวิชา|ถอนวิชา|ลบข้อมูล|ลบรายวิชา`)
	eventExamRe         = regexp.MustCompile(`สอบ`)
	eventDeadlineRe     = regexp.MustCompile(`สุดท้าย|ภายใน|กำหนดส่ง|กําหนดส่ง`)
	// The rows that open or close the term itself are saved as semester dates.
	eventTermRowRe = regexp.MustCompile(`^(?:วัน)?(?:เปิด|ปิด)(?:ภาค|เรียน)`)
)

// eventCategory sorts an activity by its name. Registration wins over
// "last day" (e.g. "วันสุดท้ายของการลงทะเบียน" is still registration) and exams
// win over deadlines (e.g. "วันสุดท้ายของการสอบ").
func eventCategory(name string) string {
	switch {
	case eventExamRe.MatchString(name) && !strings.Contains(name, "ผลการสอบ"):
		return models.EventExam
	case eventRegistrationRe.MatchString(name):
		return models.EventRegistration
	case eventDeadlineRe.MatchString(name):
		return models.EventDeadline
	}
	return models.EventOther
}

// CalendarPreviewActivity is a non-holiday row of the calendar PDF.
type CalendarPreviewActivity struct {
	StartDate string `json:"start_date" example:"2026-08-22"`
	EndDate   string `json:"end_date" example:"2026-09-05"`
	Name      string `json:"name"`
	Semester  string `json:"semester" example:"1"`
	Category  string `json:"category" example:"exam"`
	Page      int    `json:"page"`
}

// previewActivity turns an OCR row that is not a holiday into an activity.
// ok is false for rows that are saved another way (term open/close).
func previewActivity(e CalendarPreviewEntry) (CalendarPreviewActivity, bool) {
	name := strings.Join(strings.Fields(e.Name), " ")
	if name == "" || eventTermRowRe.MatchString(name) {
		return CalendarPreviewActivity{}, false
	}
	if r := []rune(name); len(r) > 200 {
		name = string(r[:200])
	}
	return CalendarPreviewActivity{
		StartDate: e.StartDate, EndDate: e.EndDate, Name: name,
		Semester: e.Semester, Category: eventCategory(name), Page: e.Page,
	}, true
}

// CalendarImportEvent is one reviewed activity to save.
type CalendarImportEvent struct {
	StartDate string `json:"start_date" binding:"required" example:"2026-08-22"`
	EndDate   string `json:"end_date" example:"2026-09-05"`
	Name      string `json:"name" binding:"required"`
	Semester  string `json:"semester" binding:"required" example:"1"`
	Category  string `json:"category" binding:"required" example:"exam"`
}

// academicEventRows validates the reviewed activities. msg is "" when valid.
func academicEventRows(body CalendarImportRequest, userID uint) ([]models.AcademicEvent, string) {
	if len(body.Events) > maxCalendarEvents {
		return nil, fmt.Sprintf("เลือกกิจกรรมได้ไม่เกิน %d รายการต่อครั้ง", maxCalendarEvents)
	}
	first, last := academicYearWindow(body.AcademicYear)
	var rows []models.AcademicEvent
	for i, e := range body.Events {
		n := i + 1
		name := strings.TrimSpace(e.Name)
		if name == "" || len([]rune(name)) > 200 {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: ชื่อต้องไม่ว่างและยาวไม่เกิน 200 ตัวอักษร", n)
		}
		if !calendarSemesters[e.Semester] {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: ภาคการศึกษาไม่ถูกต้อง", n)
		}
		if !eventCategories[e.Category] {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: ประเภทไม่ถูกต้อง", n)
		}
		start, err := time.Parse("2006-01-02", e.StartDate)
		if err != nil {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: วันที่เริ่มไม่ถูกต้อง", n)
		}
		end := start
		if e.EndDate != "" {
			if end, err = time.Parse("2006-01-02", e.EndDate); err != nil {
				return nil, fmt.Sprintf("กิจกรรมที่ %d: วันที่สิ้นสุดไม่ถูกต้อง", n)
			}
		}
		if end.Before(start) {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม", n)
		}
		if start.Before(first) || end.After(last) {
			return nil, fmt.Sprintf("กิจกรรมที่ %d: วันที่อยู่นอกปีการศึกษา %d", n, body.AcademicYear)
		}
		rows = append(rows, models.AcademicEvent{
			AcademicYear: body.AcademicYear, Semester: e.Semester, StartDate: start, EndDate: end,
			Name: name, Category: e.Category, CreatedByID: userID,
		})
	}
	return rows, ""
}

// ListAcademicEvents godoc
// @Summary      กิจกรรมวิชาการที่บันทึกไว้ (จากปฏิทินการศึกษา)
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        years  query  string  true  "ปีการศึกษา (พ.ศ.) คั่นด้วย , เช่น 2568,2569"
// @Success      200  {array}  models.AcademicEvent
// @Router       /admin/calendar/events [get]
func (h *Handler) ListAcademicEvents(c *gin.Context) {
	var years []int
	for _, p := range strings.Split(c.Query("years"), ",") {
		y, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || y < 2500 || y > 2700 || len(years) >= 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid years"})
			return
		}
		years = append(years, y)
	}
	rows, err := database.ListAcademicEventsForYears(years)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []models.AcademicEvent{}
	}
	c.JSON(http.StatusOK, rows)
}
