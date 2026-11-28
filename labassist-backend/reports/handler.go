// Package reports holds the Lab Boy performance-record endpoints. A report
// filed by the course's instructor takes effect (CONFIRMED) as soon as that
// instructor submits it. A student may also report another Lab Boy of the
// same course; that report waits (SUBMITTED) until the course instructor
// confirms or rejects it — and only in a course with at least
// database.MinPeerReportLabBoys accepted Lab Boys. Once CONFIRMED, other
// instructors see the student flagged as reported when the student applies
// to their course, and the reported student is told (never by whom) and may
// appeal once within database.AppealWindow; whoever confirmed the report
// decides the appeal. Admin may look but not act; staff never see reports.
// It never blocks a student from applying.
//
// The feature spans every role, so it lives in its own package instead of
// being split across Teacher/Student/Staff; every endpoint re-checks the
// caller against the report itself (workflow.go), not just the route's role.
package reports

import (
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxTextLen          = 2000
	maxReasonLen        = 1000
	maxFileSize         = 5 << 20
	maxFilesPerRequest  = 5
	maxFilesPerReport   = 20
	defaultPageSize     = 20
	maxPageSize         = 100
	dateLayout          = "2006-01-02"
	historyAuditEntity  = "student_performance_history"
	evidenceAuditEntity = "labboy_report_evidence"
)

// bangkok is UTC+7 with no DST, used to decide what "today" is when
// rejecting incident dates in the future.
var bangkok = time.FixedZone("Asia/Bangkok", 7*60*60)

var allowedFileTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"application/pdf": true,
}

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func actorFrom(c *gin.Context) Actor {
	id, _ := c.Get("user_id")
	role, _ := c.Get("role")
	uid, _ := id.(uint)
	r, _ := role.(string)
	return Actor{ID: uid, Role: r}
}

func idParam(c *gin.Context, name string) (uint, bool) {
	n, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil || n == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return uint(n), true
}

// loadVisible fetches a report and answers 404 both when it does not exist
// and when the caller may not see it, so IDs cannot be probed.
func loadVisible(c *gin.Context, actor *Actor) (models.LabBoyReport, bool) {
	id, ok := idParam(c, "id")
	if !ok {
		return models.LabBoyReport{}, false
	}
	r, found := database.ReportByID(id)
	if found {
		*actor = withCourse(*actor, r)
	}
	if !found || !CanView(r, *actor) {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return models.LabBoyReport{}, false
	}
	return r, true
}

// withCourse marks whether the actor teaches the report's course, which is
// what lets an instructor review a report a student sent in.
func withCourse(actor Actor, r models.LabBoyReport) Actor {
	if actor.isInstructor() {
		if course, ok := database.CourseByID(r.CourseID); ok {
			actor.CourseInstructor = database.InstructorOwnsCourse(course, actor.ID, "", false)
		}
		if by, _, ok := database.ReportConfirmation(r.ID); ok && by == actor.ID {
			actor.Confirmer = true
		}
	}
	return actor
}

func denialStatus(d *Denial) int {
	if d.Forbidden {
		return http.StatusForbidden
	}
	return http.StatusConflict
}

func cleanText(s string, max int, field string, required bool) (string, error) {
	s = strings.TrimSpace(s)
	if required && s == "" {
		return "", fmt.Errorf("กรุณาระบุ%s", field)
	}
	if utf8.RuneCountInString(s) > max {
		return "", fmt.Errorf("%sยาวเกิน %d ตัวอักษร", field, max)
	}
	return s, nil
}

// ReportInput is the body for creating or updating a draft.
type ReportInput struct {
	ApplicationID uint   `json:"application_id" binding:"required,gt=0" example:"12"`
	IncidentDate  string `json:"incident_date" binding:"required" example:"2026-09-15"`
	Category      string `json:"category" binding:"required" example:"ABSENCE"`
	Description   string `json:"description" binding:"required" example:"ไม่มาปฏิบัติงานคาบแล็บวันที่ 15 โดยไม่แจ้งล่วงหน้า"`
	Impact        string `json:"impact" example:"ต้องให้นักศึกษาช่วยแล็บคนอื่นทำแทน"`
}

