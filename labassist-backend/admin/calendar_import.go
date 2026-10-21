package admin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// Limits for the academic-calendar import.
const (
	maxCalendarPDFBytes = 10 << 20 // same cap as the OCR service
	maxCalendarRangeDay = 62       // longest range expanded into daily rows
	maxCalendarEntries  = 500      // entries accepted in one confirm request
)

var calendarSemesters = map[string]bool{"1": true, "2": true, "S": true}

// Only holidays are taken from the academic calendar; exams, no-class days
// and other activities in the file are left out.
var calendarImportTypes = map[models.CalendarDateType]bool{
	models.DateTypePublicHoliday:     true,
	models.DateTypeUniversityHoliday: true,
}

// CalendarPreviewEntry is one holiday read from the calendar PDF.
type CalendarPreviewEntry struct {
	StartDate string `json:"start_date" example:"2026-10-23"`
	EndDate   string `json:"end_date" example:"2026-10-23"`
	Name      string `json:"name" example:"วันปิยมหาราช"`
	Semester  string `json:"semester" example:"1"`
	// DateType is the suggested holiday type.
	DateType models.CalendarDateType `json:"date_type" example:"public_holiday"`
	// Include is the suggested default for the admin's checkbox.
	Include bool `json:"include" example:"true"`
	Page    int  `json:"page" example:"1"`
	// Exists is true when every day of the entry is already in the system.
	Exists bool `json:"exists" example:"false"`
}

// CalendarPreviewResponse is what was read from the uploaded PDF.
type CalendarPreviewResponse struct {
	AcademicYear int `json:"academic_year" example:"2569"`
	// DetectedAcademicYear is the year printed in the file ("ปีการศึกษา 2569"), if found.
	DetectedAcademicYear *int                   `json:"detected_academic_year,omitempty" example:"2569"`
	UsedOCR              bool                   `json:"used_ocr" example:"false"`
	Entries              []CalendarPreviewEntry `json:"entries"`
}

// CalendarImportEntry is one reviewed holiday to save. A range is saved as one
// calendar date per day.
type CalendarImportEntry struct {
	StartDate   string                  `json:"start_date" binding:"required" example:"2027-04-13"`
	EndDate     string                  `json:"end_date" example:"2027-04-15"`
	Name        string                  `json:"name" binding:"required" example:"วันสงกรานต์"`
	Semester    string                  `json:"semester" binding:"required" example:"1"`
	DateType    models.CalendarDateType `json:"date_type" binding:"required" example:"public_holiday"`
	AffectsWork bool                    `json:"affects_work" example:"true"`
}

// CalendarImportRequest is the reviewed list confirmed by the admin.
type CalendarImportRequest struct {
	AcademicYear int                   `json:"academic_year" binding:"required" example:"2569"`
	Entries      []CalendarImportEntry `json:"entries" binding:"required"`
}

// CalendarImportResponse summarises a confirmed import.
type CalendarImportResponse struct {
	Created int `json:"created" example:"24"`
	// Skipped counts days already in the system (same date, semester and name).
	Skipped int `json:"skipped" example:"3"`
	// Warning is set when the dates were saved but cancelling clashing work
	// days failed for some of them.
	Warning string `json:"warning,omitempty"`
}

