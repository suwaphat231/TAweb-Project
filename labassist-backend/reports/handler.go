// Package reports holds the Lab Boy performance-record endpoints. A report
// is filed by the course's instructor, reviewed by staff/admin (never by the
// reporter), answered by the student, and only once CONFIRMED is it shown
// to other instructors as work-performance history. It never blocks a
// student from applying.
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
func loadVisible(c *gin.Context, actor Actor) (models.LabBoyReport, bool) {
	id, ok := idParam(c, "id")
	if !ok {
		return models.LabBoyReport{}, false
	}
	r, found := database.ReportByID(id)
	if !found || !CanView(r, actor) {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return models.LabBoyReport{}, false
	}
	return r, true
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
	existing, ok := loadVisible(c, actor)
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
// @Summary      รายงานทั้งหมดสำหรับผู้ตรวจสอบ (เจ้าหน้าที่/แอดมิน) — ไม่รวมฉบับร่าง
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
// @Router       /staff/reports [get]
func (h *Handler) ReviewQueue(c *gin.Context) {
	h.list(c, func(f *database.ReportFilter) { f.ExcludeDraft = true })
}

// MyReports godoc
// @Summary      รายงานที่เกี่ยวข้องกับฉัน (นักศึกษา)
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
	// CanRespond / CanRequestReconsideration tell the UI which response box
	// to show; the server re-checks on submit.
	CanRespond                bool `json:"can_respond"`
	CanRequestReconsideration bool `json:"can_request_reconsideration"`
}

// Detail godoc
// @Summary      รายละเอียดรายงาน พร้อมหลักฐาน คำชี้แจง ผลการตรวจสอบ และไทม์ไลน์
// @Description  ผู้รายงาน, นักศึกษาเจ้าของรายงาน (เมื่อส่งแล้ว), เจ้าหน้าที่ (เมื่อส่งแล้ว) และแอดมินเท่านั้น — ผู้อื่นได้ 404
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      int  true  "Report ID"
// @Success      200  {object}  ReportDetail
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /reports/{id} [get]
func (h *Handler) Detail(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, actor)
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
	_, respondDenied := ResponseKindFor(r, actor, false)
	_, reconsDenied := ResponseKindFor(r, actor, true)
	c.JSON(http.StatusOK, ReportDetail{
		Report:                    r,
		Evidence:                  evidence,
		Responses:                 responses,
		Reviews:                   reviews,
		History:                   history,
		AllowedActions:            AllowedActions(r, actor),
		CanEdit:                   CanEditDraft(r, actor),
		CanAddEvidence:            CanAddEvidence(r, actor),
		CanRespond:                respondDenied == nil,
		CanRequestReconsideration: reconsDenied == nil,
	})
}

// ActionRequest is the body for a workflow step.
type ActionRequest struct {
	Action string `json:"action" binding:"required" example:"confirm"`
	Reason string `json:"reason" example:"ตรวจสอบบันทึกการเข้างานแล้วตรงกับที่รายงาน"`
}

var actionAudit = map[Action]string{
	ActionSubmit: "submit", ActionWithdraw: "withdraw", ActionStartReview: "start_review",
	ActionRequestInfo: "request_info", ActionConfirm: "confirm", ActionNotSubstantiated: "not_substantiated",
	ActionReopen: "reopen", ActionDeclineReconsideration: "decline_reconsideration",
}

// Act godoc
// @Summary      ดำเนินการตาม workflow ของรายงาน
// @Description  action: submit, withdraw (ผู้รายงาน) / start_review, request_info, confirm, not_substantiated, reopen, decline_reconsideration (เจ้าหน้าที่/แอดมินที่ไม่ใช่ผู้รายงาน) — ต้องระบุ reason ยกเว้น submit และ start_review
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
	r, ok := loadVisible(c, actor)
	if !ok {
		return
	}
	action := Action(body.Action)
	to, denial := CheckAction(r, actor, action, reason)
	if denial != nil {
		c.JSON(denialStatus(denial), gin.H{"error": denial.Message})
		return
	}
	rule := rules[action]
	t := database.ReportTransition{
		ReportID:             r.ID,
		From:                 r.Status,
		To:                   to,
		ActorID:              actor.ID,
		Reason:               reason,
		Action:               actionAudit[action],
		Review:               rule.review,
		ClearReconsideration: rule.clearRecons,
		Notifications:        notificationsFor(r, action, reason),
	}
	if err := database.ApplyReportTransition(t); err != nil {
		writeDBError(c, err, "report transition")
		return
	}
	saved, _ := database.ReportByID(r.ID)
	c.JSON(http.StatusOK, saved)
}

