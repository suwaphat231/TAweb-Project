// Package reports holds the Lab Boy report / blacklist endpoints. A Lab Boy
// may report a fellow Lab Boy of the same course, which goes to the course's
// instructor to blacklist or dismiss; the instructor may also blacklist a
// Lab Boy directly. No staff step. The reported student is told, can
// explain and ask for reconsideration, and never learns which fellow
// student reported them. Only blacklisted (CONFIRMED) reports are shown to
// other instructors, as "เคยโดนรีพอร์ท", until the end date the
// instructor set. It never blocks a student from applying. A blacklisted
// student may appeal within 15 days (appeal_handler.go).
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

// forReport fills in whether actor teaches the report's course.
func forReport(actor Actor, r models.LabBoyReport) Actor {
	actor.ManagesCourse = false
	if actor.isAdmin() {
		actor.ManagesCourse = true
	} else if actor.Role == string(models.RoleInstructor) {
		if course, ok := database.CourseByID(r.CourseID); ok {
			actor.ManagesCourse = database.InstructorOwnsCourse(course, actor.ID, "", false)
		}
	}
	return actor
}

// loadVisible fetches a report and answers 404 both when it does not exist
// and when the caller may not see it, so IDs cannot be probed. The returned
// actor has ManagesCourse filled in for this report.
func loadVisible(c *gin.Context, actor Actor) (models.LabBoyReport, Actor, bool) {
	id, ok := idParam(c, "id")
	if !ok {
		return models.LabBoyReport{}, actor, false
	}
	r, found := database.ReportByID(id)
	if found {
		actor = forReport(actor, r)
	}
	if !found || !CanView(r, actor) {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return models.LabBoyReport{}, actor, false
	}
	return r, actor, true
}

// hiddenReporter is shown instead of a fellow student's name.
const hiddenReporter = "ผู้รายงาน (ไม่เปิดเผยชื่อ)"

