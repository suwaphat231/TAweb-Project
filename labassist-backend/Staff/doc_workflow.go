package staff

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// workflowStep is one document in the course offering's pre-work workflow.
// Only documents whose real template/title has been confirmed are listed;
// new steps are added here (and the frontend picks them up from the API).
type workflowStep struct {
	Step     int
	Type     models.DocType
	Label    string
	Requires *models.DocType
}

func docTypePtr(t models.DocType) *models.DocType { return &t }

// preWorkSteps are created once per course offering (posting), in order.
//   - Step 1's title is the one printed on lab_boy_hiring_notice.docx.
//   - Step 2's title is from the department's sample memo
//     (บันทึกขออนุมัติ (ป.ตรี)…doc, "เรื่อง ขออนุมัติจ้างนักศึกษาปฏิบัติงาน"),
//     rendered from approval_memo.docx.
var preWorkSteps = []workflowStep{
	{Step: 1, Type: models.DocHiringNotice, Label: "แบบฟอร์มแจ้งความประสงค์ในการจ้างนักศึกษาช่วยสอนและช่วยคุมปฏิบัติการ"},
	{Step: 2, Type: models.DocApprovalMemo, Label: "บันทึกข้อความ ขออนุมัติจ้างนักศึกษาปฏิบัติงาน", Requires: docTypePtr(models.DocHiringNotice)},
}

// monthlyDocTypes are created per billing month (GenerateMonthlyDocument),
// so the workflow only lists them.
var monthlyDocTypes = map[models.DocType]bool{
	models.DocWorkReport: true, models.DocPaymentEvidence: true, models.DocPaymentRequest: true,
}

func stepFor(t models.DocType) (workflowStep, bool) {
	for _, s := range preWorkSteps {
		if s.Type == t {
			return s, true
		}
	}
	return workflowStep{}, false
}

// WorkflowCourse is the course offering a workflow belongs to.
type WorkflowCourse struct {
	CourseID     uint     `json:"course_id"`
	PostingID    uint     `json:"posting_id"`
	Code         string   `json:"code"`
	Title        string   `json:"title"`
	EnglishTitle string   `json:"english_title,omitempty"`
	Section      int      `json:"section"`
	Semester     string   `json:"semester"`
	AcademicYear int      `json:"academic_year"`
	Instructors  []string `json:"instructors"`
	LabBoyCount  int      `json:"labboy_count"`
	ReviewStatus string   `json:"review_status"`
	StaffCaseID  *uint    `json:"staff_case_id,omitempty"`
	PlanStatus   string   `json:"plan_status,omitempty"`
}

// WorkflowStepView is one step as the staff UI shows it.
type WorkflowStepView struct {
	Step     int                   `json:"step"`
	Type     models.DocType        `json:"type"`
	Label    string                `json:"label"`
	Document *models.StaffDocument `json:"document,omitempty"`
	// History holds this step's earlier (superseded/cancelled) versions.
	History []models.StaffDocument `json:"history"`
	// CanCreate: no active document yet and every precondition holds.
	CanCreate bool `json:"can_create"`
	// BlockedReasons explain why the step cannot be created yet.
	BlockedReasons []string `json:"blocked_reasons"`
	// StaleReasons explain why the existing document no longer matches its
	// sources; the document itself is never changed — staff decide whether
	// to create a new version.
	StaleReasons []string `json:"stale_reasons"`
	HasTemplate  bool     `json:"has_template"`
}

// WorkflowResponse is the whole document workflow of one course offering.
type WorkflowResponse struct {
	Course           WorkflowCourse         `json:"course"`
	Steps            []WorkflowStepView     `json:"steps"`
	MonthlyDocuments []models.StaffDocument `json:"monthly_documents"`
}

// templateReady lists the step types that can be rendered to .docx today.
var templateReady = map[models.DocType]bool{
	models.DocHiringNotice: true, models.DocApprovalMemo: true, models.DocWorkReport: true,
	models.DocPaymentEvidence: true, models.DocPaymentRequest: true,
}