// notificationsFor tells the student and the reporter about steps that
// concern them, through the existing notifications inbox.
func notificationsFor(r models.LabBoyReport, action Action, reason string) []models.Notification {
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
	switch action {
	case ActionSubmit:
		return []models.Notification{toStudent("มีรายงานการปฏิบัติงานที่เกี่ยวข้องกับคุณ",
			fmt.Sprintf("อาจารย์ส่งรายงานการปฏิบัติงานในรายวิชา %s รายงานนี้ยังไม่ใช่ข้อสรุป และอยู่ระหว่างรอการตรวจสอบ คุณสามารถส่งคำชี้แจงได้ที่หน้า \"รายงานการปฏิบัติงาน\"", course))}
	case ActionRequestInfo:
		return []models.Notification{
			toStudent("ผู้ตรวจสอบขอข้อมูลเพิ่มเติม", withReason("ผู้ตรวจสอบขอคำชี้แจงหรือข้อมูลเพิ่มเติมเกี่ยวกับรายงานในรายวิชา "+course)),
			toReporter("ผู้ตรวจสอบขอข้อมูลเพิ่มเติม", withReason(fmt.Sprintf("ผู้ตรวจสอบขอข้อมูลเพิ่มเติมเกี่ยวกับรายงานของ %s ในรายวิชา %s", r.StudentName, course))),
		}
	case ActionConfirm, ActionNotSubstantiated:
		result := "ยืนยันรายงาน"
		if action == ActionNotSubstantiated {
			result = "ข้อมูลไม่เพียงพอที่จะยืนยันรายงาน"
		}
		return []models.Notification{
			toStudent("ผลการตรวจสอบรายงานการปฏิบัติงาน", withReason(fmt.Sprintf("ผลการตรวจสอบรายงานในรายวิชา %s: %s", course, result))),
			toReporter("ผลการตรวจสอบรายงานการปฏิบัติงาน", withReason(fmt.Sprintf("ผลการตรวจสอบรายงานของ %s ในรายวิชา %s: %s", r.StudentName, course, result))),
		}
	case ActionReopen:
		return []models.Notification{
			toStudent("รายงานถูกนำกลับมาตรวจสอบอีกครั้ง", withReason("รายงานในรายวิชา "+course+" ถูกนำกลับมาตรวจสอบอีกครั้ง")),
			toReporter("รายงานถูกนำกลับมาตรวจสอบอีกครั้ง", withReason(fmt.Sprintf("รายงานของ %s ในรายวิชา %s ถูกนำกลับมาตรวจสอบอีกครั้ง", r.StudentName, course))),
		}
	case ActionDeclineReconsideration:
		return []models.Notification{toStudent("ผลคำขอทบทวนรายงาน", withReason("ผู้ตรวจสอบพิจารณาคำขอทบทวนรายงานในรายวิชา "+course+" แล้ว และคงผลการยืนยันเดิม"))}
	case ActionWithdraw:
		// A draft was never shown to the student, so there is nothing to retract.
		if r.Status == models.ReportDraft {
			return nil
		}
		return []models.Notification{toStudent("รายงานถูกถอนแล้ว", withReason("อาจารย์ถอนรายงานการปฏิบัติงานในรายวิชา "+course+" แล้ว"))}
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
func (h *Handler) UploadEvidence(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, actor)
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
	actor := actorFrom(c)
	r, ok := loadVisible(c, actor)
	if !ok {
		return
	}
	eid, ok := idParam(c, "evidenceId")
	if !ok {
		return
	}
	e, found := database.ReportEvidenceFile(r.ID, eid)
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
// @Summary      ส่งคำชี้แจง / ขอทบทวน (นักศึกษา) หรือเพิ่มข้อมูล (ผู้รายงาน)
// @Description  ส่งแบบ multipart: message (จำเป็น), reconsideration=true เพื่อขอทบทวนรายงานที่ยืนยันแล้ว, files (ไม่บังคับ) — คำชี้แจงเดิมไม่ถูกแก้ไข ทุกครั้งเป็นรายการใหม่ ถ้ารายงานรอข้อมูลเพิ่มเติมอยู่ จะกลับไปอยู่ระหว่างตรวจสอบอัตโนมัติ
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id               path      int     true   "Report ID"
// @Param        message          formData  string  true   "ข้อความ"
// @Param        reconsideration  formData  bool    false  "ขอทบทวนรายงานที่ยืนยันแล้ว"
// @Param        files            formData  file    false  "ไฟล์ประกอบ"
// @Success      201  {object}  models.LabBoyReportResponse
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /reports/{id}/responses [post]
func (h *Handler) Respond(c *gin.Context) {
	actor := actorFrom(c)
	r, ok := loadVisible(c, actor)
	if !ok {
		return
	}
	reconsideration := c.PostForm("reconsideration") == "true"
	kind, denial := ResponseKindFor(r, actor, reconsideration)
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
		Response:               models.LabBoyReportResponse{ReportID: r.ID, AuthorID: actor.ID, Kind: kind, Message: msg},
		Files:                  files,
		ExpectStatus:           r.Status,
		ResumeReview:           kind != models.ResponseReconsideration,
		RequestReconsideration: kind == models.ResponseReconsideration,
	})
	if err != nil {
		writeDBError(c, err, "add report response")
		return
	}
	c.JSON(http.StatusCreated, resp)
}

// ConfirmedHistory godoc
// @Summary      ประวัติการปฏิบัติงานที่ยืนยันแล้วของผู้สมัคร
// @Description  แสดงเฉพาะรายงานสถานะ CONFIRMED (ไม่รวมหลักฐาน) สำหรับอาจารย์ผู้สอนของรายวิชาที่นักศึกษาสมัคร หรือเจ้าหน้าที่/แอดมิน — ทุกการเปิดดูถูกบันทึก
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
	if !actor.isReviewer() {
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
