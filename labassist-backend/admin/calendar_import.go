package admin

import (
	"bytes"
	"encoding/json"
	"errors"
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
	"labassist/ocrjob"

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

// CalendarPreviewTerm is the open and close date of one semester read from the
// PDF. A date the file did not give is empty so the admin can fill it in.
type CalendarPreviewTerm struct {
	Semester  string `json:"semester" example:"1"`
	OpenDate  string `json:"open_date,omitempty" example:"2026-06-22"`
	CloseDate string `json:"close_date,omitempty" example:"2026-10-30"`
	// OpenName / CloseName are the calendar rows the dates were read from.
	OpenName  string `json:"open_name,omitempty"`
	CloseName string `json:"close_name,omitempty"`
	Page      int    `json:"page,omitempty"`
	// Saved dates already in the system for this semester, if any.
	SavedOpenDate  string `json:"saved_open_date,omitempty"`
	SavedCloseDate string `json:"saved_close_date,omitempty"`
}

// CalendarPreviewResponse is what was read from the uploaded PDF.
type CalendarPreviewResponse struct {
	AcademicYear int `json:"academic_year" example:"2569"`
	// DetectedAcademicYear is the year printed in the file ("ปีการศึกษา 2569"), if found.
	DetectedAcademicYear *int                   `json:"detected_academic_year,omitempty" example:"2569"`
	UsedOCR              bool                   `json:"used_ocr" example:"false"`
	Entries              []CalendarPreviewEntry `json:"entries"`
	// Terms always has the three semesters (1, 2, S).
	Terms []CalendarPreviewTerm `json:"terms"`
	// Activities are the other rows of the calendar (registration, exams,
	// deadlines, ...), saved as academic events.
	Activities []CalendarPreviewActivity `json:"activities"`
	// SavedEvents is how many academic events are already saved for the year
	// (a new import replaces them).
	SavedEvents int `json:"saved_events"`
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

// CalendarImportTerm is the reviewed open/close date of one semester. At least
// one of the two dates is required.
type CalendarImportTerm struct {
	Semester  string `json:"semester" binding:"required" example:"1"`
	OpenDate  string `json:"open_date" example:"2026-06-22"`
	CloseDate string `json:"close_date" example:"2026-10-30"`
}

// CalendarImportRequest is the reviewed list confirmed by the admin. Holidays
// and semester dates are both optional, but not both empty.
type CalendarImportRequest struct {
	AcademicYear int                   `json:"academic_year" binding:"required" example:"2569"`
	Entries      []CalendarImportEntry `json:"entries"`
	Terms        []CalendarImportTerm  `json:"terms"`
	Events       []CalendarImportEvent `json:"events"`
}

// CalendarImportResponse summarises a confirmed import.
type CalendarImportResponse struct {
	Created int `json:"created" example:"24"`
	// TermsSaved counts semesters whose open/close dates were saved.
	TermsSaved int `json:"terms_saved" example:"3"`
	// EventsSaved counts academic events saved (replacing the year's earlier ones).
	EventsSaved int `json:"events_saved" example:"40"`
	// Skipped counts days already in the system (same date, semester and name).
	Skipped int `json:"skipped" example:"3"`
	// Warning is set when the dates were saved but cancelling clashing work
	// days failed for some of them.
	Warning string `json:"warning,omitempty"`
}

// PreviewCalendarImport godoc
// @Summary      อ่านวันหยุดและวันเปิด-ปิดภาคเรียนจากไฟล์ปฏิทินการศึกษา (PDF) เบื้องหลัง
// @Description  ตอบ 202 ทันที ผลอ่านดูได้ที่ GET /admin/calendar/import/job และแจ้ง event "ocr_finished" (kind = calendar) ทาง WebSocket เมื่อเสร็จ
// @Tags         admin
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file           formData  file    true  "ไฟล์ PDF ปฏิทินการศึกษา"
// @Param        academic_year  formData  int     true  "ปีการศึกษา (พ.ศ.)"
// @Success      202  {object}  map[string]string
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
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
	pdf, err := io.ReadAll(io.LimitReader(src, maxCalendarPDFBytes+1))
	if err != nil || len(pdf) > maxCalendarPDFBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไฟล์ใหญ่เกิน 10 MB"})
		return
	}

	// Reading a scanned calendar takes minutes, so it runs in the background:
	// the admin may leave this page and is told over WebSocket when it ends
	// (the result waits at GET /admin/calendar/import/job).
	filename := fileHeader.Filename
	meta := CalendarJobMeta{FileName: filename, AcademicYear: year}
	started := ocrjob.StartResult(c.GetUint("user_id"), ocrjob.Calendar, meta, func() (any, error) {
		return h.buildCalendarPreview(bytes.NewReader(pdf), filename, year)
	})
	if !started {
		c.JSON(http.StatusConflict, gin.H{"error": "กำลังอ่านไฟล์ปฏิทินที่อัปโหลดก่อนหน้าอยู่ กรุณารอให้เสร็จก่อน"})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"status": ocrjob.StatusProcessing})
}