// validate checks the body without touching the database.
func (in ReportInput) validate() (models.LabBoyReport, error) {
	var r models.LabBoyReport
	cat := models.ReportCategory(strings.TrimSpace(in.Category))
	if !cat.Valid() {
		return r, errors.New("ประเภทเหตุการณ์ไม่ถูกต้อง")
	}
	d, err := time.ParseInLocation(dateLayout, strings.TrimSpace(in.IncidentDate), time.UTC)
	if err != nil {
		return r, errors.New("วันที่เกิดเหตุไม่ถูกต้อง (YYYY-MM-DD)")
	}
	now := time.Now().In(bangkok)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if d.After(today) {
		return r, errors.New("วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต")
	}
	desc, err := cleanText(in.Description, maxTextLen, "รายละเอียดเหตุการณ์", true)
	if err != nil {
		return r, err
	}
	impact, err := cleanText(in.Impact, maxTextLen, "ผลกระทบ", false)
	if err != nil {
		return r, err
	}
	r.ApplicationID = in.ApplicationID
	r.IncidentDate = d
	r.Category = cat
	r.Description = desc
	r.Impact = impact
	return r, nil
}

// resolveApplication ties the report to a real Lab Boy job in a course the
// caller manages, and copies student and course from it — the client never
// gets to choose them.
func resolveApplication(c *gin.Context, actor Actor, r *models.LabBoyReport) bool {
	app, ok := database.ApplicationByID(r.ApplicationID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return false
	}
	course, ok := database.CourseByID(app.CourseID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return false
	}
	if !database.InstructorOwnsCourse(course, actor.ID, "", actor.isAdmin()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "รายงานได้เฉพาะรายวิชาที่ท่านเป็นผู้สอน"})
		return false
	}
	if app.Status != models.AppAccepted {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รายงานได้เฉพาะนักศึกษาที่เป็น Lab Boy ของรายวิชานี้"})
		return false
	}
	r.StudentID = app.StudentID
	r.CourseID = app.CourseID
	return true
}

var peerTooSmallMessage = fmt.Sprintf("รายวิชานี้มี Lab Boy น้อยกว่า %d คน จึงไม่เปิดให้นักศึกษารายงานกันเอง หากพบปัญหาโปรดแจ้งอาจารย์ผู้สอนโดยตรง", database.MinPeerReportLabBoys)

func writeDBError(c *gin.Context, err error, what string) {
	switch {
	case errors.Is(err, database.ErrDuplicateReport):
		c.JSON(http.StatusConflict, gin.H{"error": "มีรายงานเหตุการณ์ประเภทนี้ของนักศึกษาคนนี้ในวันเดียวกันอยู่แล้ว"})
	case errors.Is(err, database.ErrStaleReport):
		c.JSON(http.StatusConflict, gin.H{"error": "สถานะรายงานเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่"})
	case errors.Is(err, database.ErrReporterDailyLimit):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "ส่งรายงานได้วันละ 1 ครั้ง กรุณาลองใหม่ในวันถัดไป"})
	case errors.Is(err, database.ErrPeerCourseTooSmall):
		c.JSON(http.StatusForbidden, gin.H{"error": peerTooSmallMessage})
	case errors.Is(err, database.ErrAppealClosed):
		c.JSON(http.StatusConflict, gin.H{"error": "พ้นกำหนดยื่นอุทธรณ์แล้ว"})
	case errors.Is(err, database.ErrAlreadyAppealed):
		c.JSON(http.StatusConflict, gin.H{"error": "ยื่นอุทธรณ์ได้เพียง 1 ครั้งต่อบันทึก"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
	default:
		log.Printf("%s: %v", what, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

// CreateReport godoc
// @Summary      สร้างร่างรายงานการปฏิบัติงานของ Lab Boy (อาจารย์/แอดมิน)
// @Description  ได้เฉพาะ Lab Boy (ใบสมัคร accepted) ในรายวิชาที่ผู้รายงานเป็นผู้สอน — บันทึกเป็น DRAFT ยังไม่มีผลใด ๆ จนกว่าจะส่งและผ่านการตรวจสอบ
// @Tags         reports
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ReportInput  true  "ข้อมูลรายงาน"
// @Success      201   {object}  models.LabBoyReport
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /instructor/reports [post]
func (h *Handler) CreateReport(c *gin.Context) {
	actor := actorFrom(c)
	var in ReportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}
	r, err := in.validate()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !resolveApplication(c, actor, &r) {
		return
	}
	r.ReporterID = actor.ID
	if err := database.CreateReportDraft(&r); err != nil {
		writeDBError(c, err, "create report")
		return
	}
	saved, _ := database.ReportByID(r.ID)
	c.JSON(http.StatusCreated, saved)
}

// UpdateDraft godoc
// @Summary      แก้ไขร่างรายงาน (เฉพาะผู้รายงาน และเฉพาะสถานะ DRAFT)
// @Tags         reports
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int          true  "Report ID"
// @Param        body  body      ReportInput  true  "ข้อมูลรายงาน"
// @Success      200   {object}  models.LabBoyReport
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /instructor/reports/{id} [put]
func (h *Handler) UpdateDraft(c *gin.Context) {
	actor := actorFrom(c)
	existing, ok := loadVisible(c, &actor)
	if !ok {
		return
	}
	if !CanEditDraft(existing, actor) {
		if existing.ReporterID != actor.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "แก้ไขได้เฉพาะผู้รายงาน"})
		} else {
			c.JSON(http.StatusConflict, gin.H{"error": "แก้ไขได้เฉพาะรายงานที่ยังเป็นฉบับร่าง"})
		}
		return
	}
	var in ReportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}
	next, err := in.validate()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !resolveApplication(c, actor, &next) {
		return
	}
	updated, err := database.UpdateReportDraft(existing.ID, actor.ID, func(r *models.LabBoyReport) {
		r.ApplicationID, r.StudentID, r.CourseID = next.ApplicationID, next.StudentID, next.CourseID
		r.IncidentDate, r.Category, r.Description, r.Impact = next.IncidentDate, next.Category, next.Description, next.Impact
	})
	if err != nil {
		writeDBError(c, err, "update report draft")
		return
	}
	c.JSON(http.StatusOK, updated)
}