// offering resolves the course and its active posting, answering the
// request itself when either is missing.
func offering(c *gin.Context) (models.Course, models.Posting, bool) {
	id, err := strconv.ParseUint(c.Param("courseId"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course id"})
		return models.Course{}, models.Posting{}, false
	}
	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายวิชา"})
		return course, models.Posting{}, false
	}
	posting, ok := database.ActivePostingForCourse(course.ID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "รายวิชานี้ยังไม่มีรอบรับสมัคร"})
		return course, posting, false
	}
	return course, posting, true
}

func instructorNames(course models.Course) []string {
	names := []string{}
	if us, err := database.InstructorsForCourse(course); err == nil {
		for _, u := range us {
			names = append(names, u.FullName)
		}
	}
	if len(names) == 0 && strings.TrimSpace(course.InstructorName) != "" {
		names = append(names, course.InstructorName)
	}
	return names
}

func rosterIDs(r []models.RosterEntry) []uint {
	ids := make([]uint, 0, len(r))
	for _, e := range r {
		ids = append(ids, e.StudentID)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func sameIDs(a, b []uint) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// preconditions lists what still blocks creating any pre-work document for
// this offering. It is checked again on create, never trusted from the UI.
func preconditions(review models.FormReview, sc *models.StaffCase, accepted []models.Application) []string {
	reasons := []string{}
	if review.Status != models.ReviewVerified {
		reasons = append(reasons, "ยังไม่ได้ตรวจสอบแบบฟอร์มของอาจารย์ว่าครบถ้วน")
	}
	if len(accepted) == 0 {
		reasons = append(reasons, "ยังไม่มีนักศึกษาที่ผ่านการคัดเลือก")
	}
	if sc == nil {
		reasons = append(reasons, "อาจารย์ยังไม่ได้ยืนยันตารางปฏิบัติงาน (ยังไม่มี Staff Case)")
		return reasons
	}
	snap := database.BuildHiringNoticeSnapshot(sc.ID)
	reasons = append(reasons, snap.BlockingReasons...)
	return reasons
}

// GetDocumentWorkflow godoc
// @Summary      Workflow เอกสารของรายวิชา (เจ้าหน้าที่/แอดมิน)
// @Description  ข้อมูลรายวิชา ภาค/ปีการศึกษา อาจารย์ผู้สอน และสถานะเอกสารแต่ละขั้นตามลำดับ พร้อมเหตุผลที่ยังสร้างไม่ได้ และเตือนเมื่อข้อมูลต้นทางเปลี่ยนหลังสร้างเอกสาร
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int  true  "Course ID"
// @Success      200  {object}  WorkflowResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /staff/courses/{courseId}/document-workflow [get]
func (h *Handler) GetDocumentWorkflow(c *gin.Context) {
	course, posting, ok := offering(c)
	if !ok {
		return
	}
	docs, err := database.StaffDocumentsForPosting(posting.ID)
	accepted, err2 := database.AcceptedStudentsForPosting(posting.ID)
	if err := errors.Join(err, err2); err != nil {
		log.Printf("document workflow %d: %v", course.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	review := database.ReviewForPosting(posting.ID, course.ID)
	var sc *models.StaffCase
	if found, ok := database.StaffCaseByPostingID(posting.ID); ok {
		sc = &found
	}

	resp := WorkflowResponse{
		Course: WorkflowCourse{
			CourseID: course.ID, PostingID: posting.ID, Code: course.Code, Title: course.Title,
			EnglishTitle: course.EnglishTitle, Section: course.Section, Semester: course.Semester,
			AcademicYear: course.AcademicYear, Instructors: instructorNames(course),
			LabBoyCount: len(accepted), ReviewStatus: string(review.Status),
		},
		Steps:            []WorkflowStepView{},
		MonthlyDocuments: []models.StaffDocument{},
	}
	if resp.Course.ReviewStatus == "" {
		resp.Course.ReviewStatus = string(models.ReviewPending)
	}
	if sc != nil {
		resp.Course.StaffCaseID = &sc.ID
		resp.Course.PlanStatus = string(sc.Status)
	}

	acceptedIDs := make([]uint, 0, len(accepted))
	for _, a := range accepted {
		acceptedIDs = append(acceptedIDs, a.StudentID)
	}
	sort.Slice(acceptedIDs, func(i, j int) bool { return acceptedIDs[i] < acceptedIDs[j] })

	blocked := preconditions(review, sc, accepted)
	active := map[models.DocType]*models.StaffDocument{}
	for _, st := range preWorkSteps {
		v := WorkflowStepView{Step: st.Step, Type: st.Type, Label: st.Label, History: []models.StaffDocument{},
			BlockedReasons: []string{}, StaleReasons: []string{}, HasTemplate: templateReady[st.Type]}
		for i := range docs {
			d := docs[i]
			if d.Type != st.Type {
				continue
			}
			if database.IsActiveDocStatus(d.Status) {
				dd := d
				v.Document = &dd
			} else {
				v.History = append(v.History, d)
			}
		}
		active[st.Type] = v.Document
		if v.Document == nil {
			v.BlockedReasons = append(v.BlockedReasons, blocked...)
			if st.Requires != nil && active[*st.Requires] == nil {
				prev, _ := stepFor(*st.Requires)
				v.BlockedReasons = append(v.BlockedReasons, "ต้องสร้าง \""+prev.Label+"\" ก่อน")
			}
			v.CanCreate = len(v.BlockedReasons) == 0
		} else {
			if !sameIDs(rosterIDs(v.Document.Roster), acceptedIDs) {
				v.StaleReasons = append(v.StaleReasons, "รายชื่อนักศึกษาที่ผ่านการคัดเลือกเปลี่ยนไปหลังสร้างเอกสาร")
			}
			if st.Requires != nil {
				prev := active[*st.Requires]
				if prev == nil || v.Document.BasedOnDocumentID == nil || *v.Document.BasedOnDocumentID != prev.ID {
					v.StaleReasons = append(v.StaleReasons, "เอกสารขั้นก่อนหน้าถูกสร้างฉบับใหม่หรือยกเลิกแล้ว")
				}
			}
		}
		resp.Steps = append(resp.Steps, v)
	}
	for _, d := range docs {
		if monthlyDocTypes[d.Type] && d.Status != models.DocCancelled {
			resp.MonthlyDocuments = append(resp.MonthlyDocuments, d)
		}
	}
	c.JSON(http.StatusOK, resp)
}

// CreateWorkflowStepRequest is the body for creating a workflow document.
type CreateWorkflowStepRequest struct {
	// Replace creates a new version of a step that already has a document;
	// the old one is kept as superseded. Reason is then required.
	Replace bool   `json:"replace"`
	Reason  string `json:"reason"`
	Note    string `json:"note"`
	// Memo header fields no table holds (only used by the approval memo).
	RefNumber        string `json:"ref_number"`
	DeptHeadName     string `json:"dept_head_name"`
	StaffOfficerName string `json:"staff_officer_name"`
}

const maxWorkflowTextLen = 300

// CreateWorkflowStep godoc
// @Summary      สร้างเอกสารขั้นถัดไปของ workflow รายวิชา (เจ้าหน้าที่/แอดมิน)
// @Description  ใช้ข้อมูลรายวิชา รายชื่อ Lab Boy และแผนปฏิบัติงานจากฐานข้อมูล ตรวจเงื่อนไขขั้นก่อนหน้า กันการสร้างซ้ำ (409) และสร้างฉบับใหม่ได้ด้วย replace=true พร้อมเหตุผล — ฉบับเดิมถูกเก็บเป็น superseded
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        courseId  path  int                        true  "Course ID"
// @Param        type      path  string                     true  "hiring_notice | approval_memo"
// @Param        body      body  CreateWorkflowStepRequest  false "ตัวเลือก"
// @Success      201  {object}  models.StaffDocument
// @Failure      400  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Failure      422  {object}  handlers.ErrorResponse
// @Router       /staff/courses/{courseId}/document-workflow/{type} [post]
func (h *Handler) CreateWorkflowStep(c *gin.Context) {
	step, ok := stepFor(models.DocType(c.Param("type")))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เอกสารประเภทนี้ไม่อยู่ใน workflow ต้นภาคเรียน"})
		return
	}
	var body CreateWorkflowStepRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
			return
		}
	}
	body.Reason = strings.TrimSpace(body.Reason)
	for _, f := range []*string{&body.Note, &body.RefNumber, &body.DeptHeadName, &body.StaffOfficerName} {
		*f = strings.TrimSpace(*f)
		if utf8.RuneCountInString(*f) > maxWorkflowTextLen {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อความยาวเกินไป"})
			return
		}
	}
	if body.Replace && body.Reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลที่สร้างเอกสารฉบับใหม่"})
		return
	}
	course, posting, ok := offering(c)
	if !ok {
		return
	}
	createStep(c, step, course, posting, body)
}