// maskReporter removes who filed r when actor may not know it.
func maskReporter(r models.LabBoyReport, actor Actor) models.LabBoyReport {
	if HidesReporter(r, actor) {
		r.ReporterID = 0
		r.ReporterName = hiddenReporter
	}
	return r
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

// resolveApplication ties the report to a real Lab Boy job and copies
// student and course from it — the client never gets to choose them. An
// instructor may report Lab Boys of a course they teach; a student only a
// fellow Lab Boy of the same course (same code and term), never themselves.
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
	if actor.isStudent() {
		if app.StudentID == actor.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถรายงานตนเองได้"})
			return false
		}
		if !database.IsLabBoyOfCourse(actor.ID, course) {
			c.JSON(http.StatusForbidden, gin.H{"error": "รายงานได้เฉพาะ Lab Boy ในรายวิชาเดียวกับที่คุณเป็น Lab Boy"})
			return false
		}
	} else if !database.InstructorOwnsCourse(course, actor.ID, "", actor.isAdmin()) {
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

func writeDBError(c *gin.Context, err error, what string) {
	switch {
	case errors.Is(err, database.ErrDuplicateReport):
		c.JSON(http.StatusConflict, gin.H{"error": "มีรายงานเหตุการณ์ประเภทนี้ของนักศึกษาคนนี้ในวันเดียวกันอยู่แล้ว"})
	case errors.Is(err, database.ErrStaleReport):
		c.JSON(http.StatusConflict, gin.H{"error": "สถานะรายงานเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
	default:
		log.Printf("%s: %v", what, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

// CreateReport godoc
// @Summary      สร้างร่างรายงาน Lab Boy (อาจารย์ / Lab Boy วิชาเดียวกัน)
// @Description  อาจารย์: Lab Boy ในรายวิชาที่ตนสอน แล้ว Blacklist ได้ทันที — นักศึกษา: Lab Boy คนอื่นในรายวิชาเดียวกัน แล้วส่งให้อาจารย์ประจำวิชาพิจารณา — บันทึกเป็น DRAFT ก่อน
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
// @Router       /student/reports [post]
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
	r.ReporterRole = actor.Role
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
// @Router       /student/reports/{id} [put]
func (h *Handler) UpdateDraft(c *gin.Context) {
	actor := actorFrom(c)
	existing, _, ok := loadVisible(c, actor)
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
	f.FiledByStudents = c.Query("from") == "students"
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
	actor := actorFrom(c)
	for i := range rows {
		rows[i] = maskReporter(rows[i], actor)
	}
	c.JSON(http.StatusOK, ReportPage{Data: rows, Total: total, Page: f.Page, Limit: f.Limit})
}

// ListMine godoc
// @Summary      รายงานที่ฉันเป็นผู้รายงาน และรายงานจาก Lab Boy ในรายวิชาที่ฉันสอน (อาจารย์/แอดมิน)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        q          query  string  false  "ค้นหาชื่อ/รหัสนักศึกษา"
// @Param        status     query  string  false  "สถานะ (คั่นด้วย , ได้)"
// @Param        category   query  string  false  "ประเภทเหตุการณ์"
// @Param        course_id  query  int     false  "รายวิชา"
// @Param        from       query  string  false  "students = เฉพาะรายงานที่ Lab Boy ส่งมา"
// @Param        date_from  query  string  false  "วันที่เกิดเหตุตั้งแต่ (YYYY-MM-DD)"
// @Param        date_to    query  string  false  "วันที่เกิดเหตุถึง (YYYY-MM-DD)"
// @Param        page       query  int     false  "หน้า"
// @Param        limit      query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /instructor/reports [get]
func (h *Handler) ListMine(c *gin.Context) {
	actor := actorFrom(c)
	var courseIDs []uint
	if !actor.isAdmin() {
		ids, err := database.ManagedCourseIDs(actor.ID)
		if err != nil {
			log.Printf("managed courses: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		courseIDs = ids
	}
	h.list(c, func(f *database.ReportFilter) {
		f.VisibleTo = &database.ReportViewer{UserID: actor.ID, AllCourses: actor.isAdmin(), CourseIDs: courseIDs}
	})
}

// MyReports godoc
// @Summary      รายงานที่เกี่ยวกับฉัน (นักศึกษา) — ไม่เปิดเผยชื่อเพื่อนที่รายงาน
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        page   query  int  false  "หน้า"
// @Param        limit  query  int  false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /student/reports [get]
func (h *Handler) MyReports(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.StudentID = &actor.ID; f.ExcludeDraft = true })
}

// FiledReports godoc
// @Summary      รายงานที่ฉันส่งเกี่ยวกับ Lab Boy คนอื่น (นักศึกษา)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        page   query  int  false  "หน้า"
// @Param        limit  query  int  false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  ReportPage
// @Router       /student/reports/filed [get]
func (h *Handler) FiledReports(c *gin.Context) {
	actor := actorFrom(c)
	h.list(c, func(f *database.ReportFilter) { f.ReporterID = &actor.ID })
}

// Peers godoc
// @Summary      Lab Boy คนอื่นในรายวิชาเดียวกับที่ฉันเป็น Lab Boy (ที่รายงานได้)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  database.ReportPeer
// @Router       /student/reports/peers [get]
func (h *Handler) Peers(c *gin.Context) {
	actor := actorFrom(c)
	peers, err := database.LabBoyPeers(actor.ID)
	if err != nil {
		log.Printf("report peers: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, peers)
}

// ReportCourses godoc
// @Summary      รายวิชาที่ฉันเป็น Lab Boy พร้อมรายชื่อ Lab Boy คนอื่นในแต่ละวิชา (ที่รายงานได้)
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  database.ReportCourse
// @Router       /student/reports/courses [get]
func (h *Handler) ReportCourses(c *gin.Context) {
	actor := actorFrom(c)
	courses, err := database.LabBoyReportCourses(actor.ID)
	if err != nil {
		log.Printf("report courses: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, courses)
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
	// CanRespond tells the UI whether to show the response box; the server
	// re-checks on submit.
	CanRespond bool `json:"can_respond"`
	// Appeals are only filled in for the reported student, the course's
	// instructor and admin. AppealBlockedReason says why CanAppeal is false
	// for the reported student (deadline passed, already appealed, ...).
	Appeals             []AppealView `json:"appeals"`
	AppealDeadline      *time.Time   `json:"appeal_deadline,omitempty"`
	CanAppeal           bool         `json:"can_appeal"`
	AppealBlockedReason string       `json:"appeal_blocked_reason,omitempty"`
}

// Detail godoc
// @Summary      รายละเอียดรายงาน พร้อมหลักฐาน คำชี้แจง ผลการตรวจสอบ และไทม์ไลน์
// @Description  ผู้รายงาน, อาจารย์ประจำวิชาและนักศึกษาที่ถูกรายงาน (เมื่อส่งแล้ว) และแอดมินเท่านั้น — ผู้อื่นได้ 404
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Report ID"
// @Success      200  {object}  ReportDetail
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /reports/{id} [get]
func (h *Handler) Detail(c *gin.Context) {
	r, actor, ok := loadVisible(c, actorFrom(c))
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
	if HidesReporter(r, actor) {
		evidence, responses, history = maskReporterTrail(r.ReporterID, evidence, responses, history)
	}
	if HidesStudentSide(r, actor) {
		evidence, responses = ownSideOnly(actor.ID, evidence, responses)
	}
	_, respondDenied := ResponseKindFor(r, actor)
	detail := ReportDetail{
		Report:         maskReporter(r, actor),
		Evidence:       evidence,
		Responses:      responses,
		Reviews:        reviews,
		History:        history,
		AllowedActions: AllowedActions(r, actor),
		CanEdit:        CanEditDraft(r, actor),
		CanAddEvidence: CanAddEvidence(r, actor),
		CanRespond:     respondDenied == nil,
		Appeals:        []AppealView{},
	}
	if CanViewAppeal(r, actor) && r.PenaltyStatus != "" {
		appeals, err := database.AppealsForReport(r.ID)
		if err == nil {
			detail.Appeals, err = appealViews(appeals, actor)
		}
		if err != nil {
			log.Printf("report appeals %d: %v", r.ID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		deadline := AppealDeadline(r)
		detail.AppealDeadline = &deadline
		if r.StudentID == actor.ID {
			if d := CanAppeal(r, actor, appeals, time.Now(), database.BangkokToday()); d != nil {
				detail.AppealBlockedReason = d.Message
			} else {
				detail.CanAppeal = true
			}
		}
	}
	c.JSON(http.StatusOK, detail)
}

// maskReporterTrail replaces the reporting student's name everywhere it
// shows up in a report's trail.
func maskReporterTrail(reporterID uint, ev []models.LabBoyReportEvidence, resp []models.LabBoyReportResponse,
	hist []models.LabBoyReportStatusHistory) ([]models.LabBoyReportEvidence, []models.LabBoyReportResponse, []models.LabBoyReportStatusHistory) {
	for i := range ev {
		if ev[i].UploadedByID == reporterID {
			ev[i].UploadedByID, ev[i].UploadedByName = 0, hiddenReporter
		}
	}
	for i := range resp {
		if resp[i].AuthorID == reporterID {
			resp[i].AuthorID, resp[i].AuthorName = 0, hiddenReporter
		}
	}
	for i := range hist {
		if hist[i].ActorID == reporterID {
			hist[i].ActorID, hist[i].ActorName = 0, hiddenReporter
		}
	}
	return ev, resp, hist
}

// ownSideOnly keeps only what the viewer wrote or attached themselves —
// a student reporter does not read the reported student's explanations.
func ownSideOnly(viewerID uint, ev []models.LabBoyReportEvidence, resp []models.LabBoyReportResponse) ([]models.LabBoyReportEvidence, []models.LabBoyReportResponse) {
	keptResp := resp[:0]
	for _, x := range resp {
		if x.AuthorID == viewerID {
			keptResp = append(keptResp, x)
		}
	}
	keptEv := ev[:0]
	for _, x := range ev {
		if x.UploadedByID == viewerID {
			keptEv = append(keptEv, x)
		}
	}
	return keptEv, keptResp
}

// ActionRequest is the body for a workflow step.
type ActionRequest struct {
	Action string `json:"action" binding:"required" example:"confirm"`
	Reason string `json:"reason" example:"ตรวจสอบบันทึกการเข้างานแล้วตรงกับที่รายงาน"`
	// BlacklistUntil (YYYY-MM-DD) is the last day the blacklisting shows,
	// for blacklist/confirm only; default 180 days, at most 2 years.
	BlacklistUntil string `json:"blacklist_until" example:"2027-03-31"`
}

// blacklistUntil validates the requested end date of a blacklisting.
func blacklistUntil(s string) (time.Time, error) {
	today := database.BangkokToday()
	if s = strings.TrimSpace(s); s == "" {
		return today.AddDate(0, 0, DefaultBlacklistDays), nil
	}
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		return d, errors.New("วันสิ้นสุด Blacklist ไม่ถูกต้อง (YYYY-MM-DD)")
	}
	if !d.After(today) || d.After(today.AddDate(0, 0, MaxBlacklistDays)) {
		return d, fmt.Errorf("วันสิ้นสุด Blacklist ต้องอยู่หลังวันนี้ และไม่เกิน %d วัน", MaxBlacklistDays)
	}
	return d, nil
}

var actionAudit = map[Action]string{
	ActionSubmit: "submit", ActionWithdraw: "withdraw", ActionBlacklist: "blacklist",
	ActionRequestInfo: "request_info", ActionConfirm: "confirm", ActionNotSubstantiated: "not_substantiated",
	ActionReopen: "reopen",
}

// Act godoc
// @Summary      ดำเนินการตาม workflow ของรายงาน
// @Description  action: submit (Lab Boy ผู้รายงาน), blacklist (อาจารย์ผู้รายงาน — Blacklist ทันที), withdraw (ผู้รายงาน) / request_info, confirm (= Blacklist), not_substantiated (= ยกรายงาน), reopen (อาจารย์ประจำวิชา/แอดมิน) — ต้องระบุ reason ยกเว้น submit และ blacklist; blacklist/confirm รับ blacklist_until (ค่าเริ่มต้น 180 วัน)
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
	r, actor, ok := loadVisible(c, actorFrom(c))
	if !ok {
		return
	}
	action := Action(body.Action)
	if action == ActionBlacklist && reason == "" {
		reason = "อาจารย์ประจำวิชา Blacklist จากรายงานนี้"
	}
	to, denial := CheckAction(r, actor, action, reason)
	if denial != nil {
		c.JSON(denialStatus(denial), gin.H{"error": denial.Message})
		return
	}
	if action == ActionReopen {
		// The student's appeal decides a blacklisting under appeal; a reopen
		// would silently make the appeal moot.
		if open, err := database.HasOpenAppeal(r.ID); err != nil || open {
			if err != nil {
				log.Printf("open appeal check: %v", err)
			}
			c.JSON(http.StatusConflict, gin.H{"error": "มีคำอุทธรณ์ที่รอพิจารณาอยู่ กรุณาพิจารณาอุทธรณ์แทน"})
			return
		}
	}
	var until *time.Time
	if to == models.ReportConfirmed {
		d, err := blacklistUntil(body.BlacklistUntil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		until = &d
	}
	t := database.ReportTransition{
		ReportID:       r.ID,
		From:           r.Status,
		To:             to,
		ActorID:        actor.ID,
		Reason:         reason,
		Action:         actionAudit[action],
		Review:         rules[action].review,
		BlacklistUntil: until,
		Notifications:  notificationsFor(r, action, reason, until),
	}
	if err := database.ApplyReportTransition(t); err != nil {
		writeDBError(c, err, "report transition")
		return
	}
	saved, _ := database.ReportByID(r.ID)
	c.JSON(http.StatusOK, saved)
}

// notificationsFor tells the student, the reporter and — for a fellow Lab
// Boy's report — the course's instructors about steps that concern them,
// through the existing notifications inbox. The reported student is never
// told which fellow student filed the report.
func notificationsFor(r models.LabBoyReport, action Action, reason string, until *time.Time) []models.Notification {
	course := r.CourseCode
	if r.CourseTitle != "" {
		course += " " + r.CourseTitle
	}
	courseID := r.CourseID
	note := func(userID uint, title, body string) models.Notification {
		return models.Notification{UserID: userID, CourseID: &courseID, Title: title, Body: body}
	}
	toStudent := func(title, body string) models.Notification { return note(r.StudentID, title, body) }
	toReporter := func(title, body string) models.Notification { return note(r.ReporterID, title, body) }
	withReason := func(s string) string {
		if reason == "" {
			return s
		}
		return s + "\nเหตุผล: " + reason
	}
	// Told whenever a student is blacklisted: how long, and how to appeal.
	untilNote := ""
	if until != nil {
		untilNote = fmt.Sprintf(" จนถึงวันที่ %s ยื่นอุทธรณ์ได้ภายใน 15 วันที่หน้า \"รายงาน / Blacklist\"", until.Format("02/01/2006"))
	}
	byWhom := "อาจารย์ประจำวิชา"
	if r.FiledByStudent() {
		byWhom = "Lab Boy ในรายวิชาเดียวกัน"
	}
	switch action {
	case ActionSubmit:
		out := []models.Notification{toStudent("มีรายงานเกี่ยวกับการปฏิบัติงานของคุณ",
			fmt.Sprintf("มีรายงานจาก%sเกี่ยวกับการปฏิบัติงานของคุณในรายวิชา %s อาจารย์ประจำวิชากำลังพิจารณา รายงานนี้ยังไม่ใช่ข้อสรุป คุณสามารถส่งคำชี้แจงได้ที่หน้า \"รายงาน / Blacklist\"", byWhom, course))}
		if c, ok := database.CourseByID(r.CourseID); ok {
			if instructors, err := database.InstructorsForCourse(c); err == nil {
				for _, u := range instructors {
					out = append(out, note(u.ID, "มีรายงาน Lab Boy รอพิจารณา",
						fmt.Sprintf("Lab Boy รายงานพฤติกรรมของ %s ในรายวิชา %s กรุณาพิจารณาว่าจะ Blacklist หรือยกรายงาน", r.StudentName, course)))
				}
			}
		}
		return out
	case ActionBlacklist:
		return []models.Notification{toStudent("คุณถูก Blacklist",
			withReason(fmt.Sprintf("อาจารย์ประจำวิชาบันทึก Blacklist การปฏิบัติงานของคุณในรายวิชา %s อาจารย์รายวิชาอื่นที่คุณสมัครจะเห็นว่าคุณเคยโดนรีพอร์ท%s", course, untilNote)))}
	case ActionRequestInfo:
		return []models.Notification{
			toStudent("อาจารย์ขอข้อมูลเพิ่มเติม", withReason("อาจารย์ประจำวิชาขอคำชี้แจงเกี่ยวกับรายงานในรายวิชา "+course)),
			toReporter("อาจารย์ขอข้อมูลเพิ่มเติม", withReason(fmt.Sprintf("อาจารย์ประจำวิชาขอข้อมูลเพิ่มเติมเกี่ยวกับรายงานของ %s ในรายวิชา %s", r.StudentName, course))),
		}
	case ActionConfirm, ActionNotSubstantiated:
		result, studentTitle := "Blacklist", "คุณถูก Blacklist"
		studentBody := fmt.Sprintf("อาจารย์ประจำวิชาพิจารณารายงานในรายวิชา %s แล้ว และบันทึก Blacklist อาจารย์รายวิชาอื่นที่คุณสมัครจะเห็นว่าคุณเคยโดนรีพอร์ท%s", course, untilNote)
		if action == ActionNotSubstantiated {
			result, studentTitle = "ยกรายงาน (ไม่ Blacklist)", "รายงานเกี่ยวกับคุณถูกยกไป"
			studentBody = fmt.Sprintf("อาจารย์ประจำวิชาพิจารณารายงานในรายวิชา %s แล้ว และยกรายงาน ไม่มีการบันทึกใด ๆ ในประวัติของคุณ", course)
		}
		return []models.Notification{
			toStudent(studentTitle, withReason(studentBody)),
			toReporter("ผลการพิจารณารายงาน", withReason(fmt.Sprintf("ผลการพิจารณารายงานของ %s ในรายวิชา %s: %s", r.StudentName, course, result))),
		}
	case ActionReopen:
		return []models.Notification{
			toStudent("รายงานถูกนำกลับมาพิจารณาอีกครั้ง", withReason("รายงานในรายวิชา "+course+" ถูกนำกลับมาพิจารณาอีกครั้ง")),
			toReporter("รายงานถูกนำกลับมาพิจารณาอีกครั้ง", withReason(fmt.Sprintf("รายงานของ %s ในรายวิชา %s ถูกนำกลับมาพิจารณาอีกครั้ง", r.StudentName, course))),
		}
	case ActionWithdraw:
		// A draft was never shown to the student, so there is nothing to retract.
		if r.Status == models.ReportDraft {
			return nil
		}
		return []models.Notification{toStudent("รายงานถูกถอนแล้ว", withReason("ผู้รายงานถอนรายงานในรายวิชา "+course+" แล้ว"))}
	}
	return nil
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
// @Description  เฉพาะผู้รายงาน ขณะรายงานยังไม่มีผลการพิจารณา — นักศึกษาแนบไฟล์ผ่านการส่งคำชี้แจงแทน
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
// @Router       /student/reports/{id}/evidence [post]
func (h *Handler) UploadEvidence(c *gin.Context) {
	r, actor, ok := loadVisible(c, actorFrom(c))
	if !ok {
		return
	}
	if !CanAddEvidence(r, actor) {
		c.JSON(http.StatusForbidden, gin.H{"error": "แนบหลักฐานได้เฉพาะผู้รายงาน ขณะรายงานยังไม่มีผลการพิจารณา"})
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
	r, actor, ok := loadVisible(c, actorFrom(c))
	if !ok {
		return
	}
	eid, ok := idParam(c, "evidenceId")
	if !ok {
		return
	}
	e, found := database.ReportEvidenceFile(r.ID, eid)
	// A student reporter only opens their own files, matching what Detail lists.
	if found && HidesStudentSide(r, actor) && e.UploadedByID != actor.ID {
		found = false
	}
	if !found {
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

// Respond godoc
// @Summary      ส่งคำชี้แจง (นักศึกษา) หรือเพิ่มข้อมูล (ผู้รายงาน) ขณะรายงานรอพิจารณา
// @Description  ส่งแบบ multipart: message (จำเป็น), files (ไม่บังคับ) — คำชี้แจงเดิมไม่ถูกแก้ไข ทุกครั้งเป็นรายการใหม่ ถ้ารายงานรอข้อมูลเพิ่มเติมอยู่ จะกลับไปอยู่ระหว่างพิจารณาอัตโนมัติ — เมื่อถูก Blacklist แล้วให้ยื่นอุทธรณ์แทน
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id               path      int     true   "Report ID"
// @Param        message          formData  string  true   "ข้อความ"
// @Param        files            formData  file    false  "ไฟล์ประกอบ"
// @Success      201  {object}  models.LabBoyReportResponse
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /reports/{id}/responses [post]
func (h *Handler) Respond(c *gin.Context) {
	r, actor, ok := loadVisible(c, actorFrom(c))
	if !ok {
		return
	}
	kind, denial := ResponseKindFor(r, actor)
	if denial != nil {
		c.JSON(denialStatus(denial), gin.H{"error": denial.Message})
		return
	}
	msg, err := cleanText(c.PostForm("message"), maxTextLen, "ข้อความ", true)
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
	resp, err := database.AddReportResponse(database.NewReportResponse{
		Response:     models.LabBoyReportResponse{ReportID: r.ID, AuthorID: actor.ID, Kind: kind, Message: msg},
		Files:        files,
		ExpectStatus: r.Status,
		ResumeReview: true,
	})
	if err != nil {
		writeDBError(c, err, "add report response")
		return
	}
	c.JSON(http.StatusCreated, resp)
}

// ConfirmedHistory godoc
// @Summary      ประวัติ "เคยโดนรีพอร์ท" (Blacklist) ของผู้สมัคร
// @Description  แสดงเฉพาะรายงานที่ถูก Blacklist (CONFIRMED, ไม่รวมหลักฐานและชื่อผู้รายงาน) สำหรับอาจารย์ผู้สอนของรายวิชาที่นักศึกษาสมัคร หรือแอดมิน — ทุกการเปิดดูถูกบันทึก
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
	if !actor.isAdmin() {
		course, ok := database.CourseByID(app.CourseID)
		if !ok || !database.InstructorOwnsCourse(course, actor.ID, "", false) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}
	rows, err := database.ConfirmedRecordsForStudent(app.StudentID)
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