// ReportPage is one page of a report list.
type ReportPage struct {
	Data  []models.LabBoyReport `json:"data"`
	Total int64                 `json:"total"`
	Page  int                   `json:"page"`
	Limit int                   `json:"limit"`
}

// parseFilter reads the list query string. Scope (whose reports) is added
// by each endpoint from the caller's account.
func parseFilter(c *gin.Context) (database.ReportFilter, error) {
	f := database.ReportFilter{Page: 1, Limit: defaultPageSize}
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p > 0 {
		f.Page = p
	}
	if l, err := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(defaultPageSize))); err == nil && l > 0 {
		f.Limit = min(l, maxPageSize)
	}
	for _, s := range strings.Split(c.Query("status"), ",") {
		if s = strings.TrimSpace(s); s != "" {
			f.Statuses = append(f.Statuses, models.ReportStatus(s))
		}
	}
	if cat := c.Query("category"); cat != "" {
		if !models.ReportCategory(cat).Valid() {
			return f, errors.New("ประเภทเหตุการณ์ไม่ถูกต้อง")
		}
		f.Category = models.ReportCategory(cat)
	}
	if cid, err := strconv.Atoi(c.Query("course_id")); err == nil && cid > 0 {
		f.CourseID = uint(cid)
	}
	for key, dst := range map[string]**time.Time{"date_from": &f.DateFrom, "date_to": &f.DateTo} {
		if v := c.Query(key); v != "" {
			d, err := time.Parse(dateLayout, v)
			if err != nil {
				return f, errors.New("รูปแบบวันที่ไม่ถูกต้อง")
			}
			*dst = &d
		}
	}
	f.Search = c.Query("q")
	return f, nil
}

func (h *Handler) list(c *gin.Context, scope func(f *database.ReportFilter)) {
	f, err := parseFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scope(&f)
	rows, total, err := database.ListReports(f)
	if err != nil {
		log.Printf("list reports: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, ReportPage{Data: rows, Total: total, Page: f.Page, Limit: f.Limit})
}

// ListMine godoc
// @Summary      รายงานที่ฉันเป็นผู้รายงาน (อาจารย์/แอดมิน)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        q          query  string  false  "ค้นหาชื่อ/รหัสนักศึกษา"
// @Param        status     query  string  false  "สถานะ (คั่นด้วย , ได้)"
// @Param        category   query  string  false  "ประเภทเหตุการณ์"
// @Param        course_id  query  int     false  "รายวิชา"
// @Param        date_from  query  string  false  "วันที่เกิดเหตุตั้งแต่ (YYYY-MM-DD)"
// @Param        date_to    query  string  false  "วันที่เกิดเหตุถึง (YYYY-MM-DD)"
// @Param        page       query  int     false  "หน้า"
// @Param        limit      query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /instructor/reports [get]
func (h *Handler) ListMine(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.ReporterID = &actor.ID })
}

// ReviewQueue godoc
// @Summary      รายงานทั้งหมดสำหรับแอดมิน (ดูอย่างเดียว ไม่รวมฉบับร่าง)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        q          query  string  false  "ค้นหาชื่อ/รหัสนักศึกษา"
// @Param        status     query  string  false  "สถานะ (คั่นด้วย , ได้)"
// @Param        category   query  string  false  "ประเภทเหตุการณ์"
// @Param        course_id  query  int     false  "รายวิชา"
// @Param        date_from  query  string  false  "วันที่เกิดเหตุตั้งแต่ (YYYY-MM-DD)"
// @Param        date_to    query  string  false  "วันที่เกิดเหตุถึง (YYYY-MM-DD)"
// @Param        page       query  int     false  "หน้า"
// @Param        limit      query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /admin/reports [get]
func (h *Handler) ReviewQueue(c *gin.Context) {
	h.list(c, func(f *database.ReportFilter) { f.ExcludeDraft = true })
}

