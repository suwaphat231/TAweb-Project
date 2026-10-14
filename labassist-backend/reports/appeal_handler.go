package reports

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AppealView is one appeal with its timeline. Files sent with each step are
// in the report's evidence, linked by appeal_event_id.
type AppealView struct {
	Appeal models.BlacklistAppeal        `json:"appeal"`
	Events []models.BlacklistAppealEvent `json:"events"`
	// CanDecide / CanAddInfo tell the UI which controls to show; every
	// endpoint re-checks.
	CanDecide  bool `json:"can_decide"`
	CanAddInfo bool `json:"can_add_info"`
}

func appealViews(appeals []models.BlacklistAppeal, actor Actor) ([]AppealView, error) {
	out := make([]AppealView, 0, len(appeals))
	for _, a := range appeals {
		events, err := database.AppealEvents(a.ID)
		if err != nil {
			return nil, err
		}
		_, _, decideDenied := CheckAppealDecision(a, actor, AppealReject, "x")
		out = append(out, AppealView{
			Appeal: a, Events: events,
			CanDecide:  decideDenied == nil,
			CanAddInfo: CanAddAppealInfo(a, actor) == nil,
		})
	}
	return out, nil
}

func writeAppealDBError(c *gin.Context, err error, what string) {
	switch {
	case errors.Is(err, database.ErrAppealExists):
		c.JSON(http.StatusConflict, gin.H{"error": "ยื่นอุทธรณ์สำหรับ Blacklist นี้ไปแล้ว"})
	case errors.Is(err, database.ErrStaleAppeal):
		c.JSON(http.StatusConflict, gin.H{"error": "สถานะอุทธรณ์เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "appeal not found"})
	default:
		log.Printf("%s: %v", what, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

// loadAppeal fetches an appeal and its report and answers 404 when either
// is missing or the caller may not see the appeal, so IDs cannot be probed.
func loadAppeal(c *gin.Context, actor Actor) (models.BlacklistAppeal, models.LabBoyReport, Actor, bool) {
	id, ok := idParam(c, "id")
	if !ok {
		return models.BlacklistAppeal{}, models.LabBoyReport{}, actor, false
	}
	a, found := database.AppealByID(id)
	var r models.LabBoyReport
	if found {
		r, found = database.ReportByID(a.ReportID)
	}
	if found {
		actor = forReport(actor, r)
	}
	if !found || !CanViewAppeal(r, actor) {
		c.JSON(http.StatusNotFound, gin.H{"error": "appeal not found"})
		return models.BlacklistAppeal{}, models.LabBoyReport{}, actor, false
	}
	return a, r, actor, true
}

// readOptionalFiles reads the "files" field of a multipart form, if any,
// and checks the report's file quota.
func readOptionalFiles(c *gin.Context, reportID uint) ([]models.LabBoyReportEvidence, bool) {
	form, err := c.MultipartForm()
	if err != nil || len(form.File["files"]) == 0 {
		return nil, true
	}
	files, err := readFiles(form.File["files"])
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}
	return files, checkFileQuota(c, reportID, len(files))
}

// toCourseInstructors notifies everyone who teaches the report's course.
func toCourseInstructors(r models.LabBoyReport, title, body string) []models.Notification {
	course, ok := database.CourseByID(r.CourseID)
	if !ok {
		return nil
	}
	instructors, err := database.InstructorsForCourse(course)
	if err != nil {
		log.Printf("course instructors: %v", err)
		return nil
	}
	courseID := r.CourseID
	out := make([]models.Notification, 0, len(instructors))
	for _, u := range instructors {
		out = append(out, models.Notification{UserID: u.ID, CourseID: &courseID, Title: title, Body: body})
	}
	return out
}

func courseName(r models.LabBoyReport) string {
	return strings.TrimSpace(r.CourseCode + " " + r.CourseTitle)
}

// SubmitAppeal godoc
// @Summary      ยื่นอุทธรณ์ Blacklist (นักศึกษาที่ถูก Blacklist ภายใน 15 วัน)
// @Description  ส่งแบบ multipart: reason (จำเป็น), details, files (.jpg .png .pdf) — ยื่นได้ครั้งเดียวต่อการ Blacklist หนึ่งครั้ง และไม่ได้ขณะมีอุทธรณ์ค้างอยู่ สถานะเป็น appeal_pending
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      int     true   "Report ID"
// @Param        reason   formData  string  true   "เหตุผลการอุทธรณ์"
// @Param        details  formData  string  false  "รายละเอียดเพิ่มเติม"
// @Param        files    formData  file    false  "ไฟล์หลักฐานประกอบ"
// @Success      201  {object}  models.BlacklistAppeal
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /reports/{id}/appeals [post]
func (h *Handler) SubmitAppeal(c *gin.Context) {
	r, actor, ok := loadVisible(c, actorFrom(c))
	if !ok {
		return
	}
	existing, err := database.AppealsForReport(r.ID)
	if err != nil {
		writeAppealDBError(c, err, "load appeals")
		return
	}
	if d := CanAppeal(r, actor, existing, time.Now(), database.BangkokToday()); d != nil {
		c.JSON(denialStatus(d), gin.H{"error": d.Message})
		return
	}
	reason, err := cleanText(c.PostForm("reason"), maxReasonLen, "เหตุผลการอุทธรณ์", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	details, err := cleanText(c.PostForm("details"), maxTextLen, "รายละเอียดเพิ่มเติม", false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	files, ok := readOptionalFiles(c, r.ID)
	if !ok {
		return
	}
	appeal, err := database.CreateAppeal(database.NewAppeal{
		Appeal: models.BlacklistAppeal{
			ReportID: r.ID, StudentID: actor.ID, BlacklistedAt: r.BlacklistedSince(), Reason: reason, Details: details,
		},
		Files: files,
		Notifications: toCourseInstructors(r, "มีคำอุทธรณ์ Blacklist รอพิจารณา",
			fmt.Sprintf("%s ยื่นอุทธรณ์ Blacklist ในรายวิชา %s\nเหตุผล: %s", r.StudentName, courseName(r), reason)),
	})
	if err != nil {
		writeAppealDBError(c, err, "create appeal")
		return
	}
	c.JSON(http.StatusCreated, appeal)
}

// AddAppealInfo godoc
// @Summary      ส่งข้อมูลเพิ่มเติมตามที่อาจารย์ขอ (นักศึกษาผู้ยื่นอุทธรณ์)
// @Description  ส่งแบบ multipart: message (จำเป็น), files — ได้เฉพาะสถานะ appeal_more_info แล้วกลับเป็น appeal_pending
// @Tags         reports
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id       path      int     true   "Appeal ID"
// @Param        message  formData  string  true   "ข้อมูลเพิ่มเติม"
// @Param        files    formData  file    false  "ไฟล์หลักฐานประกอบ"
// @Success      200  {object}  models.BlacklistAppeal
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /appeals/{id}/info [post]
func (h *Handler) AddAppealInfo(c *gin.Context) {
	a, r, actor, ok := loadAppeal(c, actorFrom(c))
	if !ok {
		return
	}
	if d := CanAddAppealInfo(a, actor); d != nil {
		c.JSON(denialStatus(d), gin.H{"error": d.Message})
		return
	}
	msg, err := cleanText(c.PostForm("message"), maxTextLen, "ข้อมูลเพิ่มเติม", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	files, ok := readOptionalFiles(c, r.ID)
	if !ok {
		return
	}
	if err := database.ApplyAppealStep(database.AppealStep{
		AppealID: a.ID, From: a.Status, To: models.PenaltyAppealPending, Kind: models.AppealEventStudentInfo,
		ActorID: actor.ID, Note: msg, Files: files,
		Notifications: toCourseInstructors(r, "นักศึกษาส่งข้อมูลอุทธรณ์เพิ่มเติมแล้ว",
			fmt.Sprintf("%s ส่งข้อมูลเพิ่มเติมสำหรับอุทธรณ์ Blacklist ในรายวิชา %s", r.StudentName, courseName(r))),
	}); err != nil {
		writeAppealDBError(c, err, "add appeal info")
		return
	}
	saved, _ := database.AppealByID(a.ID)
	c.JSON(http.StatusOK, saved)
}

// AppealDecisionRequest is the body for deciding an appeal.
type AppealDecisionRequest struct {
	Decision string `json:"decision" binding:"required" example:"approve"`
	Note     string `json:"note" example:"ตรวจสอบใบรับรองแพทย์แล้ว วันที่ตรงกับวันที่ขาดงาน"`
}

var appealResultText = map[AppealDecision]struct{ title, body string }{
	AppealApprove:     {"อุทธรณ์ได้รับการอนุมัติ", "อาจารย์ประจำวิชาอนุมัติอุทธรณ์ของคุณในรายวิชา %s และยกเลิก Blacklist แล้ว อาจารย์รายวิชาอื่นจะไม่เห็นว่าคุณเคยโดนรีพอร์ทจากรายงานนี้"},
	AppealReject:      {"อุทธรณ์ไม่ได้รับการอนุมัติ", "อาจารย์ประจำวิชาไม่อนุมัติอุทธรณ์ของคุณในรายวิชา %s Blacklist ยังมีผลตามเดิม"},
	AppealRequestInfo: {"อาจารย์ขอข้อมูลอุทธรณ์เพิ่มเติม", "อาจารย์ประจำวิชาขอข้อมูลเพิ่มเติมสำหรับอุทธรณ์ของคุณในรายวิชา %s กรุณาส่งที่หน้า \"รายงาน / Blacklist\""},
}

// DecideAppeal godoc
// @Summary      พิจารณาอุทธรณ์ (อาจารย์ประจำวิชา/แอดมิน)
// @Description  decision: approve (อนุมัติและยกเลิก Blacklist), reject (ไม่อนุมัติ), request_info (ขอข้อมูลเพิ่มเติม) — ต้องระบุ note ทุกครั้ง บันทึกผู้ดำเนินการ วันเวลา และ audit log แล้วแจ้งนักศึกษา
// @Tags         reports
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int                    true  "Appeal ID"
// @Param        body  body      AppealDecisionRequest  true  "ผลการพิจารณา"
// @Success      200   {object}  models.BlacklistAppeal
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /appeals/{id}/decision [post]
func (h *Handler) DecideAppeal(c *gin.Context) {
	var body AppealDecisionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุผลการพิจารณา"})
		return
	}
	note, err := cleanText(body.Note, maxReasonLen, "หมายเหตุ", false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	a, r, actor, ok := loadAppeal(c, actorFrom(c))
	if !ok {
		return
	}
	d := AppealDecision(body.Decision)
	to, kind, denial := CheckAppealDecision(a, actor, d, note)
	if denial != nil {
		c.JSON(denialStatus(denial), gin.H{"error": denial.Message})
		return
	}
	text := appealResultText[d]
	courseID := r.CourseID
	if err := database.ApplyAppealStep(database.AppealStep{
		AppealID: a.ID, From: a.Status, To: to, Kind: kind, ActorID: actor.ID, Note: note,
		LiftBlacklist: d == AppealApprove,
		Notifications: []models.Notification{{
			UserID: a.StudentID, CourseID: &courseID, Title: text.title,
			Body: fmt.Sprintf(text.body, courseName(r)) + "\nหมายเหตุ: " + note,
		}},
	}); err != nil {
		writeAppealDBError(c, err, "decide appeal")
		return
	}
	saved, _ := database.AppealByID(a.ID)
	c.JSON(http.StatusOK, saved)
}

// AppealPage is one page of appeals.
type AppealPage struct {
	Data  []models.BlacklistAppeal `json:"data"`
	Total int64                    `json:"total"`
	Page  int                      `json:"page"`
	Limit int                      `json:"limit"`
}

// ListAppeals godoc
// @Summary      คำอุทธรณ์ Blacklist ในรายวิชาที่ฉันสอน (อาจารย์/แอดมิน)
// @Description  พร้อมข้อมูลนักศึกษา เหตุผล และจำนวนครั้งที่เคยถูก Blacklist — หลักฐานและไทม์ไลน์ดูที่ GET /reports/{report_id}
// @Tags         reports
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "สถานะ (คั่นด้วย , ได้) เช่น appeal_pending,appeal_more_info"
// @Param        page    query  int     false  "หน้า"
// @Param        limit   query  int     false  "จำนวนต่อหน้า (สูงสุด 100)"
// @Success      200  {object}  AppealPage
// @Router       /instructor/appeals [get]
func (h *Handler) ListAppeals(c *gin.Context) {
	actor := actorFrom(c)
	base, err := parseFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	f := database.AppealFilter{AllCourses: actor.isAdmin(), Page: base.Page, Limit: base.Limit}
	for _, s := range base.Statuses {
		f.Statuses = append(f.Statuses, models.PenaltyStatus(s))
	}
	if !f.AllCourses {
		if f.CourseIDs, err = database.ManagedCourseIDs(actor.ID); err != nil {
			writeAppealDBError(c, err, "managed courses")
			return
		}
	}
	rows, total, err := database.ListAppeals(f)
	if err != nil {
		writeAppealDBError(c, err, "list appeals")
		return
	}
	c.JSON(http.StatusOK, AppealPage{Data: rows, Total: total, Page: f.Page, Limit: f.Limit})
}