// CalendarJobMeta describes the file a calendar job is reading.
type CalendarJobMeta struct {
	FileName     string `json:"file_name"`
	AcademicYear int    `json:"academic_year"`
}

// buildCalendarPreview reads the PDF through the OCR service and marks what
// is already saved. Its error is shown to the admin as is.
func (h *Handler) buildCalendarPreview(src io.Reader, filename string, year int) (*CalendarPreviewResponse, error) {
	result, _, msg := h.extractCalendar(src, filename, year)
	if msg != "" {
		return nil, errors.New(msg)
	}

	semesters := []string{"1", "2", "S"}
	existing, err := database.ExistingCalendarKeys(year, semesters)
	if err != nil {
		return nil, errors.New("ตรวจรายการที่มีอยู่แล้วไม่สำเร็จ กรุณาลองใหม่")
	}
	entries := make([]CalendarPreviewEntry, 0, len(result.Entries))
	activities := make([]CalendarPreviewActivity, 0)
	for _, e := range result.Entries {
		start, err1 := time.Parse("2006-01-02", e.StartDate)
		end, err2 := time.Parse("2006-01-02", e.EndDate)
		if err1 != nil || err2 != nil || end.Before(start) || !calendarSemesters[e.Semester] {
			continue
		}
		if !calendarImportTypes[e.DateType] {
			// Not a holiday: kept as an academic event.
			if a, ok := previewActivity(e); ok {
				activities = append(activities, a)
			}
			continue
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
	terms, err := previewTerms(year, result.Terms)
	if err != nil {
		return nil, errors.New("ตรวจวันเปิด-ปิดภาคเรียนที่มีอยู่แล้วไม่สำเร็จ กรุณาลองใหม่")
	}
	savedEvents, err := database.CountAcademicEvents(year)
	if err != nil {
		return nil, errors.New("ตรวจกิจกรรมที่มีอยู่แล้วไม่สำเร็จ กรุณาลองใหม่")
	}
	return &CalendarPreviewResponse{
		AcademicYear:         year,
		DetectedAcademicYear: result.DetectedAcademicYear,
		UsedOCR:              result.UsedOCR,
		Entries:              entries,
		Terms:                terms,
		Activities:           activities,
		SavedEvents:          savedEvents,
	}, nil
}

// CalendarJob godoc
// @Summary      งานอ่านปฏิทินการศึกษา (OCR) เบื้องหลังของแอดมิน
// @Description  คืน null เมื่อไม่มีงาน; status = processing | failed | done (done มี result เป็นผลที่ต้องตรวจทาน)
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  ocrjob.State
// @Router       /admin/calendar/import/job [get]
func (h *Handler) CalendarJob(c *gin.Context) {
	c.JSON(http.StatusOK, ocrjob.Get(c.GetUint("user_id"), ocrjob.Calendar))
}

// ClearCalendarJob godoc
// @Summary      ล้างงานอ่านปฏิทินที่เสร็จหรือล้มเหลวแล้ว (หลังบันทึกหรือยกเลิก)
// @Tags         admin
// @Security     BearerAuth
// @Success      204
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /admin/calendar/import/job [delete]
func (h *Handler) ClearCalendarJob(c *gin.Context) {
	uid := c.GetUint("user_id")
	if s := ocrjob.Get(uid, ocrjob.Calendar); s != nil && s.Status == ocrjob.StatusProcessing {
		c.JSON(http.StatusConflict, gin.H{"error": "กำลังอ่านไฟล์อยู่ ยังยกเลิกไม่ได้"})
		return
	}
	ocrjob.Clear(uid, ocrjob.Calendar)
	c.Status(http.StatusNoContent)
}

type ocrCalendarResponse struct {
	Entries              []CalendarPreviewEntry `json:"entries"`
	Terms                []CalendarPreviewTerm  `json:"terms"`
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
	if len(body.Entries) == 0 && len(body.Terms) == 0 && len(body.Events) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่มีรายการที่เลือก"})
		return
	}
	userID := c.GetUint("user_id")
	var rows []models.CalendarDate
	if len(body.Entries) > 0 {
		var msg string
		if rows, msg = calendarRows(body, userID); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
	}
	termRows, msg := academicTermRows(body, userID)
	if msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	eventRows, msg := academicEventRows(body, userID)
	if msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	// Events are replaced only when some were chosen; choosing none keeps the saved ones.
	if len(eventRows) > 0 {
		if err := database.ReplaceAcademicEvents(body.AcademicYear, eventRows); err != nil {
			log.Printf("save academic events: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกกิจกรรมวิชาการไม่สำเร็จ"})
			return
		}
	}
	var created []models.CalendarDate
	var skipped int
	if len(rows) > 0 {
		var err error
		created, skipped, err = database.ImportCalendarDates(body.AcademicYear, rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกวันหยุดไม่สำเร็จ"})
			return
		}
	}
	if err := database.UpsertAcademicTerms(termRows); err != nil {
		log.Printf("save academic terms: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกวันเปิด-ปิดภาคเรียนไม่สำเร็จ"})
		return
	}

	// Same follow-up as adding one holiday by hand: cancel the work days that
	// fall on it.
	resp := CalendarImportResponse{Created: len(created), Skipped: skipped, TermsSaved: len(termRows), EventsSaved: len(eventRows)}
	for _, cd := range created {
		if err := database.CancelOccurrencesForHoliday(cd); err != nil {
			log.Printf("cancel occurrences for imported holiday %d: %v", cd.ID, err)
			resp.Warning = "บันทึกวันหยุดแล้ว แต่ยกเลิกวันทำงานที่ตรงกับวันหยุดบางวันไม่สำเร็จ กรุณาตรวจสอบแผนงาน"
			continue
		}
	}
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