// createStep is shared by the workflow endpoint and the older generic
// POST /staff/documents, so both apply the same rules.
func createStep(c *gin.Context, step workflowStep, course models.Course, posting models.Posting, body CreateWorkflowStepRequest) {
	actorID := c.GetUint("user_id")
	doc, reasons, err := buildStepDocument(step, course, posting, actorID)
	if err != nil {
		log.Printf("build workflow document: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if len(reasons) > 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": reasons[0], "reasons": reasons})
		return
	}
	doc.Note = body.Note
	doc.RefNumber = body.RefNumber
	doc.DeptHeadName = body.DeptHeadName
	doc.StaffOfficerName = body.StaffOfficerName

	created, err := database.CreateWorkflowDocument(database.NewWorkflowDocument{
		Doc: doc, Requires: step.Requires, Replace: body.Replace, Reason: body.Reason, ActorID: actorID,
	})
	switch {
	case errors.Is(err, database.ErrDocumentExists):
		c.JSON(http.StatusConflict, gin.H{"error": "ขั้นตอนนี้มีเอกสารอยู่แล้ว — หากต้องการสร้างใหม่ให้เลือกสร้างฉบับใหม่พร้อมระบุเหตุผล"})
	case errors.Is(err, database.ErrPrerequisiteMissing):
		prev, _ := stepFor(*step.Requires)
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ต้องสร้าง \"" + prev.Label + "\" ก่อน"})
	case err != nil:
		log.Printf("create workflow document: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	default:
		c.JSON(http.StatusCreated, created)
	}
}