// ReviewList godoc
// @Summary      รายงานจากนักศึกษาในรายวิชาที่ฉันสอน (คิวตรวจสอบของอาจารย์)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        status     query  string  false  "สถานะ (คั่นด้วย , ได้) — SUBMITTED = รอตรวจ"
// @Param        q          query  string  false  "ค้นหาชื่อ/รหัสนักศึกษา"
// @Param        course_id  query  int     false  "รายวิชา"
// @Param        page       query  int     false  "หน้า"
// @Param        limit      query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /instructor/reports/review [get]
func (h *Handler) ReviewList(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.ReviewerID = &actor.ID })
}

// AppealQueue godoc
// @Summary      คำอุทธรณ์ของนักศึกษาต่อรายงานที่ฉันเป็นผู้ยืนยัน
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "สถานะ (คั่นด้วย , ได้)"
// @Param        page    query  int     false  "หน้า"
// @Param        limit   query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /instructor/reports/appeals [get]
func (h *Handler) AppealQueue(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.AppealReviewerID = &actor.ID })
}

// StudentMine godoc
// @Summary      รายงานที่ฉัน (นักศึกษา) ส่ง พร้อมผลการตรวจสอบของอาจารย์
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "สถานะ (คั่นด้วย , ได้)"
// @Param        page    query  int     false  "หน้า"
// @Param        limit   query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /student/reports [get]
func (h *Handler) StudentMine(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.ReporterID = &actor.ID })
}

// StudentCreate godoc
// @Summary      นักศึกษารายงาน Lab Boy ในรายวิชาเดียวกัน (ส่งให้อาจารย์ผู้สอนตรวจสอบ)
// @Description  ผู้รายงานและผู้ถูกรายงานต้องเป็น Lab Boy (accepted) ของรายวิชาเดียวกัน — รายงานเป็น SUBMITTED และยังไม่มีผลจนกว่าอาจารย์จะยืนยัน
// @Tags         reports
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ReportInput  true  "ข้อมูลรายงาน"
// @Success      201   {object}  models.LabBoyReport
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /student/reports [post]
func (h *Handler) StudentCreate(c *gin.Context) {
	actor := actorFrom(c)
	var in ReportInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}
	r, err := in.validate()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r.ReporterID = actor.ID
	if err := database.CreateSubmittedPeerReport(&r); err != nil {
		switch {
		case errors.Is(err, database.ErrPeerCourseTooSmall):
			c.JSON(http.StatusForbidden, gin.H{"error": peerTooSmallMessage})
		case errors.Is(err, database.ErrPeerReporterNotAccepted):
			c.JSON(http.StatusForbidden, gin.H{"error": "ส่งรายงานได้เฉพาะ Lab Boy ที่ได้รับการยืนยันในรายวิชาเดียวกัน"})
		case errors.Is(err, database.ErrPeerTargetNotAccepted):
			c.JSON(http.StatusBadRequest, gin.H{"error": "รายงานได้เฉพาะ Lab Boy คนอื่นที่ได้รับการยืนยันในรายวิชาเดียวกัน"})
		default:
			writeDBError(c, err, "create student report")
		}
		return
	}
	saved, _ := database.ReportByID(r.ID)
	c.JSON(http.StatusCreated, saved)
}

// ReportDetail is everything about one report the caller may see.
type ReportDetail struct {
	Report         models.LabBoyReport                `json:"report"`
	Evidence       []models.LabBoyReportEvidence      `json:"evidence"`
	Responses      []models.LabBoyReportResponse      `json:"responses"`
	Reviews        []models.LabBoyReportReview        `json:"reviews"`
	History        []models.LabBoyReportStatusHistory `json:"history"`
	AllowedActions []Action                           `json:"allowed_actions"`
	CanEdit        bool                               `json:"can_edit"`
	CanAddEvidence bool                               `json:"can_add_evidence"`
}

