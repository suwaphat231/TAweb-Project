package staff_test

import (
	"bytes"
	"encoding/json"
	"fmt"
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
		ScheduleConfirmed bool `json:"schedule_confirmed"`
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
	accept := func(u models.User) {
		a, err := database.CreateApplication(models.Application{StudentID: u.ID, CourseID: course.ID, RoleApplied: models.RoleLabBoy})
		if err != nil {
			t.Fatal(err)
		}
		database.UpdateApplication(a.ID, func(a *models.Application) { a.Status = models.AppAccepted })
	}
	accept(s1)
	accept(s2)

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

	var hiring, memo, notice models.StaffDocument

	t.Run("workflow shows course info and blocks until the form is verified", func(t *testing.T) {
		w := getWF(t)
		if w.Course.Code != course.Code || w.Course.Semester != "2" || w.Course.AcademicYear != 2569 || len(w.Steps) != 3 {
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

	t.Run("missing work plan is reported, not silently created", func(t *testing.T) {
		expect(t, 200, "PUT", fmt.Sprintf("/staff/reviews/%d/verify", course.ID), tokStaff, nil)
		code, raw := call("POST", wfPath+"/hiring_notice", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "Staff Case") {
			t.Fatalf("no staff case: %d %s", code, raw)
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
		posting, _ := database.ActivePostingForCourse(course.ID)
		sc, ok := database.StaffCaseByPostingID(posting.ID)
		if !ok {
			t.Fatal("staff confirmation did not create the staff case")
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
		code, raw = call("POST", wfPath+"/lab_notice", tokStaff, nil)
		if code != 422 || !strings.Contains(string(raw), "ก่อน") {
			t.Fatalf("lab notice before memo: %d %s", code, raw)
		}
		expect(t, 400, "POST", wfPath+"/payment_request", tokStaff, nil)
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
		if w.Steps[0].Document == nil || w.Steps[0].Document.ID != hiring.ID || !w.Steps[1].CanCreate {
			t.Fatalf("after step 1: %+v", w.Steps)
		}
	})

	t.Run("concurrent clicks create exactly one approval memo", func(t *testing.T) {
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
		code, file := call("GET", fmt.Sprintf("/staff/documents/%d/file", memo.ID), tokStaff, nil)
		if code != http.StatusOK || len(file) < 1000 || string(file[:2]) != "PK" {
			t.Fatalf("memo download = %d (%d bytes), want a .docx", code, len(file))
		}
	})

	t.Run("lab notice is step 3, built on the memo, signed by its creator", func(t *testing.T) {
		var code int
		code, notice = create("lab_notice", tokStaff, nil)
		if code != 201 {
			t.Fatalf("create lab_notice = %d", code)
		}
		if notice.BasedOnDocumentID == nil || *notice.BasedOnDocumentID != memo.ID {
			t.Fatalf("lab notice based on %v, want memo %d", notice.BasedOnDocumentID, memo.ID)
		}
		if notice.StaffOfficerName != staffU.FullName {
			t.Fatalf("staff officer = %q, want creator %q", notice.StaffOfficerName, staffU.FullName)
		}
		code, file := call("GET", fmt.Sprintf("/staff/documents/%d/file", notice.ID), tokStaff, nil)
		if code != http.StatusOK || string(file[:2]) != "PK" {
			t.Fatalf("lab notice download = %d, want a .docx", code)
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
		expect(t, 409, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokStaff, nil) // lab notice depends on it
		expect(t, 403, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokInst, nil)
	})

	t.Run("source changes are reported; replacing keeps the old version", func(t *testing.T) {
		accept(s3)
		w := getWF(t)
		if len(w.Steps[0].StaleReasons) == 0 {
			t.Fatal("roster change must mark step 1 stale")
		}
		expect(t, 400, "POST", wfPath+"/hiring_notice", tokStaff, map[string]any{"replace": true})
		code, v2 := create("hiring_notice", tokStaff, map[string]any{"replace": true, "reason": "เพิ่มนักศึกษา 1 คน"})
		if code != 201 || v2.Version != 2 || len(v2.Roster) != 3 {
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
		// Later steps go first: the lab notice is built on the memo.
		expect(t, 204, "DELETE", fmt.Sprintf("/staff/documents/%d", notice.ID), tokStaff, nil)
		expect(t, 204, "DELETE", fmt.Sprintf("/staff/documents/%d", memo.ID), tokStaff, nil)
		saved, ok := database.StaffDocumentByID(memo.ID)
		if !ok || saved.Status != models.DocCancelled {
			t.Fatalf("cancelled memo = %+v (found %v)", saved, ok)
		}
		list := expect(t, 200, "GET", "/staff/documents", tokStaff, nil)
		if strings.Contains(string(list), fmt.Sprintf(`"id":%d,`, memo.ID)) {
			t.Fatal("cancelled document still listed")
		}
		w := getWF(t)
		if w.Steps[1].Document != nil || !w.Steps[1].CanCreate || len(w.Steps[1].History) != 1 {
			t.Fatalf("step 2 after cancel: %+v", w.Steps[1])
		}
		var actions []string
		database.DB.Model(&models.StaffAuditLog{}).Where("entity_type = ? AND entity_id = ?", "staff_document", memo.ID).Order("id").Pluck("action", &actions)
		if strings.Join(actions, ",") != "create,cancel" {
			t.Fatalf("memo audit = %v", actions)
		}
		code, _ := create("approval_memo", tokStaff, nil)
		if code != 201 {
			t.Fatalf("recreate memo after cancel = %d", code)
		}
	})
}