// buildStepDocument assembles a workflow document entirely from stored
// data (course, accepted Lab Boys, the confirmed work plan), or returns why
// it cannot be created yet.
func buildStepDocument(step workflowStep, course models.Course, posting models.Posting, actorID uint) (models.StaffDocument, []string, error) {
	accepted, err := database.AcceptedStudentsForPosting(posting.ID)
	if err != nil {
		return models.StaffDocument{}, nil, err
	}
	review := database.ReviewForPosting(posting.ID, course.ID)
	var sc *models.StaffCase
	if found, ok := database.StaffCaseByPostingID(posting.ID); ok {
		sc = &found
	}
	if reasons := preconditions(review, sc, accepted); len(reasons) > 0 {
		return models.StaffDocument{}, reasons, nil
	}

	courseRef := course.Code + " ตอน " + strconv.Itoa(course.Section)
	postingID, courseID, caseID := posting.ID, course.ID, sc.ID
	doc := models.StaffDocument{
		Name:        docTypeLabel[step.Type] + " " + courseRef,
		Type:        step.Type,
		CourseRef:   courseRef,
		PostingID:   &postingID,
		CourseID:    &courseID,
		StaffCaseID: &caseID,
		StaffID:     actorID,
		Status:      models.DocDraft,
	}
	for _, a := range accepted {
		doc.Roster = append(doc.Roster, models.RosterEntry{StudentID: a.StudentID, StudentName: a.StudentName, StudentCode: a.StudentCode})
	}
	snap := database.BuildHiringNoticeSnapshot(caseID)
	doc.SessionsPerMonth = snap.SessionsPerMonth
	doc.WorkSchedule = snap.WorkSchedule
	// Freeze everything the document is rendered from, so it stays exactly
	// as issued even if the plan or roster changes afterwards.
	if ds, err := database.BuildDocumentSnapshot(caseID, len(doc.Roster)); err == nil {
		if b, err := json.Marshal(ds); err == nil {
			doc.DataSnapshot = string(b)
			doc.SnapshotVersion = ds.SchemaVersion
		}
	} else {
		return models.StaffDocument{}, nil, err
	}
	return doc, nil, nil
}
