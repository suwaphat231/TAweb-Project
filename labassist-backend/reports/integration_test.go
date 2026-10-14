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
	stu3, tokS3 := mkUser("Student3", models.RoleStudent)
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
	app3X := mkApp(stu3, courseX, true)  // S3 is S1's fellow Lab Boy in X
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

	t.Run("3 student cannot use the instructor endpoints, staff have no queue", func(t *testing.T) {
		expect(t, call("POST", "/instructor/reports", tokS1, input(app1X.ID, today, "OTHER")), http.StatusForbidden)
		expect(t, call("GET", "/staff/reports", tokStaff, nil), http.StatusNotFound)
	})

	t.Run("draft is private to the reporter", func(t *testing.T) {
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokS1, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokStaff, nil), http.StatusNotFound)
		expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokA, nil), http.StatusOK)
	})

	t.Run("8 cannot skip the workflow", func(t *testing.T) {
		expect(t, act(reportID, tokStaff, "blacklist", ""), http.StatusNotFound)
		// An instructor's own report is not sent anywhere: blacklist, not submit.
		expect(t, act(reportID, tokA, "submit", ""), http.StatusForbidden)
		expect(t, act(reportID, tokA, "confirm", "ok"), http.StatusConflict)
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

	t.Run("instructor blacklists directly, the student is told", func(t *testing.T) {
		blacklist := func(until string) resp {
			return call("POST", fmt.Sprintf("/reports/%d/actions", reportID), tokA, map[string]any{"action": "blacklist", "blacklist_until": until})
		}
		expect(t, blacklist(daysAgo(1)), http.StatusBadRequest)
		expect(t, blacklist(time.Now().AddDate(3, 0, 0).Format("2006-01-02")), http.StatusBadRequest)
		got := expect(t, blacklist(""), http.StatusOK)
		if got.body["status"] != "CONFIRMED" || got.body["submitted_at"] == nil || got.body["blacklisted_at"] == nil ||
			got.body["penalty_status"] != "blacklisted" {
			t.Fatalf("body = %s", got.raw)
		}
		if until, _ := time.Parse(time.RFC3339, fmt.Sprint(got.body["blacklist_until"])); until.Before(time.Now().AddDate(0, 0, 178)) {
			t.Fatalf("default end date = %v", got.body["blacklist_until"])
		}
		var n int64
		database.DB.Model(&models.Notification{}).Where("user_id = ?", stu1.ID).Count(&n)
		if n == 0 {
			t.Fatal("student was not notified")
		}
		reviews, _ := database.ReportReviews(reportID)
		if len(reviews) != 1 || reviews[0].Decision != models.DecisionConfirm || reviews[0].Reason == "" {
			t.Fatalf("reviews = %+v", reviews)
		}
		expect(t, call("PUT", fmt.Sprintf("/instructor/reports/%d", reportID), tokA, input(app1X.ID, daysAgo(3), "ABSENCE")), http.StatusConflict)
		expect(t, act(reportID, tokA, "blacklist", ""), http.StatusConflict)
	})

	t.Run("5+15 only involved users see the report and its evidence", func(t *testing.T) {
		detail := fmt.Sprintf("/reports/%d", reportID)
		file := fmt.Sprintf("/reports/%d/evidence/%d", reportID, evidenceID)
		expect(t, call("GET", detail, tokS1, nil), http.StatusOK)
		for name, tok := range map[string]string{"other student": tokS2, "other instructor": tokB, "staff": tokStaff} {
			if got := call("GET", detail, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s detail = %d", name, got.code)
			}
			if got := call("GET", file, tok, nil); got.code != http.StatusNotFound {
				t.Errorf("%s evidence = %d", name, got.code)
			}
		}
		got := expect(t, call("GET", file, tokS1, nil), http.StatusOK)
		if !bytes.Equal(got.raw, pngBytes) {
			t.Fatal("evidence bytes differ")
		}
		// The evidence ID only works together with its own report.
		expect(t, call("GET", fmt.Sprintf("/reports/%d/evidence/%d", reportID+100000, evidenceID), tokA, nil), http.StatusNotFound)
		expect(t, call("GET", detail, "", nil), http.StatusUnauthorized)
	})

	t.Run("10 blacklist shows as reported-before to the other course's instructor, and logged", func(t *testing.T) {
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		var recs []models.ConfirmedRecord
		_ = json.Unmarshal(got.raw, &recs)
		if len(recs) != 1 || recs[0].ReviewReason == "" || recs[0].CourseCode != courseX.Code {
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

	appealURL := func(id uint) string { return fmt.Sprintf("/reports/%d/appeals", id) }
	fileAppeal := func(id uint, tok, reason string, files map[string][]byte) resp {
		return call("POST", appealURL(id), tok, newMultipart(t, map[string]string{"reason": reason, "details": "รายละเอียด"}, files))
	}
	decide := func(appealID uint, tok, decision, note string) resp {
		return call("POST", fmt.Sprintf("/appeals/%d/decision", appealID), tok, map[string]any{"decision": decision, "note": note})
	}
	appealStatus := func(t *testing.T, id uint) models.PenaltyStatus {
		t.Helper()
		a, ok := database.AppealByID(id)
		if !ok {
			t.Fatalf("appeal %d missing", id)
		}
		return a.Status
	}
	var appealID uint

	t.Run("appeal: only the blacklisted student files it, once, and it shows as pending", func(t *testing.T) {
		expect(t, fileAppeal(reportID, tokS2, "x", nil), http.StatusNotFound)
		expect(t, fileAppeal(reportID, tokStaff, "x", nil), http.StatusNotFound)
		expect(t, fileAppeal(reportID, tokA, "x", nil), http.StatusForbidden)
		expect(t, fileAppeal(reportID, tokS1, "  ", nil), http.StatusBadRequest)
		expect(t, fileAppeal(reportID, tokS1, "x", map[string][]byte{"fake.png": []byte("text")}), http.StatusBadRequest)
		got := expect(t, fileAppeal(reportID, tokS1, "วันนั้นป่วย", map[string][]byte{"medical.png": pngBytes}), http.StatusCreated)
		appealID = uint(got.body["id"].(float64))
		if got.body["status"] != "appeal_pending" {
			t.Fatalf("body = %s", got.raw)
		}
		expect(t, fileAppeal(reportID, tokS1, "ยื่นซ้ำ", nil), http.StatusConflict)

		var d struct {
			Report    models.LabBoyReport `json:"report"`
			CanAppeal bool                `json:"can_appeal"`
			Appeals   []struct {
				Appeal     models.BlacklistAppeal        `json:"appeal"`
				Events     []models.BlacklistAppealEvent `json:"events"`
				CanAddInfo bool                          `json:"can_add_info"`
			} `json:"appeals"`
		}
		_ = json.Unmarshal(expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokS1, nil), http.StatusOK).raw, &d)
		if d.Report.PenaltyStatus != models.PenaltyAppealPending || d.CanAppeal || len(d.Appeals) != 1 || d.Appeals[0].CanAddInfo {
			t.Fatalf("student detail = %+v", d)
		}
		var n int64
		database.DB.Model(&models.Notification{}).Where("user_id = ? AND title = ?", instA.ID, "มีคำอุทธรณ์ Blacklist รอพิจารณา").Count(&n)
		if n != 1 {
			t.Fatalf("instructor appeal notifications = %d", n)
		}
		list := expect(t, call("GET", "/instructor/appeals?status=appeal_pending", tokA, nil), http.StatusOK)
		if !strings.Contains(string(list.raw), `"total":1`) || !strings.Contains(string(list.raw), `"blacklist_count":1`) {
			t.Fatalf("A appeals = %s", list.raw)
		}
		if b := expect(t, call("GET", "/instructor/appeals", tokB, nil), http.StatusOK); !strings.Contains(string(b.raw), `"total":0`) {
			t.Fatalf("B appeals = %s", b.raw)
		}
		expect(t, call("GET", "/instructor/appeals", tokS1, nil), http.StatusForbidden)
	})

	t.Run("appeal: only the course instructor decides, always with a note", func(t *testing.T) {
		expect(t, act(reportID, tokA, "reopen", "x"), http.StatusConflict) // the appeal decides instead
		expect(t, decide(appealID, tokStaff, "approve", "x"), http.StatusNotFound)
		expect(t, decide(appealID, tokB, "approve", "x"), http.StatusNotFound)
		expect(t, decide(appealID, tokS1, "approve", "x"), http.StatusForbidden)
		expect(t, decide(appealID, tokA, "approve", ""), http.StatusConflict)
		expect(t, decide(appealID, tokA, "maybe", "x"), http.StatusConflict)

		expect(t, decide(appealID, tokA, "request_info", "ขอใบรับรองแพทย์ฉบับเต็ม"), http.StatusOK)
		if s := appealStatus(t, appealID); s != models.PenaltyAppealMoreInfo {
			t.Fatalf("status = %s", s)
		}
		info := func(tok string) resp {
			return call("POST", fmt.Sprintf("/appeals/%d/info", appealID), tok, newMultipart(t, map[string]string{"message": "แนบฉบับเต็มแล้ว"}, map[string][]byte{"full.png": pngBytes}))
		}
		expect(t, info(tokS2), http.StatusNotFound)
		expect(t, info(tokS1), http.StatusOK)
		expect(t, info(tokS1), http.StatusConflict) // back to pending: nothing to edit
		if s := appealStatus(t, appealID); s != models.PenaltyAppealPending {
			t.Fatalf("status = %s", s)
		}
		expect(t, decide(appealID, tokA, "approve", "เอกสารยืนยันว่าป่วยจริง"), http.StatusOK)
		expect(t, decide(appealID, tokA, "reject", "เปลี่ยนใจ"), http.StatusConflict)

		a, _ := database.AppealByID(appealID)
		if a.DecidedByID == nil || *a.DecidedByID != instA.ID || a.DecidedAt == nil || a.DecisionNote != "เอกสารยืนยันว่าป่วยจริง" {
			t.Fatalf("decision fields = %+v", a)
		}
		events, _ := database.AppealEvents(appealID)
		var kinds []string
		for _, e := range events {
			if e.Note == "" || e.ActorID == 0 || e.CreatedAt.IsZero() {
				t.Fatalf("event without note/actor/time: %+v", e)
			}
			kinds = append(kinds, string(e.Kind))
		}
		if strings.Join(kinds, " ") != "SUBMIT REQUEST_INFO STUDENT_INFO APPROVE" {
			t.Fatalf("events = %v", kinds)
		}
		var audits int64
		database.DB.Model(&models.StaffAuditLog{}).Where("entity_type = ? AND entity_id = ?", "blacklist_appeal", appealID).Count(&audits)
		if audits != 4 {
			t.Fatalf("appeal audit rows = %d", audits)
		}
		var n int64
		database.DB.Model(&models.Notification{}).Where("user_id = ? AND title IN ?", stu1.ID,
			[]string{"อาจารย์ขอข้อมูลอุทธรณ์เพิ่มเติม", "อุทธรณ์ได้รับการอนุมัติ"}).Count(&n)
		if n != 2 {
			t.Fatalf("student appeal notifications = %d", n)
		}
	})

	t.Run("approved appeal lifts the blacklist but keeps every record", func(t *testing.T) {
		if s := status(t, reportID); s != models.ReportNotSubstantiated {
			t.Fatalf("report status = %s", s)
		}
		got := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("lifted blacklist still shown: %s", got.raw)
		}
		d := expect(t, call("GET", fmt.Sprintf("/reports/%d", reportID), tokA, nil), http.StatusOK)
		var detail struct {
			Report   models.LabBoyReport                `json:"report"`
			History  []models.LabBoyReportStatusHistory `json:"history"`
			Reviews  []models.LabBoyReportReview        `json:"reviews"`
			Evidence []models.LabBoyReportEvidence      `json:"evidence"`
		}
		_ = json.Unmarshal(d.raw, &detail)
		var path []string
		for _, h := range detail.History {
			path = append(path, string(h.ToStatus))
		}
		if strings.Join(path, " ") != "DRAFT CONFIRMED NOT_SUBSTANTIATED" {
			t.Fatalf("timeline = %v", path)
		}
		if len(detail.Reviews) != 2 || len(detail.Evidence) != 3 || detail.Report.PenaltyStatus != models.PenaltyAppealApproved ||
			detail.Report.BlacklistedAt == nil {
			t.Fatalf("reviews=%d evidence=%d penalty=%s", len(detail.Reviews), len(detail.Evidence), detail.Report.PenaltyStatus)
		}
		// The approved appeal is final for this blacklisting.
		expect(t, fileAppeal(reportID, tokS1, "อีกครั้ง", nil), http.StatusConflict)
	})

	t.Run("a fellow Lab Boy reports, the instructor decides, the reporter stays hidden", func(t *testing.T) {
		peers := expect(t, call("GET", "/student/reports/peers", tokS3, nil), http.StatusOK)
		if !strings.Contains(string(peers.raw), fmt.Sprintf(`"application_id":%d`, app1X.ID)) ||
			strings.Contains(string(peers.raw), fmt.Sprintf(`"application_id":%d,`, app3X.ID)) {
			t.Fatalf("peers = %s", peers.raw)
		}
		if got := expect(t, call("GET", "/student/reports/peers", tokS2, nil), http.StatusOK); string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("non-Lab Boy peers = %s", got.raw)
		}
		var courses []database.ReportCourse
		_ = json.Unmarshal(expect(t, call("GET", "/student/reports/courses", tokS3, nil), http.StatusOK).raw, &courses)
		if len(courses) != 1 || courses[0].CourseCode != courseX.Code || len(courses[0].Peers) != 1 ||
			courses[0].Peers[0].ApplicationID != app1X.ID || len(courses[0].MySections) != 1 {
			t.Fatalf("courses = %+v", courses)
		}
		if got := expect(t, call("GET", "/student/reports/courses", tokS2, nil), http.StatusOK); string(bytes.TrimSpace(got.raw)) != "[]" {
			t.Fatalf("non-Lab Boy courses = %s", got.raw)
		}
		expect(t, call("POST", "/student/reports", tokS3, input(app3X.ID, daysAgo(4), "ABSENCE")), http.StatusBadRequest) // self
		expect(t, call("POST", "/student/reports", tokS3, input(app2X.ID, daysAgo(4), "ABSENCE")), http.StatusBadRequest) // not a Lab Boy
		expect(t, call("POST", "/student/reports", tokS2, input(app1X.ID, daysAgo(4), "ABSENCE")), http.StatusForbidden)  // reporter not a Lab Boy

		got := expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(4), "ABSENCE")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		if got.body["reporter_role"] != "student" {
			t.Fatalf("body = %s", got.raw)
		}
		expect(t, call("GET", fmt.Sprintf("/reports/%d", id), tokA, nil), http.StatusNotFound) // still a draft
		expect(t, act(id, tokS3, "blacklist", ""), http.StatusForbidden)
		expect(t, act(id, tokS3, "submit", ""), http.StatusOK)
		var n int64
		database.DB.Model(&models.Notification{}).Where("user_id = ? AND title = ?", instA.ID, "มีรายงาน Lab Boy รอพิจารณา").Count(&n)
		if n != 1 {
			t.Fatalf("instructor notifications = %d", n)
		}

		detail := fmt.Sprintf("/reports/%d", id)
		inbox := expect(t, call("GET", "/instructor/reports?from=students", tokA, nil), http.StatusOK)
		if !strings.Contains(string(inbox.raw), `"total":1`) {
			t.Fatalf("inbox = %s", inbox.raw)
		}
		if a := expect(t, call("GET", detail, tokA, nil), http.StatusOK); !strings.Contains(string(a.raw), stu3.FullName) {
			t.Fatal("instructor should see who reported")
		}
		expect(t, call("GET", detail, tokB, nil), http.StatusNotFound)
		expect(t, call("GET", detail, tokStaff, nil), http.StatusNotFound)

		expect(t, call("POST", fmt.Sprintf("/reports/%d/responses", id), tokS1, newMultipart(t, map[string]string{"message": "วันนั้นแจ้งอาจารย์แล้ว"}, nil)), http.StatusCreated)
		s1 := expect(t, call("GET", detail, tokS1, nil), http.StatusOK)
		if strings.Contains(string(s1.raw), stu3.FullName) || strings.Contains(string(s1.raw), fmt.Sprintf(`"reporter_id":%d`, stu3.ID)) {
			t.Fatalf("reported student learned who reported: %s", s1.raw)
		}
		mine := expect(t, call("GET", "/student/reports", tokS1, nil), http.StatusOK)
		if strings.Contains(string(mine.raw), stu3.FullName) {
			t.Fatal("student list leaked the reporter")
		}
		s3 := expect(t, call("GET", detail, tokS3, nil), http.StatusOK)
		if strings.Contains(string(s3.raw), "วันนั้นแจ้งอาจารย์แล้ว") {
			t.Fatal("student reporter must not read the reported student's explanation")
		}

		expect(t, act(id, tokS3, "confirm", "x"), http.StatusForbidden)
		expect(t, act(id, tokA, "confirm", "ตรวจสอบแล้วขาดงานจริง"), http.StatusOK)
		recs := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if !strings.Contains(string(recs.raw), `"report_id":`+fmt.Sprint(id)) || strings.Contains(string(recs.raw), stu3.FullName) {
			t.Fatalf("records = %s", recs.raw)
		}
		filed := expect(t, call("GET", "/student/reports/filed", tokS3, nil), http.StatusOK)
		if !strings.Contains(string(filed.raw), `"total":1`) {
			t.Fatalf("filed = %s", filed.raw)
		}
	})

	t.Run("rejected appeal keeps the blacklist; the fellow student never sees the appeal", func(t *testing.T) {
		var peerReportID uint
		database.DB.Model(&models.LabBoyReport{}).Select("id").Where("reporter_id = ? AND status = ?", stu3.ID, models.ReportConfirmed).Scan(&peerReportID)
		got := expect(t, fileAppeal(peerReportID, tokS1, "ไม่ได้ขาดงาน", nil), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, fileAppeal(peerReportID, tokS3, "x", nil), http.StatusForbidden)
		if s3 := expect(t, call("GET", fmt.Sprintf("/reports/%d", peerReportID), tokS3, nil), http.StatusOK); strings.Contains(string(s3.raw), "ไม่ได้ขาดงาน") {
			t.Fatal("student reporter read the appeal")
		}
		expect(t, call("POST", fmt.Sprintf("/appeals/%d/decision", id), tokS3, map[string]any{"decision": "approve", "note": "x"}), http.StatusNotFound)
		expect(t, decide(id, tokA, "reject", "บันทึกเวลาแสดงว่าขาดงานจริง"), http.StatusOK)
		if s := appealStatus(t, id); s != models.PenaltyAppealRejected {
			t.Fatalf("status = %s", s)
		}
		if s := status(t, peerReportID); s != models.ReportConfirmed {
			t.Fatalf("rejected appeal changed the report: %s", s)
		}
		expect(t, fileAppeal(peerReportID, tokS1, "ขออีกครั้ง", nil), http.StatusConflict)
		recs := expect(t, call("GET", fmt.Sprintf("/instructor/applications/%d/performance-records", app1Y.ID), tokB, nil), http.StatusOK)
		if !strings.Contains(string(recs.raw), fmt.Sprintf(`"report_id":%d`, peerReportID)) {
			t.Fatalf("records = %s", recs.raw)
		}
	})

	t.Run("11 withdrawing keeps the history and needs a reason", func(t *testing.T) {
		got := expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, act(id, tokS3, "submit", ""), http.StatusOK)
		expect(t, act(id, tokS3, "withdraw", ""), http.StatusConflict)
		expect(t, act(id, tokB, "withdraw", "x"), http.StatusNotFound)
		expect(t, act(id, tokA, "withdraw", "x"), http.StatusForbidden)
		expect(t, act(id, tokS3, "withdraw", "รายงานผิดคน"), http.StatusOK)
		hist, _ := database.ReportStatusHistory(id)
		if len(hist) != 3 || hist[2].ToStatus != models.ReportWithdrawn || hist[2].Reason != "รายงานผิดคน" {
			t.Fatalf("history = %+v", hist)
		}
		// The same incident can be filed again once the earlier one is withdrawn.
		expect(t, call("POST", "/student/reports", tokS3, input(app1X.ID, daysAgo(5), "LATE_NOTICE")), http.StatusCreated)
	})

	t.Run("7 admin may blacklist directly; appeals close after 15 days; ended blacklists stop showing", func(t *testing.T) {
		got := expect(t, call("POST", "/instructor/reports", tokAdmin, input(app1X.ID, daysAgo(6), "DUTY_NEGLECT")), http.StatusCreated)
		id := uint(got.body["id"].(float64))
		expect(t, act(id, tokAdmin, "submit", ""), http.StatusForbidden)
		expect(t, act(id, tokAdmin, "blacklist", ""), http.StatusOK)

		count := func() string {
			apps := expect(t, call("GET", fmt.Sprintf("/instructor/courses/%d/applicants", courseY.ID), tokB, nil), http.StatusOK)
			return string(apps.raw)
		}
		if !strings.Contains(count(), `"confirmed_record_count":2`) {
			t.Fatalf("applicants = %s", count())
		}
		database.DB.Model(&models.LabBoyReport{}).Where("id = ?", id).Update("blacklisted_at", time.Now().AddDate(0, 0, -16))
		expect(t, fileAppeal(id, tokS1, "ช้าไป", nil), http.StatusConflict)
		database.DB.Model(&models.LabBoyReport{}).Where("id = ?", id).Update("blacklist_until", daysAgo(1))
		if !strings.Contains(count(), `"confirmed_record_count":1`) {
			t.Fatalf("ended blacklist still counted: %s", count())
		}
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
		// A sees their own 4 reports plus, from course X, S3's blacklisted
		// and withdrawn reports and the admin's blacklist — not S3's draft.
		all := list("limit=100")
		if all.Total != 7 || len(all.Data) != 7 {
			t.Fatalf("A has %d reports (%d rows), want 7", all.Total, len(all.Data))
		}
		p1, p2 := list("limit=4&page=1"), list("limit=4&page=2")
		if p1.Total != 7 || len(p1.Data) != 4 || len(p2.Data) != 3 || p1.Data[0].ID == p2.Data[0].ID {
			t.Fatalf("pages: %d/%d/%d", p1.Total, len(p1.Data), len(p2.Data))
		}
		if p := list("category=OTHER"); p.Total != 2 {
			t.Fatalf("category filter total = %d", p.Total)
		}
		if p := list("status=DRAFT"); p.Total != 3 {
			t.Fatalf("status filter total = %d", p.Total)
		}
		if p := list("status=DRAFT,NOT_SUBSTANTIATED"); p.Total != 4 {
			t.Fatalf("multi status total = %d", p.Total)
		}
		if p := list("from=students"); p.Total != 2 {
			t.Fatalf("from students total = %d", p.Total)
		}
		if p := list("date_from=" + daysAgo(21) + "&date_to=" + daysAgo(20)); p.Total != 2 {
			t.Fatalf("date filter total = %d", p.Total)
		}
		if p := list("q=Student1"); p.Total != 7 {
			t.Fatalf("search total = %d", p.Total)
		}
		if p := list("q=nobody-matches-this"); p.Total != 0 {
			t.Fatalf("empty search total = %d", p.Total)
		}
		if p := list(fmt.Sprintf("course_id=%d", courseY.ID)); p.Total != 0 {
			t.Fatalf("course filter total = %d", p.Total)
		}
		// Other instructors see none of course X's reports; the student sees
		// only non-drafts, never naming a fellow student who reported.
		gotB := expect(t, call("GET", "/instructor/reports", tokB, nil), http.StatusOK)
		if !strings.Contains(string(gotB.raw), `"total":0`) {
			t.Fatalf("B list = %s", gotB.raw)
		}
		gotS := expect(t, call("GET", "/student/reports", tokS1, nil), http.StatusOK)
		var ps ReportPageT
		_ = json.Unmarshal(gotS.raw, &ps)
		for _, rep := range ps.Data {
			if rep.Status == models.ReportDraft || rep.StudentID != stu1.ID || (rep.FiledByStudent() && rep.ReporterID != 0) {
				t.Fatalf("student list leaked %+v", rep)
			}
		}
		if ps.Total != 4 {
			t.Fatalf("student sees %d reports, want 4", ps.Total)
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
