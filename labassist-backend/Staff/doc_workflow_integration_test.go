package staff_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"labassist/config"
	"labassist/database"
	"labassist/middleware"
	"labassist/models"
	"labassist/routes"

	"github.com/gin-gonic/gin"
	mysqldriver "github.com/go-sql-driver/mysql"
)

type workflowResp struct {
	Course struct {
		CourseID     uint     `json:"course_id"`
		Code         string   `json:"code"`
		Semester     string   `json:"semester"`
		AcademicYear int      `json:"academic_year"`
		Instructors  []string `json:"instructors"`
		// ScheduleConfirmed is set once staff confirm the Lab Boy schedule.
		ScheduleConfirmed     bool     `json:"schedule_confirmed"`
		ConfirmBlockedReasons []string `json:"confirm_blocked_reasons"`
	} `json:"course"`
	Steps []struct {
		Step           int                    `json:"step"`
		Type           string                 `json:"type"`
		Document       *models.StaffDocument  `json:"document"`
		History        []models.StaffDocument `json:"history"`
		CanCreate      bool                   `json:"can_create"`
		BlockedReasons []string               `json:"blocked_reasons"`
		StaleReasons   []string               `json:"stale_reasons"`
	} `json:"steps"`
	MonthlyDocuments []models.StaffDocument `json:"monthly_documents"`
}