// PreviewCalendarImport godoc
// @Summary      อ่านวันหยุดจากไฟล์ปฏิทินการศึกษา (PDF) ทั้งปีการศึกษา เพื่อให้ตรวจทานก่อนบันทึก
// @Tags         admin
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file           formData  file    true  "ไฟล์ PDF ปฏิทินการศึกษา"
// @Param        academic_year  formData  int     true  "ปีการศึกษา (พ.ศ.)"
// @Success      200  {object}  CalendarPreviewResponse
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      502  {object}  handlers.ErrorResponse
// @Router       /admin/calendar/import/preview [post]
func (h *Handler) PreviewCalendarImport(c *gin.Context) {
	year, err := strconv.Atoi(c.PostForm("academic_year"))
	if err != nil || year < 2500 || year > 2700 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุปีการศึกษาเป็น พ.ศ. เช่น 2569"})
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์ปฏิทินการศึกษา"})
		return
	}
	if strings.ToLower(filepath.Ext(fileHeader.Filename)) != ".pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รองรับเฉพาะไฟล์ PDF"})
		return
	}
	if fileHeader.Size > maxCalendarPDFBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไฟล์ใหญ่เกิน 10 MB"})
		return
	}
	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เปิดไฟล์ไม่สำเร็จ"})
		return
	}
	defer src.Close()

	result, status, msg := h.extractCalendar(src, fileHeader.Filename, year)
	if msg != "" {
		c.JSON(status, gin.H{"error": msg})
		return
	}

	semesters := []string{"1", "2", "S"}
	existing, err := database.ExistingCalendarKeys(year, semesters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	entries := make([]CalendarPreviewEntry, 0, len(result.Entries))
	for _, e := range result.Entries {
		start, err1 := time.Parse("2006-01-02", e.StartDate)
		end, err2 := time.Parse("2006-01-02", e.EndDate)
		if err1 != nil || err2 != nil || end.Before(start) || !calendarSemesters[e.Semester] {
			continue
		}
		if !calendarImportTypes[e.DateType] {
			continue // not a holiday
		}
		e.Exists = true
		for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
			if !existing[database.CalendarKey(d, e.Semester, e.Name)] {
				e.Exists = false
				break
			}
		}
		if e.Exists {
			e.Include = false
		}
		entries = append(entries, e)
	}
	c.JSON(http.StatusOK, CalendarPreviewResponse{
		AcademicYear:         year,
		DetectedAcademicYear: result.DetectedAcademicYear,
		UsedOCR:              result.UsedOCR,
		Entries:              entries,
	})
}

type ocrCalendarResponse struct {
	Entries              []CalendarPreviewEntry `json:"entries"`
	DetectedAcademicYear *int                   `json:"detected_academic_year"`
	UsedOCR              bool                   `json:"used_ocr"`
}

// extractCalendar sends the PDF to the OCR service. On failure it returns
// the HTTP status and message to show; msg is "" on success.
func (h *Handler) extractCalendar(src io.Reader, filename string, year int) (ocrCalendarResponse, int, string) {
	var out ocrCalendarResponse
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(filename))
	if err != nil {
		return out, http.StatusInternalServerError, "internal error"
	}
	if _, err := io.Copy(part, src); err != nil {
		return out, http.StatusInternalServerError, "internal error"
	}
	if err := writer.WriteField("academic_year", strconv.Itoa(year)); err != nil {
		return out, http.StatusInternalServerError, "internal error"
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, h.ocrURL+"/api/ocr/academic-calendar/extract", &body)
	if err != nil {
		return out, http.StatusInternalServerError, "internal error"
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Scanned PDFs go through OCR page by page on CPU: a 3-page university
	// calendar took 2–6 minutes in testing. Keep in step with nginx.conf.
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return out, http.StatusBadGateway, "ไม่สามารถติดต่อบริการอ่านเอกสาร (OCR) ได้ กรุณาลองใหม่อีกครั้ง"
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errBody struct {
			Detail string `json:"detail"`
		}
		if json.NewDecoder(resp.Body).Decode(&errBody) == nil && errBody.Detail != "" {
			status := http.StatusBadGateway
			if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusRequestEntityTooLarge {
				status = http.StatusBadRequest
			}
			return out, status, errBody.Detail
		}
		return out, http.StatusBadGateway, fmt.Sprintf("บริการ OCR ตอบกลับ HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil || out.Entries == nil {
		return out, http.StatusBadGateway, "บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง"
	}
	return out, http.StatusOK, ""
}

// ImportCalendar godoc
// @Summary      บันทึกวันหยุดจากปฏิทินการศึกษาที่ตรวจทานแล้ว
// @Description  รับเฉพาะวันหยุดราชการ/วันหยุดมหาวิทยาลัย ช่วงวันที่จะถูกบันทึกเป็นรายวัน (scope = semester) และแสดงที่หน้ากำหนดวันหยุดปฏิบัติงานของเจ้าหน้าที่ วันที่ซ้ำกับที่มีอยู่ (วันที่ ภาค และชื่อเดียวกัน) จะถูกข้าม
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      CalendarImportRequest  true  "รายการที่เลือก"
// @Success      201   {object}  CalendarImportResponse
// @Failure      400   {object}  handlers.ErrorResponse
// @Router       /admin/calendar/import [post]
func (h *Handler) ImportCalendar(c *gin.Context) {
	var body CalendarImportRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows, msg := calendarRows(body, c.GetUint("user_id"))
	if msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	created, skipped, err := database.ImportCalendarDates(body.AcademicYear, rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกวันหยุดไม่สำเร็จ"})
		return
	}

	// Same follow-up as adding one holiday by hand: cancel the work days that
	// fall on it and ask the instructors of those courses for makeup days.
	resp := CalendarImportResponse{Created: len(created), Skipped: skipped}
	var notifs []models.Notification
	for _, cd := range created {
		if err := database.CancelOccurrencesForHoliday(cd); err != nil {
			log.Printf("cancel occurrences for imported holiday %d: %v", cd.ID, err)
			resp.Warning = "บันทึกวันหยุดแล้ว แต่ยกเลิกวันทำงานที่ตรงกับวันหยุดบางวันไม่สำเร็จ กรุณาตรวจสอบแผนงาน"
			continue
		}
		n, err := database.HolidayClashNotifications(cd)
		if err != nil {
			log.Printf("imported holiday %d clash notifications: %v", cd.ID, err)
			continue
		}
		notifs = append(notifs, n...)
	}
	database.CreateNotifications(notifs)
	c.JSON(http.StatusCreated, resp)
}