// academicYearWindow is the range of dates accepted for an academic year: its
// whole span plus the summer session that ends in the next calendar year.
func academicYearWindow(academicYear int) (time.Time, time.Time) {
	ce := academicYear - 543
	return time.Date(ce, time.January, 1, 0, 0, 0, 0, time.UTC), time.Date(ce+1, time.December, 31, 0, 0, 0, 0, time.UTC)
}

// parseTermDate reads an optional YYYY-MM-DD date inside the academic year.
// ok is false (with a nil date) for an empty string; err is set for a bad or
// out-of-range one.
func parseTermDate(raw string, academicYear int) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	d, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return nil, fmt.Errorf("วันที่ไม่ถูกต้อง")
	}
	first, last := academicYearWindow(academicYear)
	if d.Before(first) || d.After(last) {
		return nil, fmt.Errorf("วันที่อยู่นอกปีการศึกษา %d", academicYear)
	}
	return &d, nil
}

// academicTermRows validates the reviewed semester dates. msg is "" when valid.
func academicTermRows(body CalendarImportRequest, userID uint) ([]models.AcademicTerm, string) {
	var rows []models.AcademicTerm
	seen := map[string]bool{}
	for _, t := range body.Terms {
		label := "ภาค " + t.Semester
		if !calendarSemesters[t.Semester] {
			return nil, "ภาคการศึกษาของวันเปิด-ปิดภาคเรียนไม่ถูกต้อง"
		}
		if seen[t.Semester] {
			return nil, label + ": ระบุซ้ำ"
		}
		seen[t.Semester] = true
		open, err := parseTermDate(t.OpenDate, body.AcademicYear)
		if err != nil {
			return nil, label + " วันเปิดภาคเรียน: " + err.Error()
		}
		closeDate, err := parseTermDate(t.CloseDate, body.AcademicYear)
		if err != nil {
			return nil, label + " วันปิดภาคเรียน: " + err.Error()
		}
		if open == nil && closeDate == nil {
			continue // nothing entered for this semester
		}
		if open != nil && closeDate != nil && closeDate.Before(*open) {
			return nil, label + ": วันปิดภาคเรียนต้องไม่ก่อนวันเปิดภาคเรียน"
		}
		rows = append(rows, models.AcademicTerm{
			AcademicYear: body.AcademicYear, Semester: t.Semester,
			OpenDate: open, CloseDate: closeDate, CreatedByID: userID,
		})
	}
	return rows, ""
}