// TestDocumentWorkflowEndToEnd drives the staff document workflow through
// the real router (JWT, role middleware, handlers, MySQL).
//
//	LABASSIST_TEST_MYSQL_DSN='user:pass@tcp(localhost:3306)/labassist_fresh?parseTime=true' go test ./Staff/
func TestDocumentWorkflowEndToEnd(t *testing.T) {
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to a disposable MySQL database")
	}
	parsed, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	host, port, _ := strings.Cut(parsed.Addr, ":")
	cfg := &config.Config{
		JWTSecret: "integration-test-secret-at-least-32-bytes!!",
		DBHost:    host, DBPort: port, DBUser: parsed.User, DBPassword: parsed.Passwd, DBName: parsed.DBName,
	}
	if err := database.Connect(cfg); err != nil {
		t.Fatalf("connect + migrate: %v", err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	routes.Setup(r, cfg)

	sfx := time.Now().Format("150405.000000")
	code := strings.ReplaceAll(sfx, ".", "")
	mkUser := func(name string, role models.UserRole) (models.User, string) {
		u := models.User{FullName: name + " " + sfx, Email: fmt.Sprintf("%s.%s@test.invalid", name, sfx), Role: role, IsActive: true}
		if role == models.RoleStudent {
			sid := name[len(name)-1:] + code
			u.StudentID = &sid
		}
		u, err := database.CreateUser(u)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		tok, _ := middleware.SignToken(cfg, u.ID, string(role), u.FullName)
		return u, tok
	}
	staffU, tokStaff := mkUser("Staff", models.RoleStaff)
	inst, tokInst := mkUser("Inst", models.RoleInstructor)
	s1, tokStu := mkUser("Stu1", models.RoleStudent)
	s2, _ := mkUser("Stu2", models.RoleStudent)
	s3, _ := mkUser("Stu3", models.RoleStudent)

	course := database.CreateCourse(models.Course{Code: "W" + code[len(code)-7:], Title: "Workflow test", Section: 2,
		Status: models.StatusOpen, LabBoySlots: 5, Semester: "2", AcademicYear: 2569})
	if err := database.DB.Create(&models.CourseInstructor{CourseID: course.ID, InstructorID: inst.ID, Source: models.CourseInstructorImported}).Error; err != nil {
		t.Fatal(err)
	}
	other := database.CreateCourse(models.Course{Code: "X" + code[len(code)-7:], Title: "Other", Section: 1,
		Status: models.StatusOpen, LabBoySlots: 1, Semester: "2", AcademicYear: 2569})
	accept := func(u models.User) models.Application {
		a, err := database.CreateApplication(models.Application{StudentID: u.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := database.ReviewApplicationTx(a.ID, models.AppAccepted, func(a *models.Application) { a.Status = models.AppAccepted }); err != nil {
			t.Fatal(err)
		}
		return a
	}
	accept(s1)
	app2 := accept(s2)

	call := func(method, path, tok string, body any) (int, []byte) {
		var rd *bytes.Reader
		if body == nil {
			rd = bytes.NewReader(nil)
		} else {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		}
		req := httptest.NewRequest(method, "/api/v1"+path, rd)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code, w.Body.Bytes()
	}
	expect := func(t *testing.T, want int, method, path, tok string, body any) []byte {
		t.Helper()
		got, raw := call(method, path, tok, body)
		if got != want {
			t.Fatalf("%s %s = %d, want %d; body = %s", method, path, got, want, raw)
		}
		return raw
	}
	wfPath := fmt.Sprintf("/staff/courses/%d/document-workflow", course.ID)
	getWF := func(t *testing.T) workflowResp {
		t.Helper()
		var w workflowResp
		_ = json.Unmarshal(expect(t, 200, "GET", wfPath, tokStaff, nil), &w)
		return w
	}
	create := func(typ, tok string, body any) (int, models.StaffDocument) {
		code, raw := call("POST", wfPath+"/"+typ, tok, body)
		var d models.StaffDocument
		_ = json.Unmarshal(raw, &d)
		return code, d
	}
	// sign finishes a step; only then does the next one open.
	sign := func(t *testing.T, d models.StaffDocument) {
		t.Helper()
		expect(t, 200, "PUT", fmt.Sprintf("/staff/documents/%d/status", d.ID), tokStaff, map[string]any{"status": "signed"})
	}

	var hiring, memo, payment, report models.StaffDocument

	t.Run("staff see the course only after the instructor confirms the roster", func(t *testing.T) {
		rosterPath := fmt.Sprintf("/instructor/courses/%d/labboy-roster/confirm", course.ID)
		expect(t, 409, "GET", wfPath, tokStaff, nil)
		var reviews []models.FormReview
		_ = json.Unmarshal(expect(t, 200, "GET", "/staff/reviews", tokStaff, nil), &reviews)
		for _, rv := range reviews {
			if rv.CourseID == course.ID {
				t.Fatal("review list shows the course before the instructor confirmed the roster")
			}
		}
		expect(t, 200, "PUT", rosterPath, tokInst, nil)
		// The confirmed roster is final: no more accepting.
		accept3, err := database.CreateApplication(models.Application{StudentID: s3.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy})
		if err != nil {
			t.Fatal(err)
		}
		expect(t, 409, "PUT", fmt.Sprintf("/instructor/applications/%d/review", accept3.ID), tokInst, map[string]any{"status": "accepted"})
		expect(t, 200, "PUT", fmt.Sprintf("/instructor/applications/%d/review", accept3.ID), tokInst, map[string]any{"status": "rejected"})
		// Reopen and confirm again while staff have not started.
		expect(t, 200, "DELETE", rosterPath, tokInst, nil)
		expect(t, 409, "GET", wfPath, tokStaff, nil)
		expect(t, 200, "PUT", rosterPath, tokInst, nil)
		getWF(t)
		// Another course is confirmed directly so the isolation checks below can open it.
		if err := database.DB.Model(&models.Posting{}).Where("course_id = ? AND is_active = true", other.ID).
			Update("lab_boy_roster_confirmed_at", time.Now()).Error; err != nil {
			t.Fatal(err)
		}
	})

	t.Run("workflow shows course info and blocks until the form is verified", func(t *testing.T) {
		w := getWF(t)
		if w.Course.Code != course.Code || w.Course.Semester != "2" || w.Course.AcademicYear != 2569 || len(w.Steps) != 4 {
			t.Fatalf("workflow = %+v", w)
		}
		if len(w.Course.Instructors) != 1 || !strings.Contains(w.Course.Instructors[0], "Inst") {
			t.Fatalf("instructors = %v", w.Course.Instructors)
		}
		if w.Steps[0].CanCreate || len(w.Steps[0].BlockedReasons) == 0 {
			t.Fatal("step 1 must be blocked before verification")
		}
		expect(t, 422, "POST", wfPath+"/hiring_notice", tokStaff, nil)
	})

	confirmPath := fmt.Sprintf("/staff/courses/%d/confirm-schedule", course.ID)
	t.Run("only staff confirm the lab boy schedule", func(t *testing.T) {
		expect(t, 404, "POST", fmt.Sprintf("/instructor/courses/%d/confirm-schedule", course.ID), tokInst, nil)
		expect(t, 403, "POST", confirmPath, tokInst, nil)
		expect(t, 422, "POST", fmt.Sprintf("/staff/courses/%d/confirm-schedule", other.ID), tokStaff, nil)
		if getWF(t).Course.ScheduleConfirmed {
			t.Fatal("schedule reported confirmed before staff confirmed it")
		}
	})

	t.Run("the work plan opens with Lab Boys; the schedule waits for signed documents", func(t *testing.T) {
		expect(t, 200, "PUT", fmt.Sprintf("/staff/reviews/%d/verify", course.ID), tokStaff, nil)
		w := getWF(t)
		if len(w.Course.ConfirmBlockedReasons) != 4 {
			t.Fatalf("confirm blockers = %v, want the 4 unsigned steps", w.Course.ConfirmBlockedReasons)
		}
		code, raw := call("POST", confirmPath, tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ลงนาม") {
			t.Fatalf("confirm before documents are signed: %d %s", code, raw)
		}
		posting, _ := database.ActivePostingForCourse(course.ID)
		sc, ok := database.StaffCaseByPostingID(posting.ID)
		if !ok {
			t.Fatal("opening the workflow did not create the staff case")
		}
		expect(t, 422, "POST", wfPath+"/hiring_notice", tokStaff, nil) // no schedule group yet
		g, err := database.UpsertScheduleGroup(models.ScheduleGroup{StaffCaseID: sc.ID, WeekDay: "WED", StartTime: "10:20", EndTime: "12:20"})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := database.AddScheduleGroupMonth(models.ScheduleGroupMonth{ScheduleGroupID: g.ID, Year: 2026, Month: 12}); err != nil {
			t.Fatal(err)
		}
		for _, d := range []int{2, 9, 16} {
			if _, err := database.AddSingleGroupOccurrence(sc.ID, g.ID, time.Date(2026, 12, d, 0, 0, 0, 0, time.UTC), "10:20", "12:20", nil); err != nil {
				t.Fatal(err)
			}
		}
		// Clicking "add whole semester" again used to leave an empty group
		// with the same weekly slot behind.
		if _, err := database.UpsertScheduleGroup(models.ScheduleGroup{StaffCaseID: sc.ID, WeekDay: "WED", StartTime: "10:20", EndTime: "12:20"}); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("only staff/admin may create, and steps must go in order", func(t *testing.T) {
		expect(t, 403, "POST", wfPath+"/hiring_notice", tokInst, nil)
		expect(t, 403, "POST", wfPath+"/hiring_notice", tokStu, nil)
		expect(t, 403, "GET", wfPath, tokInst, nil)
		code, raw := call("POST", wfPath+"/approval_memo", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ก่อน") {
			t.Fatalf("memo before hiring notice: %d %s", code, raw)
		}
		code, raw = call("POST", wfPath+"/payment_request", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ก่อน") {
			t.Fatalf("payment request before memo: %d %s", code, raw)
		}
		code, raw = call("POST", wfPath+"/work_report", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ก่อน") {
			t.Fatalf("work report before payment request: %d %s", code, raw)
		}
		expect(t, 400, "POST", wfPath+"/lab_notice", tokStaff, nil)
		expect(t, 404, "POST", "/staff/courses/999999999/document-workflow/hiring_notice", tokStaff, nil)
	})

	t.Run("step 1 is built from stored data and cannot be duplicated", func(t *testing.T) {
		code, d := create("hiring_notice", tokStaff, nil)
		if code != 201 {
			t.Fatalf("create hiring = %d", code)
		}
		if len(d.WorkSchedule) != 1 {
			t.Fatalf("weekly work days = %+v, want the one Wednesday slot once", d.WorkSchedule)
		}
		hiring = d
		if hiring.CourseID == nil || *hiring.CourseID != course.ID || hiring.PostingID == nil || len(hiring.Roster) != 2 || hiring.Version != 1 {
			t.Fatalf("hiring = %+v", hiring)
		}
		if code, _ := create("hiring_notice", tokStaff, nil); code != 409 {
			t.Fatalf("duplicate hiring = %d", code)
		}
		// The older generic endpoint follows the same rules.
		expect(t, 409, "POST", "/staff/documents", tokStaff, map[string]any{"type": "hiring_notice", "course_ref": "x", "course_id": course.ID})
		expect(t, 400, "POST", "/staff/documents", tokStaff, map[string]any{"type": "approval_memo", "course_ref": "x"})
		w := getWF(t)
		if w.Steps[0].Document == nil || w.Steps[0].Document.ID != hiring.ID || w.Steps[1].CanCreate {
			t.Fatalf("after step 1: %+v", w.Steps)
		}
	})

	t.Run("the next step opens only once the previous document is signed", func(t *testing.T) {
		code, raw := call("POST", wfPath+"/approval_memo", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ลงนาม") {
			t.Fatalf("memo before hiring notice is signed: %d %s", code, raw)
		}
		expect(t, 200, "PUT", fmt.Sprintf("/staff/documents/%d/status", hiring.ID), tokStaff, map[string]any{"status": "awaiting_signature"})
		if w := getWF(t); w.Steps[1].CanCreate || len(w.Steps[1].BlockedReasons) == 0 {
			t.Fatalf("awaiting signature must still block step 2: %+v", w.Steps[1])
		}
		sign(t, hiring)
		if w := getWF(t); !w.Steps[1].CanCreate {
			t.Fatalf("signed hiring notice must open step 2: %+v", w.Steps[1])
		}
	})

	t.Run("concurrent clicks create exactly one approval memo", func(t *testing.T) {
		// The plan changes after step 1 was issued; the memo must still carry
		// exactly what step 1 notified, not the live plan.
		posting, _ := database.ActivePostingForCourse(course.ID)
		sc, _ := database.StaffCaseByPostingID(posting.ID)
		groups, err := database.ScheduleGroupsForCase(sc.ID)
		if err != nil || len(groups) == 0 {
			t.Fatalf("schedule groups: %v %v", groups, err)
		}
		if _, err := database.AddSingleGroupOccurrence(sc.ID, groups[0].ID, time.Date(2026, 12, 23, 0, 0, 0, 0, time.UTC), "10:20", "12:20", nil); err != nil {
			t.Fatal(err)
		}
		var wg sync.WaitGroup
		codes := make([]int, 4)
		docs := make([]models.StaffDocument, 4)
		for i := range codes {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				codes[i], docs[i] = create("approval_memo", tokStaff, map[string]any{"ref_number": "อว 8613.7/123"})
			}(i)
		}
		wg.Wait()
		created := 0
		for i, c := range codes {
			switch c {
			case 201:
				created++
				memo = docs[i]
			case 409:
			default:
				t.Fatalf("unexpected status %d", c)
			}
		}
		if created != 1 {
			t.Fatalf("created %d memos, want 1 (codes %v)", created, codes)
		}
		if memo.BasedOnDocumentID == nil || *memo.BasedOnDocumentID != hiring.ID || memo.CourseID == nil || *memo.CourseID != course.ID || memo.RefNumber != "อว 8613.7/123" {
			t.Fatalf("memo = %+v", memo)
		}
		// DataSnapshot is not serialized, so check the stored row.
		saved, _ := database.StaffDocumentByID(memo.ID)
		if saved.DataSnapshot == "" || saved.StaffCaseID == nil || len(saved.Roster) != 2 {
			t.Fatalf("memo not built from stored data: %+v", saved)
		}
		step1, _ := database.StaffDocumentByID(hiring.ID)
		if saved.DataSnapshot != step1.DataSnapshot || saved.SessionsPerMonth != step1.SessionsPerMonth ||
			fmt.Sprint(saved.WorkSchedule) != fmt.Sprint(step1.WorkSchedule) || fmt.Sprint(saved.Roster) != fmt.Sprint(step1.Roster) {
			t.Fatalf("memo does not carry step 1's data:\nmemo  %s\nstep1 %s", saved.DataSnapshot, step1.DataSnapshot)
		}
		code, file := call("GET", fmt.Sprintf("/staff/documents/%d/file", memo.ID), tokStaff, nil)
		if code != http.StatusOK || len(file) < 1000 || string(file[:2]) != "PK" {
			t.Fatalf("memo download = %d (%d bytes), want a .docx", code, len(file))
		}
		sign(t, memo)
	})

	t.Run("step 3 bills every planned month from the approval memo in one click", func(t *testing.T) {
		code, d := create("payment_request", tokStaff, nil)
		if code != 201 {
			t.Fatalf("create payment request = %d", code)
		}
		if d.BasedOnDocumentID == nil || *d.BasedOnDocumentID != memo.ID || d.PriorMemoRef != "อว 8613.7/123" ||
			d.PriorMemoDate != memo.CreatedAt.In(database.BangkokTime).Format("2006-01-02") || len(d.Roster) != 2 || d.StaffOfficerName != staffU.FullName {
			t.Fatalf("payment request = %+v", d)
		}
		w := getWF(t)
		if w.Steps[2].Document == nil || w.Steps[2].Document.ID != d.ID {
			t.Fatalf("step 3 = %+v", w.Steps[2])
		}
		for _, m := range w.MonthlyDocuments {
			if m.ID == d.ID {
				t.Fatal("step 3 document also listed under monthly documents")
			}
		}
		code, file := call("GET", fmt.Sprintf("/staff/documents/%d/file", d.ID), tokStaff, nil)
		if code != http.StatusOK || string(file[:2]) != "PK" {
			t.Fatalf("payment request download = %d", code)
		}
		zr, _ := zip.NewReader(bytes.NewReader(file), int64(len(file)))
		var body string
		for _, f := range zr.File {
			if f.Name == "word/document.xml" {
				rc, _ := f.Open()
				b, _ := io.ReadAll(rc)
				rc.Close()
				body = string(b)
			}
		}
		// The memo's plan: Wed 2, 9, 16 Dec 2026, 10:20-12:20, 2 Lab Boys at 50 baht.
		for _, want := range []string{"ธันวาคม", "หกร้อยบาทถ้วน", "อว 8613.7/123", "2570"} {
			if !strings.Contains(body, want) {
				t.Errorf("payment request document lacks %q", want)
			}
		}
		payment = d
		sign(t, payment)
	})

	t.Run("step 4 reports every planned month from the payment request in one click", func(t *testing.T) {
		code, d := create("work_report", tokStaff, nil)
		if code != 201 {
			t.Fatalf("create work report = %d", code)
		}
		if d.BasedOnDocumentID == nil || *d.BasedOnDocumentID != payment.ID || len(d.Roster) != 2 {
			t.Fatalf("work report = %+v", d)
		}
		w := getWF(t)
		if w.Steps[3].Type != string(models.DocWorkReport) || w.Steps[3].Document == nil || w.Steps[3].Document.ID != d.ID {
			t.Fatalf("step 4 = %+v", w.Steps[3])
		}
		for _, m := range w.MonthlyDocuments {
			if m.ID == d.ID {
				t.Fatal("step 4 document also listed under monthly documents")
			}
		}
		code, file := call("GET", fmt.Sprintf("/staff/documents/%d/file", d.ID), tokStaff, nil)
		if code != http.StatusOK || string(file[:2]) != "PK" {
			t.Fatalf("work report download = %d", code)
		}
		report = d
	})

	t.Run("staff confirm the schedule once every document is signed", func(t *testing.T) {
		for _, d := range []models.StaffDocument{memo, payment, report} {
			if saved, _ := database.StaffDocumentByID(d.ID); saved.Status != models.DocSigned {
				sign(t, saved)
			}
		}
		if r := getWF(t).Course.ConfirmBlockedReasons; len(r) != 0 {
			t.Fatalf("confirm still blocked: %v", r)
		}
		workDays := func() []database.WorkSession {
			var out []database.WorkSession
			_ = json.Unmarshal(expect(t, 200, "GET", "/student/work-schedule", tokStu, nil), &out)
			return out
		}
		if got := workDays(); len(got) != 0 {
			t.Fatalf("student sees %d work days before staff confirmed the schedule", len(got))
		}
		var confirmed struct {
			Confirmed bool `json:"confirmed"`
			Notified  int  `json:"notified"`
		}
		_ = json.Unmarshal(expect(t, 200, "POST", confirmPath, tokStaff, nil), &confirmed)
		if !confirmed.Confirmed || confirmed.Notified != 2 {
			t.Fatalf("confirm = %+v, want confirmed and 2 students notified", confirmed)
		}
		_ = json.Unmarshal(expect(t, 200, "POST", confirmPath, tokStaff, nil), &confirmed)
		if confirmed.Notified != 0 {
			t.Fatalf("second confirm notified %d students again", confirmed.Notified)
		}
		if !getWF(t).Course.ScheduleConfirmed {
			t.Fatal("workflow does not report the confirmed schedule")
		}
		got := workDays()
		if len(got) == 0 || got[0].CourseID != course.ID || got[0].SessionDate != "2026-12-02" || got[0].WorkTimeStart != "10:20" {
			t.Fatalf("student work days after confirm = %+v", got)
		}
	})

	t.Run("documents of one course never appear in another", func(t *testing.T) {
		code, raw := call("GET", fmt.Sprintf("/staff/courses/%d/document-workflow", other.ID), tokStaff, nil)
		if code != 200 || strings.Contains(string(raw), fmt.Sprintf(`"id":%d,`, hiring.ID)) {
			t.Fatalf("other course workflow leaked: %d %s", code, raw)
		}
	})

	t.Run("a document another step depends on cannot be cancelled", func(t *testing.T) {
		expect(t, 409, "DELETE", fmt.Sprintf("/staff/documents/%d", hiring.ID), tokStaff, nil)
		expect(t, 409, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokStaff, nil) // the payment request depends on it
		expect(t, 403, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokInst, nil)
	})

	t.Run("source changes are reported; replacing keeps the old version", func(t *testing.T) {
		// Students cannot withdraw from a confirmed roster, so the roster
		// change is made directly in the database.
		if _, err := database.WithdrawApplication(app2.ID, s2.ID, "ติดธุระ"); !errors.Is(err, database.ErrWithdrawalRosterConfirmed) {
			t.Fatalf("withdraw from confirmed roster err = %v", err)
		}
		if err := database.DB.Model(&models.Application{}).Where("id = ?", app2.ID).
			Update("status", models.AppWithdrawn).Error; err != nil {
			t.Fatal(err)
		}
		w := getWF(t)
		if len(w.Steps[0].StaleReasons) == 0 {
			t.Fatal("roster change must mark step 1 stale")
		}
		expect(t, 400, "POST", wfPath+"/hiring_notice", tokStaff, map[string]any{"replace": true})
		code, v2 := create("hiring_notice", tokStaff, map[string]any{"replace": true, "reason": "นักศึกษาถอน 1 คน"})
		if code != 201 || v2.Version != 2 || len(v2.Roster) != 1 {
			t.Fatalf("replace = %d %+v", code, v2)
		}
		old, _ := database.StaffDocumentByID(hiring.ID)
		if old.Status != models.DocSuperseded || old.SupersededByID == nil || *old.SupersededByID != v2.ID {
			t.Fatalf("old version = %+v", old)
		}
		w = getWF(t)
		if len(w.Steps[0].History) != 1 || len(w.Steps[0].StaleReasons) != 0 {
			t.Fatalf("step 1 after replace: %+v", w.Steps[0])
		}
		if len(w.Steps[1].StaleReasons) == 0 {
			t.Fatal("memo built from the old hiring notice must be marked stale")
		}
		expect(t, 409, "PUT", fmt.Sprintf("/staff/documents/%d/status", hiring.ID), tokStaff, map[string]any{"status": "signed"})
		expect(t, 200, "PUT", fmt.Sprintf("/staff/documents/%d/status", v2.ID), tokStaff, map[string]any{"status": "awaiting_signature"})
		hiring = v2
	})

	t.Run("cancel keeps the row and its audit trail", func(t *testing.T) {
		// Later steps go first: each is built on the one before.
		expect(t, 204, "DELETE", fmt.Sprintf("/staff/documents/%d", report.ID), tokStaff, nil)
		expect(t, 204, "DELETE", fmt.Sprintf("/staff/documents/%d", payment.ID), tokStaff, nil)
		expect(t, 204, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokStaff, nil)
		saved, ok := database.StaffDocumentByID(memo.ID)
		if !ok || saved.Status != models.DocCancelled {
			t.Fatalf("cancelled memo = %+v (found %v)", saved, ok)
		}
		list := expect(t, 200, "GET", "/staff/documents", tokStaff, nil)
		if strings.Contains(string(list), fmt.Sprintf(`"id":%d,`, memo.ID)) {
			t.Fatal("cancelled document still listed")
		}
		sign(t, hiring) // v2 of the hiring notice
		w := getWF(t)
		if w.Steps[1].Document != nil || !w.Steps[1].CanCreate || len(w.Steps[1].History) != 1 {
			t.Fatalf("step 2 after cancel: %+v", w.Steps[1])
		}
		var actions []string
		database.DB.Model(&models.StaffAuditLog{}).Where("entity_type = ? AND entity_id = ?", "staff_document", memo.ID).Order("id").Pluck("action", &actions)
		if strings.Join(actions, ",") != "create,status_change,cancel" {
			t.Fatalf("memo audit = %v", actions)
		}
		code, _ := create("approval_memo", tokStaff, nil)
		if code != 201 {
			t.Fatalf("recreate memo after cancel = %d", code)
		}
	})
}