// Detail godoc
// @Summary      รายละเอียดรายงาน พร้อมหลักฐาน คำชี้แจง ผลการตรวจสอบ และไทม์ไลน์
// @Description  อาจารย์ผู้รายงาน และแอดมิน (ดูอย่างเดียว) เท่านั้น — ผู้อื่นได้ 404
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Report ID"
// @Success      200  {object}  ReportDetail
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /reports/{id} [get]
func (h *Handler) Detail(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, &actor)
	if !ok {
		return
	}
	evidence, err1 := database.ReportEvidenceList(r.ID)
	responses, err2 := database.ReportResponses(r.ID)
	reviews, err3 := database.ReportReviews(r.ID)
	history, err4 := database.ReportStatusHistory(r.ID)
	if err := errors.Join(err1, err2, err3, err4); err != nil {
		log.Printf("report detail %d: %v", r.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if actor.isStudent() {
		evidence, responses, reviews, history = forStudentReporter(evidence, responses, reviews, history)
	}
	c.JSON(http.StatusOK, ReportDetail{
		Report:         r,
		Evidence:       evidence,
		Responses:      responses,
		Reviews:        reviews,
		History:        history,
		AllowedActions: AllowedActions(r, actor),
		CanEdit:        CanEditDraft(r, actor),
		CanAddEvidence: CanAddEvidence(r, actor),
	})
}

// forStudentReporter trims a report's detail for the student who sent it in:
// they see their own report and the instructor's first decision, but never
// the reported student's appeal, its files, or the reasoning on it — the
// appeal is between the reported student and the instructor who confirmed.
func forStudentReporter(evidence []models.LabBoyReportEvidence, responses []models.LabBoyReportResponse,
	reviews []models.LabBoyReportReview, history []models.LabBoyReportStatusHistory,
) ([]models.LabBoyReportEvidence, []models.LabBoyReportResponse, []models.LabBoyReportReview, []models.LabBoyReportStatusHistory) {
	ev := make([]models.LabBoyReportEvidence, 0, len(evidence))
	for _, e := range evidence {
		if e.ResponseID == nil {
			ev = append(ev, e)
		}
	}
	resp := make([]models.LabBoyReportResponse, 0)
	for _, x := range responses {
		if x.Kind != models.ResponseReconsideration {
			resp = append(resp, x)
		}
	}
	// Only the decision on the report itself; later rows are appeal rulings.
	if len(reviews) > 1 {
		reviews = reviews[:1]
	}
	hist := make([]models.LabBoyReportStatusHistory, len(history))
	copy(hist, history)
	for i := range hist {
		if hist[i].FromStatus != nil && *hist[i].FromStatus == models.ReportConfirmed && hist[i].ToStatus == models.ReportNotSubstantiated {
			hist[i].Reason = ""
		}
	}
	return ev, resp, reviews, hist
}

// isAppealFile reports whether an evidence file came with a response (the
// reported student's appeal) rather than from the reporter.
func isAppealFile(e models.LabBoyReportEvidence) bool { return e.ResponseID != nil }

// ActionRequest is the body for a workflow step.
type ActionRequest struct {
	Action string `json:"action" binding:"required" example:"submit"`
	Reason string `json:"reason" example:"รายงานผิดคน"`
}

var actionAudit = map[Action]string{
	ActionSubmit: "submit", ActionWithdraw: "withdraw",
	ActionConfirm: "confirm", ActionNotSubstantiated: "not_substantiated",
	ActionAppealUphold: "appeal_uphold", ActionAppealOverturn: "appeal_overturn",
}

// Act godoc
// @Summary      ดำเนินการตาม workflow ของรายงาน
// @Description  ผู้รายงาน: submit (อาจารย์ส่งแล้วมีผลทันที), withdraw (ต้องระบุ reason; นักศึกษาถอนได้เฉพาะระหว่างรอตรวจ) — อาจารย์ผู้สอนของรายวิชา สำหรับรายงานจากนักศึกษา: confirm หรือ not_substantiated (ต้องระบุ reason)
// @Tags         reports
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int            true  "Report ID"
// @Param        body  body      ActionRequest  true  "การดำเนินการ"
// @Success      200   {object}  models.LabBoyReport
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /reports/{id}/actions [post]
func (h *Handler) Act(c *gin.Context) {
	actor := actorFrom(c)
	var body ActionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุการดำเนินการ"})
		return
	}
	reason, err := cleanText(body.Reason, maxReasonLen, "เหตุผล", false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r, ok := loadVisible(c, &actor)
	if !ok {
		return
	}
	action := Action(body.Action)
	to, denial := CheckAction(r, actor, action, reason)
	if denial != nil {
		c.JSON(denialStatus(denial), gin.H{"error": denial.Message})
		return
	}
	t := database.ReportTransition{
		ReportID:      r.ID,
		From:          r.Status,
		To:            to,
		ActorID:       actor.ID,
		Reason:        reason,
		Action:        actionAudit[action],
		Review:        rules[action].review,
		Notifications: notificationsFor(r, action, reason),
	}
	if action == ActionAppealUphold || action == ActionAppealOverturn {
		t.ClearReconsideration = true
	}
	if to == models.ReportConfirmed && r.Status != models.ReportConfirmed {
		deadline := time.Now().Add(database.AppealWindow)
		t.AppealDeadline = &deadline
		t.Notifications = append(t.Notifications, database.RecordTakenEffectNotice(r, deadline))
	}
	if err := database.ApplyReportTransition(t); err != nil {
		writeDBError(c, err, "report transition")
		return
	}
	saved, _ := database.ReportByID(r.ID)
	c.JSON(http.StatusOK, saved)
}

// notificationsFor tells a student who sent in a report what the instructor
// decided, and tells the reported student how their appeal ended. (The
// notice that a report took effect is added in Act, the same for both
// paths into CONFIRMED.) Nothing sent to the reported student names the
// reporter or says whether it was a student.
func notificationsFor(r models.LabBoyReport, action Action, reason string) []models.Notification {
	if action == ActionAppealUphold || action == ActionAppealOverturn {
		course := strings.TrimSpace(r.CourseCode + " " + r.CourseTitle)
		courseID := r.CourseID
		result := "คงบันทึกเดิม"
		if action == ActionAppealOverturn {
			result = "รับอุทธรณ์ — บันทึกนี้ไม่มีผลแล้ว"
		}
		body := fmt.Sprintf("ผลอุทธรณ์บันทึกการปฏิบัติงานรายวิชา %s: %s", course, result)
		if reason != "" {
			body += "\nเหตุผล: " + reason
		}
		return []models.Notification{{UserID: r.StudentID, CourseID: &courseID, Title: "ผลการพิจารณาอุทธรณ์", Body: body}}
	}
	if action != ActionConfirm && action != ActionNotSubstantiated {
		return nil
	}
	course := strings.TrimSpace(r.CourseCode + " " + r.CourseTitle)
	result := "อาจารย์ยืนยันรายงานแล้ว"
	if action == ActionNotSubstantiated {
		result = "อาจารย์ไม่รับรายงาน"
	}
	body := fmt.Sprintf("รายงานการปฏิบัติงานของ %s ในรายวิชา %s: %s", r.StudentName, course, result)
	if reason != "" {
		body += "\nเหตุผล: " + reason
	}
	courseID := r.CourseID
	return []models.Notification{{UserID: r.ReporterID, CourseID: &courseID, Title: "ผลการตรวจสอบรายงานที่คุณส่ง", Body: body}}
}

// readFiles validates uploaded evidence: count, size and real content type
// (sniffed from the bytes, not trusted from the browser). The stored name is
// only display metadata — files live in the database, never on a path built
// from it.
func readFiles(headers []*multipart.FileHeader) ([]models.LabBoyReportEvidence, error) {
	if len(headers) > maxFilesPerRequest {
		return nil, fmt.Errorf("แนบไฟล์ได้ไม่เกิน %d ไฟล์ต่อครั้ง", maxFilesPerRequest)
	}
	out := make([]models.LabBoyReportEvidence, 0, len(headers))
	for _, fh := range headers {
		if fh.Size > maxFileSize {
			return nil, errors.New("ไฟล์มีขนาดเกิน 5MB")
		}
		f, err := fh.Open()
		if err != nil {
			return nil, errors.New("ไม่สามารถอ่านไฟล์ได้")
		}
		data, err := io.ReadAll(io.LimitReader(f, maxFileSize+1))
		f.Close()
		if err != nil {
			return nil, errors.New("ไม่สามารถอ่านไฟล์ได้")
		}
		if len(data) == 0 || len(data) > maxFileSize {
			return nil, errors.New("ไฟล์ว่างหรือมีขนาดเกิน 5MB")
		}
		ct := http.DetectContentType(data)
		if !allowedFileTypes[ct] {
			return nil, errors.New("รองรับเฉพาะไฟล์ .jpg .png และ .pdf")
		}
		out = append(out, models.LabBoyReportEvidence{
			FileName: safeFileName(fh.Filename), ContentType: ct, SizeBytes: int64(len(data)), Data: data,
		})
	}
	return out, nil
}

func safeFileName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == '"' {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == "/" {
		name = "evidence"
	}
	if utf8.RuneCountInString(name) > 200 {
		name = string([]rune(name)[:200])
	}
	return name
}

func checkFileQuota(c *gin.Context, reportID uint, adding int) bool {
	n, err := database.CountReportEvidence(reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return false
	}
	if int(n)+adding > maxFilesPerReport {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("รายงานหนึ่งฉบับแนบไฟล์ได้ไม่เกิน %d ไฟล์", maxFilesPerReport)})
		return false
	}
	return true
}