// previewTerms returns the three semesters read from the PDF (dates outside
// the academic year are dropped as misreads) with the dates already saved.
func previewTerms(academicYear int, read []CalendarPreviewTerm) ([]CalendarPreviewTerm, error) {
	saved, err := database.ListAcademicTerms(academicYear)
	if err != nil {
		return nil, err
	}
	savedBy := map[string]models.AcademicTerm{}
	for _, t := range saved {
		savedBy[t.Semester] = t
	}
	fmtDate := func(d *time.Time) string {
		if d == nil {
			return ""
		}
		return d.Format("2006-01-02")
	}
	out := make([]CalendarPreviewTerm, 0, 3)
	for _, sem := range []string{"1", "2", "S"} {
		t := CalendarPreviewTerm{Semester: sem}
		for _, r := range read {
			if r.Semester != sem {
				continue
			}
			t = r
			if d, err := parseTermDate(r.OpenDate, academicYear); err != nil || d == nil {
				t.OpenDate, t.OpenName = "", ""
			}
			if d, err := parseTermDate(r.CloseDate, academicYear); err != nil || d == nil {
				t.CloseDate, t.CloseName = "", ""
			}
			break
		}
		if s, ok := savedBy[sem]; ok {
			t.SavedOpenDate, t.SavedCloseDate = fmtDate(s.OpenDate), fmtDate(s.CloseDate)
		}
		out = append(out, t)
	}
	return out, nil
}

// ListAcademicTerms godoc
// @Summary      วันเปิด-ปิดภาคเรียนที่บันทึกไว้ (จากปฏิทินการศึกษา)
// @Tags         admin
// @Produce      json
// @Security     BearerAuth
// @Param        years  query  string  true  "ปีการศึกษา (พ.ศ.) คั่นด้วย , เช่น 2568,2569"
// @Success      200  {array}  models.AcademicTerm
// @Router       /admin/calendar/terms [get]
func (h *Handler) ListAcademicTerms(c *gin.Context) {
	var years []int
	for _, p := range strings.Split(c.Query("years"), ",") {
		y, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || y < 2500 || y > 2700 || len(years) >= 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid years"})
			return
		}
		years = append(years, y)
	}
	rows, err := database.ListAcademicTermsForYears(years)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []models.AcademicTerm{}
	}
	c.JSON(http.StatusOK, rows)
}
