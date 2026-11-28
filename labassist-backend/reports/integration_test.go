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

	t.Run("3 student cannot use instructor or admin report endpoints", func(t *testing.T) {
		expect(t, call("POST", "/instructor/reports", tokS1, input(app1X.ID, today, "OTHER")), http.StatusForbidden)
		expect(t, call("GET", "/admin/reports", tokS1, nil), http.StatusForbidden)
		expect(t, call("GET", "/instructor/reports/review", tokS1, nil), http.StatusForbidden)
	})

	t.Run("draft is private to the reporter", func(t *testing.T) {
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokS1, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokStaff, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokA, nil), http.StatusOK)
	})

	t.Run("8 instructor reports have no review step, admin cannot act", func(t *testing.T) {
		expect(t, act(reportID, tokStaff, "confirm", "ok"), http.StatusNotFound)
		expect(t, act(reportID, tokA, "confirm", "ok"), http.StatusForbidden)
		expect(t, act(reportID, tokA, "request_info", "ok"), http.StatusConflict) // unknown action
		expect(t, act(reportID, tokAdmin, "submit", ""), http.StatusForbidden)
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

	t.Run("9 a draft never appears as history", func(t *testing.T) {
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("history = %s", got.raw)
		}
	})

	t.Run("submit confirms at once and tells the student, without naming the reporter", func(t *testing.T) {
		var before int64
		database.DB.Model(&models.Notification{}).Where("user_id = ?", stu1.ID).Count(&before)
		got := expect(t, act(reportID, tokA, "submit", ""), http.StatusOK)
		if got.body["status"] != "CONFIRMED" || got.body["submitted_at"] == nil || got.body["appeal_deadline"] == nil {
			t.Fatalf("body = %s", got.raw)
		}
		var notes []models.Notification
		database.DB.Where("user_id = ?", stu1.ID).Order("id").Find(&notes)
		if int64(len(notes)) != before+1 || notes[len(notes)-1].Title != "คุณได้รับบันทึกการปฏิบัติงาน" {
			t.Fatalf("student should get exactly one record notice, got %+v", notes)
		}
		if strings.Contains(notes[len(notes)-1].Body, instA.FullName) {
			t.Fatal("the notice must not name the reporter")
		}
		expect(t, call("PUT", fmt.Sprintf("/instructor/reports/%d", reportID), tokA, input(app1X.ID, daysAgo(3), "ABSENCE")), http.StatusConflict)
		expect(t, act(reportID, tokA, "submit", ""), http.StatusConflict)
	})

	t.Run("5+15 only the reporter and admin open the report and its evidence", func(t *testing.T) {
		detail := fmt.Sprintf("/reports/%d", reportID)
		file := fmt.Sprintf("/reports/%d/evidence/%d", reportID, evidenceID)
		for name, tok := range map[string]string{"student": tokS1, "other student": tokS2, "staff": tokStaff, "other instructor": tokB} {
			if got := call("GET", detail, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s detail = %d", name, got.code)
			}
			if got := call("GET", file, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s evidence = %d", name, got.code)
			}
		}
		d := expect(t, call("GET", detail, tokAdmin, nil), http.StatusOK)
		if !strings.Contains(string(d.raw), `"allowed_actions":[]`) {
			t.Fatalf("admin must be read-only: %s", d.raw)
		}
		got := expect(t, call("GET", file, tokAdmin, nil), http.StatusOK)
		if !bytes.Equal(got.raw, pngBytes) {
			t.Fatal("evidence bytes differ")
		}
		expect(t, call("GET", fmt.Sprintf("/reports/%d/evidence/%d", reportID+100000, evidenceID), tokAdmin, nil), http.StatusNotFound)
		expect(t, call("GET", detail, "", nil), http.StatusUnauthorized)
		expect(t, call("POST", fmt.Sprintf("/reports/%d/responses", reportID), tokS1, newMultipart(t, map[string]string{"message": "x"}, nil)), http.StatusNotFound)
	})

	t.Run("10 other instructors see the student was reported, and it is logged", func(t *testing.T) {
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		var recs []models.ConfirmedRecord
		_ = json.Unmarshal(got.raw, &recs)
		if len(recs) != 1 || recs[0].CourseCode != courseX.Code {
			t.Fatalf("records = %s", got.raw)
		}
		if strings.Contains(string(got.raw), "timesheet.png") {
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
		expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokStaff, nil), http.StatusForbidden)
		expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokAdmin, nil), http.StatusOK)

		apps := expect(t, call("GET", fmt.Sprintf("/instructor/courses/%d/applicants", courseY.ID), tokB, nil), http.StatusOK)
		if !strings.Contains(string(apps.raw), `"confirmed_record_count":1`) {
			t.Fatalf("applicants = %s", apps.raw)
		}
		// Staff use the applicant list for documents and never see the flag.
		staffApps := expect(t, call("GET", fmt.Sprintf("/instructor/courses/%d/applicants", courseY.ID), tokStaff, nil), http.StatusOK)
		if strings.Contains(string(staffApps.raw), "confirmed_record_count") {
			t.Fatal("staff applicant list leaked confirmed_record_count")
		}
		// The student's own application list must never carry the flag.
		mine := expect(t, call("GET", "/student/applications", tokS1, nil), http.StatusOK)
		if strings.Contains(string(mine.raw), "confirmed_record_count") {
			t.Fatal("student response leaked confirmed_record_count")
		}
	})

	t.Run("11 withdrawing removes the flag, keeps the history, needs a reason", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, act(id, tokA, "submit", ""), http.StatusOK)
		expect(t, act(id, tokA, "withdraw", ""), http.StatusConflict)
		expect(t, act(id, tokB, "withdraw", "x"), http.StatusNotFound)
		expect(t, act(id, tokAdmin, "withdraw", "x"), http.StatusForbidden)
		expect(t, act(id, tokA, "withdraw", "รายงานผิดคน"), http.StatusOK)
		hist, _ := database.ReportStatusHistory(id)
		if len(hist) != 3 || hist[1].ToStatus != models.ReportConfirmed || hist[2].ToStatus != models.ReportWithdrawn || hist[2].Reason != "รายงานผิดคน" {
			t.Fatalf("history = %+v", hist)
		}
		recs := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		var list []models.ConfirmedRecord
		_ = json.Unmarshal(recs.raw, &list)
		if len(list) != 1 {
			t.Fatalf("withdrawn report still flags the student: %s", recs.raw)
		}
		// The same incident can be filed again once the earlier one is withdrawn.
		expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
	})

	t.Run("admin sees every submitted report, staff cannot list them", func(t *testing.T) {
		got := expect(t, call("GET", "/admin/reports?limit=100", tokAdmin, nil), http.StatusOK)
		var p ReportPageT
		_ = json.Unmarshal(got.raw, &p)
		found := false
		for _, rep := range p.Data {
			if rep.Status == models.ReportDraft {
				t.Fatalf("admin list leaked a draft %+v", rep)
			}
			found = found || rep.ID == reportID
		}
		if !found {
			t.Fatal("admin list misses the confirmed report")
		}
		expect(t, call("GET", "/admin/reports", tokStaff, nil), http.StatusForbidden)
		expect(t, call("GET", "/staff/reports", tokStaff, nil), http.StatusNotFound)
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
		// A: confirmed (1), withdrawn (1), re-filed draft (1), 3 new drafts.
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
		if p := list("status=DRAFT,CONFIRMED"); p.Total != 5 {
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
		// Other instructors see none of A's reports in their own list.
		gotB := expect(t, call("GET", "/instructor/reports", tokB, nil), http.StatusOK)
		if !strings.Contains(string(gotB.raw), `"total":0`) {
			t.Fatalf("B list = %s", gotB.raw)
		}
		expect(t, call("GET", "/instructor/reports?category=BAD", tokA, nil), http.StatusBadRequest)
	})

	t.Run("student report waits for the course instructor to confirm or reject", func(t *testing.T) {
		stu3, tokS3 := mkUser("Student3", models.RoleStudent)
		app3X := mkApp(stu3, courseX, true)
		flags := func() int {
			recs, err := database.ConfirmedRecordsForStudent(stu1.ID, courseX.AcademicYear)
			if err != nil {
				t.Fatal(err)
			}
			return len(recs)
		}
		notes := func(u uint, title string) int64 {
			var n int64
			database.DB.Model(&models.Notification{}).Where("user_id = ? AND title = ?", u, title).Count(&n)
			return n
		}
		before := flags()
		accept := func(name string) {
			u, _ := mkUser(name, models.RoleStudent)
			mkApp(u, courseX, true)
		}
		// Students may send the next report from the following day.
		nextDay := func() {
			database.DB.Exec("UPDATE labboy_reports SET created_at = created_at - INTERVAL 1 DAY WHERE reporter_id = ?", stu3.ID)
		}

		// Only an accepted Lab Boy of the course, and never about themselves.
		expect(t, call("POST", "/student/reports", tokS2, input(app1X.ID, daysAgo(40), "ABSENCE")), http.StatusForbidden)
		expect(t, call("POST", "/student/reports", tokS3, input(app3X.ID, daysAgo(40), "ABSENCE")), http.StatusBadRequest)
		expect(t, call("POST", "/student/reports", tokS3, input(app1Y.ID, daysAgo(40), "ABSENCE")), http.StatusBadRequest)

		// Fewer than 6 accepted Lab Boys (S1, S3 + 3 more = 5): students may
		// not report each other.
		for _, n := range []string{"Peer4", "Peer5", "Peer6"} {
			accept(n)
		}
		elig := expect(t, call("GET", fmt.Sprintf("/student/courses/%d/report-eligibility", courseX.ID), tokS3, nil), http.StatusOK)
		if elig.body["allowed"] != false || elig.body["accepted_count"] != float64(5) {
			t.Fatalf("eligibility with 5 = %s", elig.raw)
		}
		expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(40), "ABSENCE")), http.StatusForbidden)
		accept("Peer7") // 6 — allowed from here on
		elig = expect(t, call("GET", fmt.Sprintf("/student/courses/%d/report-eligibility", courseX.ID), tokS3, nil), http.StatusOK)
		if elig.body["allowed"] != true {
			t.Fatalf("eligibility with 6 = %s", elig.raw)
		}

		got := expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(40), "ABSENCE")), http.StatusCreated)
		rejectID := uint(got.body["id"].(float64))
		// One report per day, answered as such (not a server error).
		expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(43), "ABSENCE")), http.StatusTooManyRequests)
		if got.body["status"] != "SUBMITTED" || got.body["reporter_role"] != "student" {
			t.Fatalf("unexpected body %s", got.raw)
		}
		if flags() != before {
			t.Fatal("a waiting student report must not flag the student")
		}
		if notes(instA.ID, "มีรายงาน Lab Boy จากนักศึกษา รอการตรวจสอบ") == 0 {
			t.Fatal("course instructor was not notified")
		}

		// The waiting report survives a restart (startup migrations).
		if err := database.Connect(cfg); err != nil {
			t.Fatal(err)
		}
		if s := status(t, rejectID); s != models.ReportSubmitted {
			t.Fatalf("startup migration changed a waiting student report to %s", s)
		}

		// Who can see it: the sender, the course instructor, admin.
		expect(t, call("GET", fmt.Sprintf("/reports/%d", rejectID), tokS1, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", rejectID), tokB, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", rejectID), tokS3, nil), http.StatusOK)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", rejectID), tokAdmin, nil), http.StatusOK)
		det := expect(t, call("GET", fmt.Sprintf("/reports/%d", rejectID), tokA, nil), http.StatusOK)
		if !strings.Contains(string(det.raw), `"allowed_actions":["confirm","not_substantiated"]`) {
			t.Fatalf("course instructor actions: %s", det.raw)
		}
		review := expect(t, call("GET", "/instructor/reports/review?status=SUBMITTED", tokA, nil), http.StatusOK)
		var q ReportPageT
		_ = json.Unmarshal(review.raw, &q)
		if q.Total != 1 || q.Data[0].ID != rejectID || q.Data[0].ReporterName == "" {
			t.Fatalf("review queue = %s", review.raw)
		}
		if gotB := expect(t, call("GET", "/instructor/reports/review", tokB, nil), http.StatusOK); !strings.Contains(string(gotB.raw), `"total":0`) {
			t.Fatalf("B review queue = %s", gotB.raw)
		}

		// Only the course instructor decides; rejecting needs a reason.
		expect(t, act(rejectID, tokS3, "confirm", ""), http.StatusForbidden)
		expect(t, act(rejectID, tokB, "confirm", ""), http.StatusNotFound)
		expect(t, act(rejectID, tokAdmin, "confirm", ""), http.StatusForbidden)
		expect(t, act(rejectID, tokA, "not_substantiated", ""), http.StatusConflict)
		expect(t, act(rejectID, tokA, "not_substantiated", "ไม่พบหลักฐาน"), http.StatusOK)
		expect(t, act(rejectID, tokA, "confirm", ""), http.StatusConflict) // decision is final
		if flags() != before {
			t.Fatal("a rejected report must not flag the student")
		}

		nextDay()
		got = expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(41), "DUTY_NEGLECT")), http.StatusCreated)
		confirmID := uint(got.body["id"].(float64))
		expect(t, act(confirmID, tokA, "confirm", ""), http.StatusOK)
		if flags() != before+1 {
			t.Fatal("a confirmed student report must flag the student")
		}
		expect(t, act(confirmID, tokS3, "withdraw", "x"), http.StatusConflict)

		// The reported student appeals; the instructor who confirmed decides.
		// The student who sent the report never sees the appeal or its files.
		pdf := []byte("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%" + "EOF")
		expect(t, call("POST", fmt.Sprintf("/student/reports/about-me/%d/appeal", confirmID), tokS1,
			newMultipart(t, map[string]string{"message": "secret-appeal-text"}, map[string][]byte{"medical.pdf": pdf})), http.StatusCreated)
		if q := expect(t, call("GET", "/instructor/reports/appeals", tokA, nil), http.StatusOK); !strings.Contains(string(q.raw), fmt.Sprintf(`"id":%d,`, confirmID)) {
			t.Fatalf("student-filed appeal missing from the confirmer's queue: %s", q.raw)
		}
		if d := expect(t, call("GET", fmt.Sprintf("/reports/%d", confirmID), tokA, nil), http.StatusOK); !strings.Contains(string(d.raw), "secret-appeal-text") {
			t.Fatalf("confirmer must read the appeal: %s", d.raw)
		}
		expect(t, act(confirmID, tokA, "appeal_uphold", "secret-ruling-reason"), http.StatusOK)
		sender := expect(t, call("GET", fmt.Sprintf("/reports/%d", confirmID), tokS3, nil), http.StatusOK)
		for _, leak := range []string{"secret-appeal-text", "medical.pdf", "secret-ruling-reason"} {
			if strings.Contains(string(sender.raw), leak) {
				t.Fatalf("the student who sent the report sees %q: %s", leak, sender.raw)
			}
		}
		var appealFile models.LabBoyReportEvidence
		database.DB.Where("report_id = ? AND response_id IS NOT NULL", confirmID).First(&appealFile)
		expect(t, call("GET", fmt.Sprintf("/reports/%d/evidence/%d", confirmID, appealFile.ID), tokS3, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d/evidence/%d", confirmID, appealFile.ID), tokA, nil), http.StatusOK)
		reviews, _ := database.ReportReviews(confirmID)
		if len(reviews) != 2 || reviews[1].Decision != models.DecisionDeclineReconsideration || reviews[0].Decision != models.DecisionConfirm || reviews[0].ReviewerID != instA.ID {
			t.Fatalf("reviews = %+v", reviews)
		}

		// The sender is told the result; the reported student gets only the
		// record notice once it took effect, never the sender's result.
		if n := notes(stu3.ID, "ผลการตรวจสอบรายงานที่คุณส่ง"); n != 2 {
			t.Fatalf("sender got %d result notifications, want 2", n)
		}
		if n := notes(stu1.ID, "ผลการตรวจสอบรายงานที่คุณส่ง"); n != 0 {
			t.Fatal("reported student must not be notified")
		}

		// The sender may withdraw while it still waits.
		nextDay()
		got = expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(42), "OTHER")), http.StatusCreated)
		wID := uint(got.body["id"].(float64))
		expect(t, act(wID, tokS3, "withdraw", ""), http.StatusConflict)
		expect(t, act(wID, tokS3, "withdraw", "ส่งผิดคน"), http.StatusOK)

		mine := expect(t, call("GET", "/student/reports", tokS3, nil), http.StatusOK)
		var p ReportPageT
		_ = json.Unmarshal(mine.raw, &p)
		if p.Total != 3 {
			t.Fatalf("sender's list total = %d, want 3", p.Total)
		}
		if other := expect(t, call("GET", "/student/reports", tokS1, nil), http.StatusOK); !strings.Contains(string(other.raw), `"total":0`) {
			t.Fatalf("reported student's list = %s", other.raw)
		}
	})

	t.Run("the reported student appeals once; whoever confirmed decides", func(t *testing.T) {
		notes := func(u uint, title string) int64 {
			var n int64
			database.DB.Model(&models.Notification{}).Where("user_id = ? AND title = ?", u, title).Count(&n)
			return n
		}
		record := func(id uint) map[string]any {
			got := expect(t, call("GET", "/student/reports/about-me", tokS1, nil), http.StatusOK)
			if strings.Contains(string(got.raw), instA.FullName) || strings.Contains(string(got.raw), "reporter") {
				t.Fatalf("redacted records leak the reporter: %s", got.raw)
			}
			var recs []map[string]any
			_ = json.Unmarshal(got.raw, &recs)
			for _, r := range recs {
				if uint(r["report_id"].(float64)) == id {
					return r
				}
			}
			t.Fatalf("report %d not in about-me: %s", id, got.raw)
			return nil
		}
		appeal := func(id uint, tok string, files map[string][]byte) resp {
			return call("POST", fmt.Sprintf("/student/reports/about-me/%d/appeal", id), tok,
				newMultipart(t, map[string]string{"message": "วันนั้นลาป่วยและแจ้งอาจารย์แล้ว"}, files))
		}
		submitted := func(date, cat string) uint {
			got := expect(t, call("POST", "/instructor/reports", tokA, input(app1X.ID, date, cat)), http.StatusCreated)
			id := uint(got.body["id"].(float64))
			expect(t, act(id, tokA, "submit", ""), http.StatusOK)
			return id
		}
		flags := func() int {
			n, _ := database.ConfirmedRecordCounts([]uint{stu1.ID}, courseX.AcademicYear)
			return n[stu1.ID]
		}

		upheld := submitted(daysAgo(50), "LATE_NOTICE")
		if r := record(upheld); r["can_appeal"] != true || r["appeal"] != nil {
			t.Fatalf("fresh record = %v", r)
		}
		// Only the reported student, and only through this endpoint.
		expect(t, appeal(upheld, tokS2, nil), http.StatusNotFound)
		expect(t, appeal(upheld, tokB, nil), http.StatusForbidden)
		expect(t, call("POST", fmt.Sprintf("/student/reports/about-me/%d/appeal", upheld), tokS1,
			newMultipart(t, map[string]string{"message": "  "}, nil)), http.StatusBadRequest)
		pdf := []byte("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%" + "EOF")
		expect(t, appeal(upheld, tokS1, map[string][]byte{"proof.pdf": pdf}), http.StatusCreated)
		expect(t, appeal(upheld, tokS1, nil), http.StatusConflict) // once only
		if notes(instA.ID, "มีคำอุทธรณ์บันทึกการปฏิบัติงาน รอการพิจารณา") == 0 {
			t.Fatal("the confirmer was not told about the appeal")
		}
		recs, _ := database.ConfirmedRecordsForStudent(stu1.ID, courseX.AcademicYear)
		pending := false
		for _, rec := range recs {
			pending = pending || (rec.ReportID == upheld && rec.AppealPending)
		}
		if !pending {
			t.Fatal("other instructors should see the appeal is pending")
		}

		// The confirmer's queue has it; nobody else decides.
		q := expect(t, call("GET", "/instructor/reports/appeals", tokA, nil), http.StatusOK)
		if !strings.Contains(string(q.raw), fmt.Sprintf(`"id":%d,`, upheld)) {
			t.Fatalf("appeal queue = %s", q.raw)
		}
		if qb := expect(t, call("GET", "/instructor/reports/appeals", tokB, nil), http.StatusOK); !strings.Contains(string(qb.raw), `"total":0`) {
			t.Fatalf("B appeal queue = %s", qb.raw)
		}
		expect(t, act(upheld, tokB, "appeal_uphold", "x"), http.StatusNotFound)
		expect(t, act(upheld, tokAdmin, "appeal_uphold", "x"), http.StatusForbidden)
		det := expect(t, call("GET", fmt.Sprintf("/reports/%d", upheld), tokA, nil), http.StatusOK)
		if !strings.Contains(string(det.raw), `"appeal_uphold","appeal_overturn"`) || !strings.Contains(string(det.raw), "proof.pdf") {
			t.Fatalf("confirmer detail = %s", det.raw)
		}
		expect(t, act(upheld, tokA, "appeal_uphold", ""), http.StatusConflict)
		expect(t, act(upheld, tokA, "appeal_uphold", "ตรวจสอบแล้ว ไม่พบการแจ้งลา"), http.StatusOK)
		expect(t, act(upheld, tokA, "appeal_overturn", "x"), http.StatusConflict) // final
		expect(t, appeal(upheld, tokS1, nil), http.StatusConflict)                // still once only
		if r := record(upheld); r["can_appeal"] != false || r["appeal"].(map[string]any)["outcome"] != "upheld" {
			t.Fatalf("upheld record = %v", r)
		}

		// Overturning takes the flag away.
		overturned := submitted(daysAgo(51), "OTHER")
		before := flags()
		expect(t, appeal(overturned, tokS1, nil), http.StatusCreated)
		expect(t, act(overturned, tokA, "appeal_overturn", "มีใบรับรองแพทย์"), http.StatusOK)
		if s := status(t, overturned); s != models.ReportNotSubstantiated {
			t.Fatalf("overturned status = %s", s)
		}
		if flags() != before-1 {
			t.Fatal("an overturned record must no longer flag the student")
		}
		if r := record(overturned); r["status"] != "NOT_SUBSTANTIATED" || r["appeal"].(map[string]any)["outcome"] != "overturned" {
			t.Fatalf("overturned record = %v", r)
		}
		if n := notes(stu1.ID, "ผลการพิจารณาอุทธรณ์"); n != 3 { // + the student-filed one above
			t.Fatalf("student got %d appeal results, want 3", n)
		}

		// After the window the appeal is refused.
		late := submitted(daysAgo(52), "ABSENCE")
		database.DB.Model(&models.LabBoyReport{}).Where("id = ?", late).UpdateColumn("appeal_deadline", time.Now().Add(-time.Minute))
		if r := record(late); r["can_appeal"] != false {
			t.Fatalf("late record = %v", r)
		}
		expect(t, appeal(late, tokS1, nil), http.StatusConflict)

		// Records confirmed before appeals existed get a window from now,
		// and the student is told once.
		legacy := submitted(daysAgo(53), "DUTY_NEGLECT")
		database.DB.Model(&models.LabBoyReport{}).Where("id = ?", legacy).UpdateColumn("appeal_deadline", nil)
		noticesBefore := notes(stu1.ID, "คุณได้รับบันทึกการปฏิบัติงาน")
		if err := database.Connect(cfg); err != nil {
			t.Fatal(err)
		}
		if r := record(legacy); r["can_appeal"] != true {
			t.Fatalf("legacy record = %v", r)
		}
		if notes(stu1.ID, "คุณได้รับบันทึกการปฏิบัติงาน") != noticesBefore+1 {
			t.Fatal("the student should be told about the legacy record once")
		}
		if err := database.Connect(cfg); err != nil {
			t.Fatal(err)
		}
		if notes(stu1.ID, "คุณได้รับบันทึกการปฏิบัติงาน") != noticesBefore+1 {
			t.Fatal("a restart must not notify again")
		}
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