// UploadEvidence godoc
// @Summary      แนบหลักฐานของผู้รายงาน (.jpg .png .pdf ไม่เกิน 5MB ต่อไฟล์)
// @Description  เฉพาะอาจารย์ผู้รายงาน (ยกเว้นรายงานที่ถอนแล้ว)
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id     path      int   true  "Report ID"
// @Param        files  formData  file  true  "ไฟล์หลักฐาน (ส่งได้หลายไฟล์)"
// @Success      201    {array}   models.LabBoyReportEvidence
// @Failure      400    {object}  handlers.ErrorResponse
// @Failure      403    {object}  handlers.ErrorResponse
// @Failure      404    {object}  handlers.ErrorResponse
// @Router       /instructor/reports/{id}/evidence [post]
func (h *Handler) UploadEvidence(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, &actor)
	if !ok {
		return
	}
	if !CanAddEvidence(r, actor) {
		c.JSON(http.StatusForbidden, gin.H{"error": "แนบหลักฐานได้เฉพาะอาจารย์ผู้รายงาน"})
		return
	}
	form, err := c.MultipartForm()
	if err != nil || len(form.File["files"]) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกไฟล์"})
		return
	}
	files, err := readFiles(form.File["files"])
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !checkFileQuota(c, r.ID, len(files)) {
		return
	}
	if err := database.AddReportEvidence(r.ID, actor.ID, EvidenceStatuses(), files); err != nil {
		writeDBError(c, err, "add evidence")
		return
	}
	list, _ := database.ReportEvidenceList(r.ID)
	c.JSON(http.StatusCreated, list)
}

