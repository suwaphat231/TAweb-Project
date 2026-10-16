package reports_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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

// TestReportWorkflowEndToEnd drives the real router (JWT auth, role
// middleware, handlers, MySQL) through the whole report lifecycle.
//
// Run against a disposable MySQL database, same as the database package's
// integration tests:
//
//	LABASSIST_TEST_MYSQL_DSN='user:pass@tcp(localhost:3306)/labassist_fresh' go test ./reports/
func TestReportWorkflowEndToEnd(t *testing.T) {
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
		u := models.User{FullName: name + " " + sfx, Email: fmt.Sprintf("%s.%s@test.invalid", strings.ReplaceAll(name, " ", ""), sfx), Role: role, IsActive: true}
		if role == models.RoleStudent {
			sid := name[len(name)-1:] + code
			u.StudentID = &sid
		}
		u, err := database.CreateUser(u)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		tok, err := middleware.SignToken(cfg, u.ID, string(role), u.FullName)
		if err != nil {
			t.Fatal(err)
		}
		return u, tok
	}
	instA, tokA := mkUser("InstructorA", models.RoleInstructor)
	instB, tokB := mkUser("InstructorB", models.RoleInstructor)
	stu1, tokS1 := mkUser("Student1", models.RoleStudent)
	stu2, tokS2 := mkUser("Student2", models.RoleStudent)
	_, tokStaff := mkUser("Staff", models.RoleStaff)
	_, tokAdmin := mkUser("Admin", models.RoleAdmin)

	mkCourse := func(owner models.User, n int) models.Course {
		c := database.CreateCourse(models.Course{Code: fmt.Sprintf("T%d%s", n, code[len(code)-6:]), Title: "Report test " + sfx, Section: n,
			Status: models.StatusOpen, LabBoySlots: 3, Semester: "1", AcademicYear: 2569})
		if err := database.DB.Create(&models.CourseInstructor{CourseID: c.ID, InstructorID: owner.ID, Source: models.CourseInstructorImported}).Error; err != nil {
			t.Fatal(err)
		}
		return c
	}
	courseX := mkCourse(instA, 1)
	courseY := mkCourse(instB, 2)
	mkApp := func(s models.User, c models.Course, accept bool) models.Application {
		a, err := database.CreateApplication(models.Application{StudentID: s.ID, CourseID: c.ID, RoleApplied: models.RoleLabBoy})
		if err != nil {
			t.Fatalf("apply: %v", err)
		}
		if accept {
			a, _ = database.UpdateApplication(a.ID, func(a *models.Application) { a.Status = models.AppAccepted })
		}
		return a
	}
	app1X := mkApp(stu1, courseX, true)  // S1 worked as Lab Boy in X
	app2X := mkApp(stu2, courseX, false) // S2 only applied to X
	app1Y := mkApp(stu1, courseY, false) // S1 now applies to B's course Y

	type resp struct {
		code int
		body map[string]any
		raw  []byte
	}
	call := func(method, path, tok string, body any) resp {
		var rd *bytes.Reader
		ct := ""
		switch b := body.(type) {
		case nil:
			rd = bytes.NewReader(nil)
		case *multipartBody:
			rd, ct = bytes.NewReader(b.buf.Bytes()), b.ct
		default:
			j, _ := json.Marshal(b)
			rd, ct = bytes.NewReader(j), "application/json"
		}
		req := httptest.NewRequest(method, "/api/v1"+path, rd)
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		if tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		out := resp{code: w.Code, raw: w.Body.Bytes()}
		_ = json.Unmarshal(w.Body.Bytes(), &out.body)
		return out
	}
	expect := func(t *testing.T, got resp, want int) resp {
		t.Helper()
		if got.code != want {
			t.Fatalf("status = %d, want %d; body = %s", got.code, want, got.raw)
		}
		return got
	}
	today := time.Now().Format("2006-01-02")
	daysAgo := func(n int) string { return time.Now().AddDate(0, 0, -n).Format("2006-01-02") }
	input := func(appID uint, date, cat string) map[string]any {
		return map[string]any{"application_id": appID, "incident_date": date, "category": cat, "description": "ไม่มาปฏิบัติงานโดยไม่แจ้ง", "impact": ""}
	}
	act := func(id uint, tok, action, reason string) resp {
		return call("POST", fmt.Sprintf("/reports/%d/actions", id), tok, map[string]any{"action": action, "reason": reason})
	}
	status := func(t *testing.T, id uint) models.ReportStatus {
		t.Helper()
		rep, ok := database.ReportByID(id)
		if !ok {
			t.Fatalf("report %d missing", id)
		}
		return rep.Status
	}
	pngBytes := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)

	var reportID uint
	var evidenceID uint

	t.Run("1 authorized instructor creates a draft", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(3), "ABSENCE")), http.StatusCreated)
		reportID = uint(got.body["id"].(float64))
		if got.body["status"] != "DRAFT" || uint(got.body["student_id"].(float64)) != stu1.ID {
			t.Fatalf("unexpected body %s", got.raw)
		}
	})

	t.Run("2 instructor of another course cannot report", func(t *testing.T) {
		expect(t, call("POST", "/instructor/reports", tokB, input(app1X.ID, daysAgo(3), "LATE_NOTICE")), http.StatusForbidden)
	})

	t.Run("only accepted Lab Boys can be reported, input validated", func(t *testing.T) {
		expect(t, call("POST", "/instructor/reports", tokA, input(app2X.ID, today, "ABSENCE")), http.StatusBadRequest)
		expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, time.Now().AddDate(0, 0, 2).Format("2006-01-02"), "ABSENCE")), http.StatusBadRequest)
		expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, today, "STEALING")), http.StatusBadRequest)
		expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(3), "ABSENCE")), http.StatusConflict) // duplicate
	})

	t.Run("3 student cannot create or move a report", func(t *testing.T) {
		expect(t, call("POST", "/instructor/reports", tokS1, input(app1X.ID, today, "OTHER")), http.StatusForbidden)
		expect(t, call("GET", "/staff/reports", tokS1, nil), http.StatusForbidden)
	})

	t.Run("draft is private to the reporter", func(t *testing.T) {
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokS1, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokStaff, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokA, nil), http.StatusOK)
	})

	t.Run("8 cannot skip the workflow", func(t *testing.T) {
		// Staff can't see a draft at all, so they get 404 rather than a hint it exists.
		expect(t, act(reportID, tokStaff, "confirm", "ok"), http.StatusNotFound)
		expect(t, act(reportID, tokA, "confirm", "ok"), http.StatusForbidden)
		expect(t, act(reportID, tokAdmin, "confirm", "ok"), http.StatusConflict)
		if s := status(t, reportID); s != models.ReportDraft {
			t.Fatalf("status = %s", s)
		}
	})

	t.Run("evidence upload validates the real file type", func(t *testing.T) {
		got := expect(t, call("POST", fmt.Sprintf("/instructor/reports/%d/evidence", reportID), tokA, newMultipart(t, nil, map[string][]byte{"timesheet.png": pngBytes})), http.StatusCreated)
		var list []models.LabBoyReportEvidence
		_ = json.Unmarshal(got.raw, &list)
		if len(list) != 1 || list[0].ContentType != "image/png" {
			t.Fatalf("evidence = %s", got.raw)
		}
		evidenceID = list[0].ID
		expect(t, call("POST", fmt.Sprintf("/instructor/reports/%d/evidence", reportID), tokA, newMultipart(t, nil, map[string][]byte{"fake.png": []byte("just text")})), http.StatusBadRequest)
		expect(t, call("POST", fmt.Sprintf("/instructor/reports/%d/evidence", reportID), tokB, newMultipart(t, nil, map[string][]byte{"x.png": pngBytes})), http.StatusNotFound)
	})

	t.Run("draft edit keeps an audit trail", func(t *testing.T) {
		in := input(app1X.ID, daysAgo(3), "ABSENCE")
		in["impact"] = "ต้องหาคนแทน"
		expect(t, call("PUT", fmt.Sprintf("/instructor/reports/%d", reportID), tokA, in), http.StatusOK)
		var n int64
		database.DB.Model(&models.StaffAuditLog{}).Where("entity_type = ? AND entity_id = ? AND action = ? AND old_value <> ''", "labboy_report", reportID, "update_draft").Count(&n)
		if n != 1 {
			t.Fatalf("update_draft audit rows = %d", n)
		}
	})

	t.Run("submit notifies the student and locks the draft", func(t *testing.T) {
		got := expect(t, act(reportID, tokA, "submit", ""), http.StatusOK)
		if got.body["status"] != "SUBMITTED" || got.body["submitted_at"] == nil {
			t.Fatalf("body = %s", got.raw)
		}
		var n int64
		database.DB.Model(&models.Notification{}).Where("user_id = ?", stu1.ID).Count(&n)
		if n == 0 {
			t.Fatal("student was not notified")
		}
		expect(t, call("PUT", fmt.Sprintf("/instructor/reports/%d", reportID), tokA, input(app1X.ID, daysAgo(3), "ABSENCE")), http.StatusConflict)
		expect(t, act(reportID, tokA, "submit", ""), http.StatusConflict)
	})

	t.Run("5+15 only involved users see the report and its evidence", func(t *testing.T) {
		detail := fmt.Sprintf("/reports/%d", reportID)
		file := fmt.Sprintf("/reports/%d/evidence/%d", reportID, evidenceID)
		expect(t, call("GET", detail, tokS1, nil), http.StatusOK)
		expect(t, call("GET", detail, tokStaff, nil), http.StatusOK)
		for name, tok := range map[string]string{"other student": tokS2, "other instructor": tokB} {
			if got := call("GET", detail, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s detail = %d", name, got.code)
			}
			if got := call("GET", file, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s evidence = %d", name, got.code)
			}
		}
		got := expect(t, call("GET", file, tokStaff, nil), http.StatusOK)
		if !bytes.Equal(got.raw, pngBytes) {
			t.Fatal("evidence bytes differ")
		}
		// The evidence ID only works together with its own report.
		expect(t, call("GET", fmt.Sprintf("/reports/%d/evidence/%d", reportID+100000, evidenceID), tokStaff, nil), http.StatusNotFound)
		expect(t, call("GET", detail, "", nil), http.StatusUnauthorized)
	})

	t.Run("9 unconfirmed reports never appear as history", func(t *testing.T) {
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("history = %s", got.raw)
		}
	})

	t.Run("6+4 reviewer works the report, student answers", func(t *testing.T) {
		expect(t, act(reportID, tokS1, "start_review", ""), http.StatusForbidden)
		expect(t, act(reportID, tokStaff, "start_review", ""), http.StatusOK)
		expect(t, act(reportID, tokStaff, "request_info", ""), http.StatusConflict) // reason required
		expect(t, act(reportID, tokStaff, "request_info", "ขอคำชี้แจงจากนักศึกษา"), http.StatusOK)

		expect(t, call("POST", fmt.Sprintf("/reports/%d/responses", reportID), tokS2, newMultipart(t, map[string]string{"message": "x"}, nil)), http.StatusNotFound)
		expect(t, call("POST", fmt.Sprintf("/reports/%d/responses", reportID), tokS1, newMultipart(t, map[string]string{"message": "  "}, nil)), http.StatusBadRequest)
		expect(t, call("POST", fmt.Sprintf("/reports/%d/responses", reportID), tokS1,
			newMultipart(t, map[string]string{"message": "วันนั้นป่วย มีใบรับรองแพทย์"}, map[string][]byte{"medical.png": pngBytes})), http.StatusCreated)
		if s := status(t, reportID); s != models.ReportUnderReview {
			t.Fatalf("after student response status = %s, want UNDER_REVIEW", s)
		}
		expect(t, act(reportID, tokStaff, "confirm", "ตรวจสอบบันทึกเวลาแล้ว ใบรับรองแพทย์ลงวันที่ไม่ตรง"), http.StatusOK)
	})

	t.Run("10 confirmed history is visible to the other course's instructor, and logged", func(t *testing.T) {
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		var recs []models.ConfirmedRecord
		_ = json.Unmarshal(got.raw, &recs)
		if len(recs) != 1 || recs[0].ReviewReason == "" || !recs[0].StudentResponded || recs[0].CourseCode != courseX.Code {
			t.Fatalf("records = %s", got.raw)
		}
		if strings.Contains(string(got.raw), "medical.png") || strings.Contains(string(got.raw), "timesheet.png") {
			t.Fatal("history must not expose evidence")
		}
		var n int64
		database.DB.Model(&models.StaffAuditLog{}).Where("entity_type = ? AND entity_id = ? AND action = ? AND actor_id = ?",
			"student_performance_history", stu1.ID, "view_confirmed_history", instB.ID).Count(&n)
		if n == 0 {
			t.Fatal("history access was not logged")
		}
		// B does not teach X, so B cannot use X's application to look.
		expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1X.ID), tokB, nil), http.StatusForbidden)
		expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokS1, nil), http.StatusForbidden)

		apps := expect(t, call("GET", fmt.Sprintf("/instructor/courses/%d/applicants", courseY.ID), tokB, nil), http.StatusOK)
		if !strings.Contains(string(apps.raw), `"confirmed_record_count":1`) {
			t.Fatalf("applicants = %s", apps.raw)
		}
		// The student's own application list must never carry the flag.
		mine := expect(t, call("GET", "/student/applications", tokS1, nil), http.StatusOK)
		if strings.Contains(string(mine.raw), "confirmed_record_count") {
			t.Fatal("student response leaked confirmed_record_count")
		}
	})

	t.Run("reconsideration and reopen keep every earlier decision", func(t *testing.T) {
		reconsider := func(tok string) resp {
			return call("POST", fmt.Sprintf("/reports/%d/responses", reportID), tok, newMultipart(t, map[string]string{"message": "ขอให้ทบทวน", "reconsideration": "true"}, nil))
		}
		expect(t, reconsider(tokS1), http.StatusCreated)
		expect(t, reconsider(tokS1), http.StatusConflict)
		expect(t, act(reportID, tokStaff, "decline_reconsideration", "หลักฐานเดิมเพียงพอ"), http.StatusOK)
		expect(t, act(reportID, tokStaff, "decline_reconsideration", "ซ้ำ"), http.StatusConflict)
		expect(t, act(reportID, tokStaff, "reopen", "พบข้อมูลใหม่"), http.StatusOK)
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("reopened report still shown as confirmed: %s", got.raw)
		}
		expect(t, act(reportID, tokStaff, "not_substantiated", "ข้อมูลไม่เพียงพอ"), http.StatusOK)

		d := expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokStaff, nil), http.StatusOK)
		var detail struct {
			History   []models.LabBoyReportStatusHistory `json:"history"`
			Reviews   []models.LabBoyReportReview        `json:"reviews"`
			Responses []models.LabBoyReportResponse      `json:"responses"`
			Evidence  []models.LabBoyReportEvidence      `json:"evidence"`
		}
		_ = json.Unmarshal(d.raw, &detail)
		var path []string
		for _, h := range detail.History {
			path = append(path, string(h.ToStatus))
		}
		want := "DRAFT SUBMITTED UNDER_REVIEW AWAITING_RESPONSE UNDER_REVIEW CONFIRMED UNDER_REVIEW NOT_SUBSTANTIATED"
		if strings.Join(path, " ") != want {
			t.Fatalf("timeline = %v", path)
		}
		if len(detail.Reviews) != 5 || len(detail.Responses) != 2 || len(detail.Evidence) != 2 {
			t.Fatalf("reviews=%d responses=%d evidence=%d", len(detail.Reviews), len(detail.Responses), len(detail.Evidence))
		}
	})

	t.Run("11 withdrawing keeps the history and needs a reason", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, act(id, tokA, "submit", ""), http.StatusOK)
		expect(t, act(id, tokA, "withdraw", ""), http.StatusConflict)
		expect(t, act(id, tokB, "withdraw", "x"), http.StatusNotFound)
		expect(t, act(id, tokA, "withdraw", "รายงานผิดคน"), http.StatusOK)
		hist, _ := database.ReportStatusHistory(id)
		if len(hist) != 3 || hist[2].ToStatus != models.ReportWithdrawn || hist[2].Reason != "รายงานผิดคน" {
			t.Fatalf("history = %+v", hist)
		}
		// The same incident can be filed again once the earlier one is withdrawn.
		expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
	})

	t.Run("7 an admin who filed a report cannot review it", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokAdmin, input(app1X.ID, daysAgo(6), "DUTY_NEGLECT")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, act(id, tokAdmin, "submit", ""), http.StatusOK)
		expect(t, act(id, tokAdmin, "start_review", ""), http.StatusForbidden)
		expect(t, act(id, tokStaff, "start_review", ""), http.StatusOK)
		expect(t, act(id, tokAdmin, "confirm", "x"), http.StatusForbidden)
	})

	t.Run("13 pagination, search and filters", func(t *testing.T) {
		for i, cat := range []string{"OTHER", "UNPROFESSIONAL_CONDUCT", "OTHER"} {
			expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(20+i), cat)), http.StatusCreated)
		}
		list := func(q string) ReportPageT {
			got := expect(t, call("GET", "/instructor/reports?"+q, tokA, nil), http.StatusOK)
			var p ReportPageT
			_ = json.Unmarshal(got.raw, &p)
			return p
		}
		all := list("limit=100")
		if all.Total != 6 || len(all.Data) != 6 {
			t.Fatalf("A has %d reports (%d rows), want 6", all.Total, len(all.Data))
		}
		p1, p2 := list("limit=4&page=1"), list("limit=4&page=2")
		if p1.Total != 6 || len(p1.Data) != 4 || len(p2.Data) != 2 || p1.Data[0].ID == p2.Data[0].ID {
			t.Fatalf("pages: %d/%d/%d", p1.Total, len(p1.Data), len(p2.Data))
		}
		if p := list("category=OTHER"); p.Total != 2 {
			t.Fatalf("category filter total = %d", p.Total)
		}
		if p := list("status=DRAFT"); p.Total != 4 {
			t.Fatalf("status filter total = %d", p.Total)
		}
		if p := list("status=DRAFT,NOT_SUBSTANTIATED"); p.Total != 5 {
			t.Fatalf("multi status total = %d", p.Total)
		}
		if p := list("date_from=" + daysAgo(21) + "&date_to=" + daysAgo(20)); p.Total != 2 {
			t.Fatalf("date filter total = %d", p.Total)
		}
		if p := list("q=Student1"); p.Total != 6 {
			t.Fatalf("search total = %d", p.Total)
		}
		if p := list("q=nobody-matches-this"); p.Total != 0 {
			t.Fatalf("empty search total = %d", p.Total)
		}
		if p := list(fmt.Sprintf("course_id=%d", courseY.ID)); p.Total != 0 {
			t.Fatalf("course filter total = %d", p.Total)
		}
		// Other instructors see none of A's reports; the student sees only non-drafts.
		gotB := expect(t, call("GET", "/instructor/reports", tokB, nil), http.StatusOK)
		if !strings.Contains(string(gotB.raw), `"total":0`) {
			t.Fatalf("B list = %s", gotB.raw)
		}
		gotS := expect(t, call("GET", "/student/reports", tokS1, nil), http.StatusOK)
		var ps ReportPageT
		_ = json.Unmarshal(gotS.raw, &ps)
		for _, rep := range ps.Data {
			if rep.Status == models.ReportDraft || rep.StudentID != stu1.ID {
				t.Fatalf("student list leaked %+v", rep)
			}
		}
		if ps.Total != 3 {
			t.Fatalf("student sees %d reports, want 3", ps.Total)
		}
		expect(t, call("GET", "/instructor/reports?category=BAD", tokA, nil), http.StatusBadRequest)
	})

	t.Run("14 a failing write rolls the whole transition back", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(30), "ABSENCE")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		before, _ := database.ReportStatusHistory(id)
		err := database.ApplyReportTransition(database.ReportTransition{
			ReportID: id, From: models.ReportDraft, To: models.ReportSubmitted, ActorID: instA.ID, Action: "submit",
			// Points at a user that does not exist: the notifications FK fails
			// after the status row was already updated in the transaction.
			Notifications: []models.Notification{{UserID: 4294967000, Title: "x", Body: "x"}},
		})
		if err == nil {
			t.Fatal("expected FK failure")
		}
		after, _ := database.ReportStatusHistory(id)
		if s := status(t, id); s != models.ReportDraft || len(after) != len(before) {
			t.Fatalf("partial write: status=%s history %d→%d", s, len(before), len(after))
		}
		err = database.ApplyReportTransition(database.ReportTransition{
			ReportID: id, From: models.ReportUnderReview, To: models.ReportConfirmed, ActorID: instA.ID, Action: "confirm",
		})
		if !errors.Is(err, database.ErrStaleReport) {
			t.Fatalf("stale transition err = %v", err)
		}
	})
}

// ReportPageT mirrors reports.ReportPage for decoding.
type ReportPageT struct {
	Data  []models.LabBoyReport `json:"data"`
	Total int64                 `json:"total"`
}

type multipartBody struct {
	buf *bytes.Buffer
	ct  string
}

func newMultipart(t *testing.T, fields map[string]string, files map[string][]byte) *multipartBody {
	t.Helper()
	buf := &bytes.Buffer{}
	w := multipart.NewWriter(buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	for name, data := range files {
		fw, err := w.CreateFormFile("files", name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = fw.Write(data)
	}
	_ = w.Close()
	return &multipartBody{buf: buf, ct: w.FormDataContentType()}
}