// calendarRows validates the reviewed entries and expands each into one
// semester-scoped calendar date per day. msg is "" when everything is valid.
func calendarRows(body CalendarImportRequest, userID uint) ([]models.CalendarDate, string) {
	if body.AcademicYear < 2500 || body.AcademicYear > 2700 {
		return nil, "ปีการศึกษาต้องเป็น พ.ศ. เช่น 2569"
	}
	if len(body.Entries) == 0 {
		return nil, "ไม่มีรายการที่เลือก"
	}
	if len(body.Entries) > maxCalendarEntries {
		return nil, fmt.Sprintf("เลือกได้ไม่เกิน %d รายการต่อครั้ง", maxCalendarEntries)
	}
	// The academic year runs roughly June to May; allow its whole span plus
	// the summer session that ends in the next calendar year.
	ce := body.AcademicYear - 543
	first := time.Date(ce, time.January, 1, 0, 0, 0, 0, time.UTC)
	last := time.Date(ce+1, time.December, 31, 0, 0, 0, 0, time.UTC)

	var rows []models.CalendarDate
	for i, e := range body.Entries {
		n := i + 1
		name := strings.TrimSpace(e.Name)
		if name == "" || len([]rune(name)) > 200 {
			return nil, fmt.Sprintf("รายการที่ %d: ชื่อต้องไม่ว่างและยาวไม่เกิน 200 ตัวอักษร", n)
		}
		if !calendarSemesters[e.Semester] {
			return nil, fmt.Sprintf("รายการที่ %d: ภาคการศึกษาไม่ถูกต้อง", n)
		}
		if !calendarImportTypes[e.DateType] {
			return nil, fmt.Sprintf("รายการที่ %d: ประเภทต้องเป็นวันหยุดราชการหรือวันหยุดมหาวิทยาลัย", n)
		}
		start, err := time.Parse("2006-01-02", e.StartDate)
		if err != nil {
			return nil, fmt.Sprintf("รายการที่ %d: วันที่เริ่มไม่ถูกต้อง", n)
		}
		end := start
		if e.EndDate != "" {
			if end, err = time.Parse("2006-01-02", e.EndDate); err != nil {
				return nil, fmt.Sprintf("รายการที่ %d: วันที่สิ้นสุดไม่ถูกต้อง", n)
			}
		}
		if end.Before(start) {
			return nil, fmt.Sprintf("รายการที่ %d: วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม", n)
		}
		if start.Before(first) || end.After(last) {
			return nil, fmt.Sprintf("รายการที่ %d: วันที่อยู่นอกปีการศึกษา %d", n, body.AcademicYear)
		}
		if int(end.Sub(start).Hours()/24)+1 > maxCalendarRangeDay {
			return nil, fmt.Sprintf("รายการที่ %d: ช่วงวันที่ยาวเกิน %d วัน", n, maxCalendarRangeDay)
		}
		for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
			affects := e.AffectsWork
			rows = append(rows, models.CalendarDate{
				Date:         d,
				Name:         name,
				DateType:     e.DateType,
				Scope:        models.DateScopeSemester,
				Semester:     e.Semester,
				AcademicYear: body.AcademicYear,
				AffectsWork:  &affects,
				EditReason:   "นำเข้าจากปฏิทินการศึกษา",
				CreatedByID:  userID,
			})
		}
	}
	return rows, ""
}