// DownloadEvidence godoc
// @Summary      เปิดไฟล์หลักฐาน (ตรวจสิทธิ์ก่อนทุกครั้ง และบันทึกการเข้าถึง)
// @Tags         reports
// @Produce      octet-stream
// @Security     BearerAuth
// @Param        id          path  int  true  "Report ID"
// @Param        evidenceId  path  int  true  "Evidence ID"
// @Success      200
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /reports/{id}/evidence/{evidenceId} [get]
func (h *Handler) DownloadEvidence(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, &actor)
	if !ok {
		return
	}
	eid, ok := idParam(c, "evidenceId")
	if !ok {
		return
	}
	e, found := database.ReportEvidenceFile(r.ID, eid)
	// A student reporter never gets the reported student's appeal files.
	if !found || (actor.isStudent() && isAppealFile(e)) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	if err := database.LogSensitiveAccess(evidenceAuditEntity, e.ID, "view_evidence", actor.ID, fmt.Sprintf("report %d", r.ID)); err != nil {
		log.Printf("audit evidence view: %v", err)
	}
	c.Header("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": e.FileName}))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, e.ContentType, e.Data)
}

// ConfirmedHistory godoc
// @Summary      ประวัติการปฏิบัติงานที่ยืนยันแล้วของผู้สมัคร
// @Description  แสดงเฉพาะรายงานที่อาจารย์ส่งแล้ว (CONFIRMED, ไม่รวมหลักฐาน) สำหรับอาจารย์ผู้สอนของรายวิชาที่นักศึกษาสมัคร หรือแอดมิน — เจ้าหน้าที่ไม่เห็น ทุกการเปิดดูถูกบันทึก
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Application ID"
// @Success      200  {array}   models.ConfirmedRecord
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /instructor/applications/{id}/performance-records [get]
func (h *Handler) ConfirmedHistory(c *gin.Context) {
	actor := actorFrom(c)
	id, ok := idParam(c, "id")
	if !ok {
		return
	}
	app, found := database.ApplicationByID(id)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	course, courseFound := database.CourseByID(app.CourseID)
	if !actor.isAdmin() && (!actor.isInstructor() || !courseFound || !database.InstructorOwnsCourse(course, actor.ID, "", false)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if !courseFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	rows, err := database.ConfirmedRecordsForStudent(app.StudentID, course.AcademicYear)
	if err != nil {
		log.Printf("confirmed history: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if err := database.LogSensitiveAccess(historyAuditEntity, app.StudentID, "view_confirmed_history", actor.ID,
		fmt.Sprintf("application %d, %d records", app.ID, len(rows))); err != nil {
		log.Printf("audit history view: %v", err)
	}
	c.JSON(http.StatusOK, rows)
}

// StudentRecords godoc
// @Summary      บันทึกการปฏิบัติงานที่มีผลกับฉัน (นักศึกษาผู้ถูกรายงาน)
// @Description  เฉพาะบันทึกที่มีผลแล้ว ไม่ระบุผู้รายงานและไม่บอกว่ามาจากนักศึกษาหรืออาจารย์ — พร้อมสถานะอุทธรณ์
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  models.StudentRecord
// @Router       /student/reports/about-me [get]
func (h *Handler) StudentRecords(c *gin.Context) {
	actor := actorFrom(c)
	rows, err := database.StudentRecords(actor.ID)
	if err != nil {
		log.Printf("student records: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, rows)
}

// StudentAppeal godoc
// @Summary      ยื่นอุทธรณ์บันทึกการปฏิบัติงาน (1 ครั้งต่อบันทึก ภายในกำหนด)
// @Description  ส่งให้อาจารย์ผู้ยืนยันบันทึกพิจารณา — แนบไฟล์ .jpg .png .pdf ได้
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      int     true   "Report ID"
// @Param        message  formData  string  true   "เหตุผลที่อุทธรณ์"
// @Param        files    formData  file    false  "หลักฐาน"
// @Success      201  {object}  models.StudentRecord
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /student/reports/about-me/{id}/appeal [post]
func (h *Handler) StudentAppeal(c *gin.Context) {
	actor := actorFrom(c)
	id, ok := idParam(c, "id")
	if !ok {
		return
	}
	r, found := database.ReportByID(id)
	// 404 for anything that is not a record the student was told about.
	if !found || r.StudentID != actor.ID || r.AppealDeadline == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return
	}
	if r.Status != models.ReportConfirmed {
		c.JSON(http.StatusConflict, gin.H{"error": "บันทึกนี้ไม่มีผลแล้ว จึงไม่ต้องอุทธรณ์"})
		return
	}
	message, err := cleanText(c.PostForm("message"), maxTextLen, "เหตุผลที่อุทธรณ์", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var files []models.LabBoyReportEvidence
	if form, err := c.MultipartForm(); err == nil && len(form.File["files"]) > 0 {
		if files, err = readFiles(form.File["files"]); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if !checkFileQuota(c, r.ID, len(files)) {
			return
		}
	}
	var notifs []models.Notification
	if by, _, ok := database.ReportConfirmation(r.ID); ok {
		course := strings.TrimSpace(r.CourseCode + " " + r.CourseTitle)
		courseID := r.CourseID
		notifs = append(notifs, models.Notification{
			UserID: by, CourseID: &courseID, Title: "มีคำอุทธรณ์บันทึกการปฏิบัติงาน รอการพิจารณา",
			Body: fmt.Sprintf("%s อุทธรณ์บันทึกที่ท่านยืนยันในรายวิชา %s กรุณาพิจารณาที่เมนู \"บันทึกการปฏิบัติงาน\" > \"คำอุทธรณ์\"", r.StudentName, course),
		})
	}
	_, err = database.AddReportResponse(database.NewReportResponse{
		Response: models.LabBoyReportResponse{
			ReportID: r.ID, AuthorID: actor.ID, Kind: models.ResponseReconsideration, Message: message,
		},
		Files:                  files,
		ExpectStatus:           models.ReportConfirmed,
		RequestReconsideration: true,
		Notifications:          notifs,
	})
	if err != nil {
		writeDBError(c, err, "student appeal")
		return
	}
	rows, _ := database.StudentRecords(actor.ID)
	for _, rec := range rows {
		if rec.ReportID == r.ID {
			c.JSON(http.StatusCreated, rec)
			return
		}
	}
	c.JSON(http.StatusCreated, gin.H{"report_id": r.ID})
}

// PeerReportEligibility is whether students of a course may report each other.
type PeerReportEligibility struct {
	Allowed       bool  `json:"allowed"`
	AcceptedCount int64 `json:"accepted_count"`
	MinRequired   int   `json:"min_required"`
}

// StudentReportEligibility godoc
// @Summary      รายวิชานี้เปิดให้นักศึกษารายงานกันเองหรือไม่ (ต้องมี Lab Boy ที่ได้รับเลือกตั้งแต่ 6 คน)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Course ID"
// @Success      200  {object}  PeerReportEligibility
// @Router       /student/courses/{id}/report-eligibility [get]
func (h *Handler) StudentReportEligibility(c *gin.Context) {
	id, ok := idParam(c, "id")
	if !ok {
		return
	}
	n, err := database.AcceptedLabBoyCount(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, PeerReportEligibility{
		Allowed: n >= database.MinPeerReportLabBoys, AcceptedCount: n, MinRequired: database.MinPeerReportLabBoys,
	})
}
