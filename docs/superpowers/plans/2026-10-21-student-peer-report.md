# Student Peer Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab Boys report other Lab Boys in the same course (anonymously); the course's instructor decides blacklist or not; the reported student sees only confirmed reports and may appeal once; staff only see who is blacklisted.

**Architecture:** Reuse the existing `reports` package and `labboy_*` tables. `ReporterID` now holds a student. The state machine shrinks to SUBMITTED → CONFIRMED / NOT_SUBSTANTIATED / WITHDRAWN plus one appeal. Who may decide is computed per request (instructor teaches the course) and passed into the pure `CheckAction` through `Actor`. The frontend replaces the instructor "file a report" flow with a student course → peers → report flow.

**Tech Stack:** Go 1.25 + Gin + GORM (MySQL), React + TypeScript + TanStack Query + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-student-peer-report-design.md`

## Global Constraints

- Blacklist = report with status `CONFIRMED`. A successful appeal moves it to `NOT_SUBSTANTIATED`, which no longer counts.
- Only students file reports. Instructor, staff and admin cannot create reports through UI or API.
- A report can be filed only when the posting is active and `lab_boy_schedule_confirmed = true`.
- Quota: 3 reports per reporter per course, counting every status including WITHDRAWN.
- No reporting in a posting with fewer than 3 accepted, non-cancelled Lab Boys (counting the reporter). The server re-checks on submit and the UI shows the reason.
- The reported student never learns who reported. That covers JSON fields, `reporter_id`, evidence file names, `uploaded_by`, `author_id`, history, notifications, quota numbers and fine-grained times.
- The reported student sees a report only once it is CONFIRMED (and afterwards the appeal outcome). There is no explanation step before the decision. Times shown to them are dates only.
- Appeal: one per report for its whole life (a permanent flag). The original decider rules on it. If that person no longer teaches the course, any current instructor of the course rules.
- The first decision can come from any current instructor of the course, or admin. Decisions work even after the posting is archived (check `course_instructors`, not the posting).
- No REOPEN. NOT_SUBSTANTIATED is final. Withdraw is allowed only while SUBMITTED.
- The reporter sees their own report, its status, the decision reason and the appeal outcome. They do not see the reported student's appeal text. Evidence can be attached only at submit time. `REPORTER_INFO` responses are removed.
- Staff get a read-only list of blacklisted students (name, student code, count) and cannot open report details.
- Instructors of other courses see a blacklist badge with a count on an applicant, not details.
- Notifications sent to the reported student never contain the reporter's name.
- Blacklist does not block applying.
- Copy is Thai. Reply to the owner in Thai.

## Plan decisions the owner should confirm

- The reported student does **not** see the reporter's evidence files, because a photo or file can reveal who took it. They see the category, incident date, description, impact and the decision reason.
- The staff blacklist page lists one row per student, sorted by count descending, then name.

## Review Focus

1. Two reports submitted at the same instant by a student with 2 used → exactly one succeeds (row lock on the reporter's application). Test in Task 2.
2. A reporter in section 1 tries to report a Lab Boy of section 2 of the same course code (a different posting) → 403. Test in Task 2.
3. A Lab Boy withdraws so the posting drops to 2 accepted → new reports are refused with the "fewer than 3" reason, and existing reports keep working. Test in Task 2.
4. The reported student opens `/reports/:id` while the report is SUBMITTED or WITHDRAWN → 404, the same answer as for a report that does not exist. Test in Task 1 (CanView) and Task 3 (HTTP).
5. The reported student's detail JSON contains no reporter id or name, no evidence, no `submitted_at`/`created_at`, and history with dates only. Test in Task 3 by asserting the raw JSON does not contain the reporter's name, `"reporter_id":<id>` or `"submitted_at"`.

---

### Task 1: State machine and visibility (pure)

**Files:**
- Modify: `labassist-backend/models/labboy_report.go` (add fields)
- Modify: `labassist-backend/reports/workflow.go`
- Modify: `labassist-backend/reports/anonymize.go`
- Test: `labassist-backend/reports/workflow_test.go` (rewrite)

**Interfaces:**
- Produces:
  - `models.LabBoyReport` fields `DecidedByID *uint` (`json:"decided_by_id,omitempty"`) and `AppealUsed bool` (`gorm:"not null;default:false" json:"appeal_used"`). AutoMigrate adds the columns (the model is already in `migrateApplicationData`).
  - `models.DecisionAcceptAppeal ReviewDecision = "ACCEPT_APPEAL"`. Add it to the `Decision` enum tag.
  - `reports.Actor{ID uint; Role string; TeachesCourse bool; DeciderTeaches bool}`. The handler fills the last two.
  - Actions: `ActionWithdraw`, `ActionConfirm`, `ActionNotSubstantiated`, `ActionAcceptAppeal Action = "accept_appeal"`, `ActionDeclineReconsideration`. Remove `Submit`, `StartReview`, `RequestInfo` and `Reopen` from `rules` and from `AllowedActions`.
  - `CheckAction(r, actor, action, reason) (models.ReportStatus, *Denial)` keeps its signature.
  - `CanView(r, actor) bool`, `ResponseKindFor(r, actor, reconsideration bool)` keep their signatures. `CanEditDraft` and `CanAddEvidence` are deleted.
  - `hidesReporter(r, actor) bool` and `anonymizeDetail(d *ReportDetail)`. The latter now also empties `Evidence`, zeroes `SubmittedAt`/`CreatedAt`/`UpdatedAt`, and truncates every history and review `CreatedAt` to midnight Asia/Bangkok.

Rules (`from → to`, by):
- withdraw: SUBMITTED → WITHDRAWN, reporter only (admin also allowed), reason required.
- confirm / not_substantiated: SUBMITTED, UNDER_REVIEW, AWAITING_RESPONSE (the last two are legacy rows) → CONFIRMED / NOT_SUBSTANTIATED. Decider = admin, or `TeachesCourse`. Reason required. Review decisions are `CONFIRM` / `NOT_SUBSTANTIATED`.
- accept_appeal: CONFIRMED with `ReconsiderationRequestedAt != nil` → NOT_SUBSTANTIATED. Review decision `ACCEPT_APPEAL`, clear recons.
- decline_reconsideration: unchanged rule. Who may rule on an appeal: admin, or `actor.ID == *r.DecidedByID && TeachesCourse`, or `TeachesCourse && !DeciderTeaches`.
- The reporter can never decide their own report. Students can never decide.

CanView:
- admin: true
- reporter: true
- `actor.TeachesCourse`: true unless DRAFT
- reported student: status CONFIRMED, or NOT_SUBSTANTIATED with `AppealUsed`
- everyone else, including staff: false

ResponseKindFor: only the reported student, only with `reconsideration=true`, only when CONFIRMED and `!AppealUsed` → `ResponseReconsideration`. Everything else is denied (`Forbidden` for non-owners).

- [ ] **Step 1: Rewrite `workflow_test.go`.** Actors: `reporter = Actor{ID: 10, Role: "student"}`, `reported = Actor{ID: 20, Role: "student"}`, `otherStu = {21, student}`, `teacher = {30, instructor, TeachesCourse: true, DeciderTeaches: true}`, `otherTeacher = {31, instructor}` (does not teach), `staffUser = {40, staff}`, `adminUser = {50, admin}`. Tests:
  - `TestStateMachine`: a table of allowed `(action, from) → (actor, to)` exactly as listed above. Every other action × the 7 statuses, by every actor, is denied.
  - `TestOnlyCourseTeacherDecides`: otherTeacher confirm → Forbidden; staffUser confirm → Forbidden; reporter confirm → Forbidden.
  - `TestAppealGoesToOriginalDecider`: report CONFIRMED, `DecidedByID=&30`, recons set. Actor `{32, instructor, TeachesCourse: true, DeciderTeaches: true}` → Forbidden. The same actor with `DeciderTeaches: false` → allowed. teacher (30) → allowed.
  - `TestCanView`: reported sees CONFIRMED only, plus NOT_SUBSTANTIATED+AppealUsed. Reported does not see SUBMITTED, WITHDRAWN, or NOT_SUBSTANTIATED without an appeal. staffUser sees nothing. otherStu sees nothing.
  - `TestAppealOnce`: CONFIRMED + `AppealUsed=false` → RECONSIDERATION. `AppealUsed=true` → denied. SUBMITTED → denied. reporter → denied.
  - `TestAnonymizeDetail`: build a `ReportDetail` with the reporter as uploader, author and history actor. After `anonymizeDetail`: `Report.ReporterID==0`, `ReporterName==anonymousReporter`, `len(Evidence)==0`, `Report.SubmittedAt==nil`, and every history `CreatedAt` has hour/minute/second 0 in Bangkok time.
  - Keep `TestSafeFileName`.
- [ ] **Step 2:** Run `cd labassist-backend && go test ./reports -run 'TestStateMachine|TestOnlyCourseTeacherDecides|TestAppeal|TestCanView|TestAnonymize'`. Expect a compile failure or FAIL.
- [ ] **Step 3:** Implement the model fields and the new `workflow.go` / `anonymize.go`. Delete the `isReviewer` helper.
- [ ] **Step 4:** Run the same command. Expect PASS. The package will not build yet until Task 3 updates `handler.go`; it is fine to stub the removed helpers' call sites in `handler.go` just enough to compile.
- [ ] **Step 5:** Commit `feat(reports): peer-report state machine and visibility`.

### Task 2: Database layer — filing, quota, peers, blacklist

**Files:**
- Modify: `labassist-backend/database/labboy_report.go`
- Create: `labassist-backend/database/peer_report.go`
- Test: `labassist-backend/database/peer_report_test.go` (MySQL, same skip pattern as `makeup_days_test.go`)

**Interfaces:**
- Consumes: Task 1 model fields.
- Produces:
  - `const MaxPeerReportsPerCourse = 3`, `const MinLabBoysForPeerReport = 3`
  - `var ErrPeerQuota, ErrPeerTooFew, ErrPeerNotEligible, ErrPeerSelf error`
  - `type PeerCourse struct { CourseID uint; CourseCode, CourseTitle, CourseSchedule, Semester string; CourseSection, AcademicYear int; Used, Remaining, LabBoyCount int; CanReport bool; BlockedReason string }` (json snake_case)
  - `type Peer struct { ApplicationID uint; StudentName, StudentCode string }` (json `application_id`, `student_name`, `student_code`)
  - `PeerReportCourses(studentID uint) ([]PeerCourse, error)`: every course where the student has an accepted, non-cancelled application. `CanReport` is true only if the posting is active, the schedule is confirmed, `LabBoyCount >= 3` and `Remaining > 0`. Otherwise `BlockedReason` is one of `"เจ้าหน้าที่ยังไม่ยืนยันตารางปฏิบัติงาน"`, `"รายวิชานี้มี Lab Boy ไม่ถึง 3 คน จึงรายงานไม่ได้เพื่อปกป้องตัวตนผู้รายงาน"`, `"ใช้สิทธิ์รายงานครบ 3 ครั้งแล้ว"`.
  - `CoursePeers(studentID, courseID uint) ([]Peer, error)`: the other accepted, non-cancelled Lab Boys of the same posting, display names via `DisplayName()`. Returns `ErrPeerNotEligible` if the student is not a Lab Boy of that course.
  - `CreatePeerReport(r *models.LabBoyReport, files []models.LabBoyReportEvidence) error`. In one transaction:
    1. Lock the reporter's application with `FOR UPDATE`.
    2. Check eligibility (the target application is accepted, non-cancelled and in the same posting, which is active and schedule-confirmed); fail with `ErrPeerNotEligible` / `ErrPeerSelf`.
    3. Check the count of accepted Lab Boys is at least 3 (`ErrPeerTooFew`).
    4. Check the quota counted over `reporter_id, course_id` (`ErrPeerQuota`).
    5. Reject duplicates (`ErrDuplicateReport`).
    6. Insert the report with status SUBMITTED and `SubmittedAt` now, the history row (nil → SUBMITTED), evidence rows (UploadedByID = reporter) and audit `"submit"`.
    7. Insert notifications for every current instructor of the course: title `"มีรายงาน Lab Boy ใหม่"`, body `"มีรายงานการปฏิบัติงานของ Lab Boy ในรายวิชา <code> รอการพิจารณา"`.
  - `ReportTransition` gains `SetDecidedBy bool`. When true, `decided_by_id = ActorID` is set in the same update.
  - `AddReportResponse` with `RequestReconsideration` also sets `appeal_used = true`, guarded by `appeal_used = false` in the WHERE clause; zero rows affected → `ErrStaleReport`.
  - `ReportFilter` gains `CourseIDs []uint`.
  - `type BlacklistRow struct { StudentID uint; StudentName, StudentCode string; Count int }` and `BlacklistedStudents() ([]BlacklistRow, error)`, sorted by count descending, then name.
- Remove `CreateReportDraft` and `UpdateReportDraft`, and `AddReportEvidence` if no longer referenced after Task 3.

- [ ] **Step 1: Write `peer_report_test.go`.** Fixture: one course + active posting (schedule confirmed), and 3 accepted students A, B, C via `ReviewApplicationTx`. Course 2 = same code, section 2, with student D accepted. Tests:
  - `TestPeerReportQuotaAndRules`:
    - A reports B three times with different dates/categories → all OK; the 4th fails with `ErrPeerQuota`.
    - Withdrawing one of A's reports still leaves A blocked (quota counts withdrawn).
    - A → A fails with `ErrPeerSelf`.
    - A → D fails with `ErrPeerNotEligible`.
    - `PeerReportCourses(A)` shows `Used=3, Remaining=0, CanReport=false` with the quota reason.
    - `CoursePeers(A, course)` returns B and C only.
  - `TestPeerReportTooFew`: C withdraws (approve via `ResolveWithdrawRequest`) → B reporting A fails with `ErrPeerTooFew`, and `PeerReportCourses(B)` shows the "ไม่ถึง 3 คน" reason.
  - `TestPeerReportConcurrentQuota`: B has 2 used; two goroutines call `CreatePeerReport` for B at once → exactly one nil error.
  - `TestAppealFlagOnce`: confirm via `ApplyReportTransition{SetDecidedBy: true}` → `decided_by_id` set; the first `AddReportResponse{RequestReconsideration: true}` succeeds, the second → `ErrStaleReport`.
  - `TestBlacklistedStudents`: B with 2 confirmed, C with 1 confirmed and 1 not_substantiated → rows `[B:2, C:1]`.
- [ ] **Step 2:** Run against a disposable MySQL. Expect FAIL (undefined). Command (Git Bash, from `labassist-backend`):
  `docker exec labassist-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS cap_test; CREATE DATABASE cap_test;"'`, then
  `MSYS_NO_PATHCONV=1 docker run --rm --network taweb-project_default -v "$(pwd -W):/src" -v labassist-gomod:/go/pkg/mod -w /src -e GOTOOLCHAIN=auto -e LABASSIST_TEST_MYSQL_DSN='root:labassist-root-local@tcp(labassist-mysql:3306)/cap_test?parseTime=true&loc=UTC' golang:1.24 go test ./database -run 'TestPeerReport|TestAppealFlagOnce|TestBlacklistedStudents' -v`
- [ ] **Step 3:** Implement `peer_report.go` and the `labboy_report.go` changes.
- [ ] **Step 4:** Re-run. Expect PASS. Drop `cap_test`.
- [ ] **Step 5:** Commit `feat(reports): peer report filing, quota and blacklist queries`.

### Task 3: HTTP handlers, routes, notifications

**Files:**
- Modify: `labassist-backend/reports/handler.go`
- Modify: `labassist-backend/routes/routes.go`
- Test: `labassist-backend/reports/integration_test.go` (rewrite)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces these routes:
  - `GET /student/report-courses` → `[]database.PeerCourse`
  - `GET /student/report-courses/:courseId/peers` → `[]database.Peer` (403 when not eligible)
  - `POST /student/reports` (multipart: `application_id`, `incident_date`, `category`, `description`, `impact`, `files[]`) → 201 `models.LabBoyReport`. Errors map to: quota/too-few/not-eligible/self → 403 or 409 with the Thai messages from Task 2, duplicate → 409.
  - `GET /student/reports/sent` → `ReportPage` (`ReporterID = me`)
  - `GET /student/reports` → `ReportPage` about me, statuses `CONFIRMED` + appealed `NOT_SUBSTANTIATED`, anonymized
  - `GET /instructor/reports` → `ReportPage` with `CourseIDs` = courses the instructor teaches (admin: all), drafts excluded
  - `GET /staff/blacklist` (staff and admin) → `[]database.BlacklistRow`
  - `GET /instructor/applications/:id/performance-records` → `{ "count": n }` only
  - Unchanged: `GET /reports/:id`, `POST /reports/:id/actions`, `POST /reports/:id/responses` (appeal only), `GET /reports/:id/evidence/:evidenceId`
  - Removed: `POST /instructor/reports`, `PUT /instructor/reports/:id`, `POST /instructor/reports/:id/evidence`, `GET /staff/reports`
- `actorFor(c, r) Actor` builds `Actor` with `TeachesCourse = database.InstructorOwnsCourse(course, id, "", false)` for instructors, and `DeciderTeaches` the same check for `*r.DecidedByID`. `loadVisible` and `Act` use it.
- `notificationsFor`:
  - confirm → the reported student gets `"มีรายงานการปฏิบัติงานที่ได้รับการยืนยัน"` / `"อาจารย์ผู้สอนรายวิชา <course> ยืนยันรายงานการปฏิบัติงานของคุณ คุณยื่นอุทธรณ์ได้ 1 ครั้งที่หน้า \"รายงานการปฏิบัติงาน\""` + reason; the reporter gets the result.
  - not_substantiated → reporter only.
  - withdraw → nobody.
  - accept_appeal / decline_reconsideration → the reported student and the reporter get the outcome.
  - Appeal submitted (in `Respond`) → the decider gets `"มีคำอุทธรณ์รายงาน Lab Boy"`.
  - No notification body sent to the reported student contains a reporter name.
- `Act` passes `SetDecidedBy: true` for confirm and not_substantiated.

- [ ] **Step 1: Rewrite `integration_test.go` `TestReportWorkflowEndToEnd`** (MySQL, routes via `routes.Setup` as today). Fixture as in Task 2, plus an instructor teaching the course, another instructor, staff and admin. Subtests:
  - Before the schedule is confirmed, `GET /student/report-courses` shows `can_report=false`; afterwards true.
  - A `POST /student/reports` against B → 201.
  - B `GET /reports/:id` → 404, and B `GET /student/reports` has 0 items.
  - The other instructor confirming → 403; staff `GET /reports/:id` → 404.
  - The teacher confirms with a reason → 200. B now sees it; B's raw JSON does not contain A's display name, `"reporter_id":<A.ID>` or `"submitted_at"`, and `evidence` is `[]`.
  - B's notifications do not contain A's name.
  - B appeals → 201; a second appeal → 400. The teacher `accept_appeal` → 200 and the status is NOT_SUBSTANTIATED. `GET /staff/blacklist` no longer lists B.
  - A `GET /student/reports/sent` shows the report and its status, and A's detail JSON has no RECONSIDERATION response text.
  - The teacher `POST /instructor/reports` → 404 (route removed).
  - Another course's instructor `performance-records` → `{"count":0}` after the appeal and `{"count":1}` for a second confirmed report.
- [ ] **Step 2:** Run with the MySQL command from Task 2, `-run TestReportWorkflowEndToEnd ./reports`. Expect FAIL.
- [ ] **Step 3:** Implement the handlers and routes; delete the dead handlers and swagger comments for the removed routes.
- [ ] **Step 4:** Run `go build ./... && go vet ./reports && go test ./reports` (unit), then the MySQL run. Expect PASS.
- [ ] **Step 5:** Commit `feat(reports): student peer report API`.

### Task 4: Seed data for the new flow

**Files:**
- Modify: `labassist-backend/database/seed_mock_applicants.go` (`seedMockReports`)

- [ ] **Step 1:** Change the 3 seeded reports so the reporters are demo students in the same course, and the past course has at least 3 accepted demo students with the schedule confirmed. Keep these 3 cases:
  - demo_std03: CONFIRMED (decided_by = the instructor)
  - demo_std01: SUBMITTED
  - demo_std05: NOT_SUBSTANTIATED
  - Seeding stays idempotent (keyed on application + category as today).
- [ ] **Step 2:** Fresh DB check: run the backend container with `RESET_DB_ON_START=true` once, then
  `docker exec labassist-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT r.status, u.role FROM labboy_reports r JOIN users u ON u.id=r.reporter_id" labassist'`
  Expect 3 rows, all role `student`.
- [ ] **Step 3:** Commit `chore(seed): peer report demo data`.

### Task 5: Frontend API, types and the student flow

**Files:**
- Modify: `labassist-frontend/src/types/index.ts`, `labassist-frontend/src/services/api.ts`
- Rewrite: `labassist-frontend/src/pages/student/StudentReports.tsx`
- Create: `labassist-frontend/src/pages/student/StudentReportCourse.tsx`
- Create: `labassist-frontend/src/components/reports/PeerReportFormModal.tsx`
- Create: `labassist-frontend/src/components/reports/peerReport.ts` (+ `peerReport.test.ts`)
- Modify: `labassist-frontend/src/router/index.tsx` (route `/student/reports/course/:courseId`)

**Interfaces:**
- Consumes: Task 3 routes.
- Produces:
  - Types `PeerCourse`, `Peer`, `BlacklistRow` (snake_case as JSON). `LabBoyReport` gains `decided_by_id?`, `appeal_used`. `ReportAction` = `'withdraw' | 'confirm' | 'not_substantiated' | 'accept_appeal' | 'decline_reconsideration'`.
  - `reportsApi.reportCourses()`, `coursePeers(courseId)`, `fileReport(input: PeerReportInput, files: File[])` (multipart), `sent(params)`, `aboutMe(params)` (= the old `studentReports`), `instructorQueue(params)`, `blacklist()`, `confirmedCount(applicationId) → {count}`. Remove `create`, `updateDraft`, `uploadEvidence`, `reviewQueue`, `mine`, `confirmedHistory`.
  - `peerReport.ts`: `quotaLabel(c: PeerCourse): string` → `"เหลือสิทธิ์รายงาน 2 จาก 3 ครั้ง"`; `blockedText(c: PeerCourse): string | null` returns `c.blocked_reason` when `!c.can_report`.

UI:
- `StudentReports`: header `"รายงานการปฏิบัติงาน"`, then three sections:
  1. "รายวิชาที่ฉันเป็น Lab Boy": a card per `PeerCourse` showing code, title, section/schedule, `quotaLabel`, a "ดูรายชื่อ Lab Boy" button (`/student/reports/course/:id`), and `blockedText` in amber when blocked.
  2. "รายงานที่ฉันส่ง": `ReportList` with `fetchPage=reportsApi.sent`.
  3. "รายงานเกี่ยวกับฉัน": `ReportList` with `fetchPage=reportsApi.aboutMe`. Empty text: `"ไม่มีรายงานที่ได้รับการยืนยันเกี่ยวกับคุณ"`.
- `StudentReportCourse`: the course header + quota, the peer list (avatar, name, student code) each with a "รายงาน" button that opens `PeerReportFormModal`. Buttons are disabled with the blocked text when `!can_report`. The student's own name never appears (the server already excludes it).
- `PeerReportFormModal`: the same fields and validation as `ReportFormModal` (incident date not in the future, category, description ≤ MAX_TEXT, impact, `FilePicker`). There is no draft button. A confirm step reads `"ส่งรายงานแล้วแก้ไขไม่ได้ และนับเป็น 1 ใน 3 ครั้งของรายวิชานี้"`. On success: toast `"ส่งรายงานแล้ว"`, invalidate `['report-courses']` and `['student-sent-reports']`, close.

- [ ] **Step 1:** Write `peerReport.test.ts`: `quotaLabel({remaining: 2, used: 1, …})` → `"เหลือสิทธิ์รายงาน 2 จาก 3 ครั้ง"`; `blockedText` returns null when `can_report` and the reason otherwise.
- [ ] **Step 2:** Run `cd labassist-frontend && npx vitest run src/components/reports/peerReport.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement the types, API, helper, pages, modal and route.
- [ ] **Step 4:** Run `npx tsc -b && npx eslint src/pages/student src/components/reports && npx vitest run`. Expect all PASS.
- [ ] **Step 5:** Commit `feat(reports): student peer report pages`.

### Task 6: Detail page, instructor queue, staff blacklist, badge

**Files:**
- Modify: `labassist-frontend/src/pages/reports/ReportDetailPage.tsx`
- Rewrite: `labassist-frontend/src/pages/instructor/InstructorReports.tsx` (decision queue)
- Delete: `labassist-frontend/src/pages/instructor/InstructorReportCourse.tsx`, `components/reports/ReportFormModal.tsx`, `components/reports/useReportCourses.ts` (and their routes)
- Rewrite: `labassist-frontend/src/pages/staff/StaffReports.tsx` (blacklist table)
- Rewrite: `labassist-frontend/src/components/reports/ConfirmedHistory.tsx` (badge)
- Modify: `labassist-frontend/src/components/layout/Sidebar.tsx` labels

**Interfaces:**
- Consumes: Task 5 API and types.

UI:
- `ReportDetailPage`:
  - Remove the draft edit, add-evidence and explanation boxes.
  - Actions come from `allowed_actions`, labels: confirm `"ยืนยัน (ติด blacklist)"`, not_substantiated `"ไม่ยืนยัน"`, accept_appeal `"รับอุทธรณ์ (ยก blacklist)"`, decline_reconsideration `"ยกอุทธรณ์"`, withdraw `"ถอนรายงาน"`. Each needs a reason (the existing modal).
  - The reported student sees an `"ยื่นอุทธรณ์"` button when `can_request_reconsideration`, using the existing reconsider modal.
  - Instructors see a "ผู้รายงาน" field with the reporter's name.
  - The banner for the reported student reads `"ผู้รายงานไม่เปิดเผยตัวตน และคุณยื่นอุทธรณ์ได้ 1 ครั้ง"`.
- `InstructorReports`: header `"รายงาน Lab Boy ในรายวิชาของฉัน"`, then `ReportList` with `fetchPage=reportsApi.instructorQueue`, `showStudent`, status options: รอพิจารณา (`SUBMITTED`), ยืนยันแล้ว, ไม่ยืนยัน, ถอนแล้ว.
- `StaffReports`: header `"นักศึกษาที่ติด blacklist"`, a table with ชื่อ / รหัสนักศึกษา / จำนวน blacklist from `reportsApi.blacklist()`, no links. Empty state `"ยังไม่มีนักศึกษาที่ติด blacklist"`.
- `ConfirmedHistory({count})`: when `count > 0`, a red badge `"ติด blacklist <count> ครั้ง"`; otherwise nothing. `InstructorSelect` passes only `count`.
- Sidebar labels: student `"รายงานการปฏิบัติงาน"` (unchanged); instructor `"รายงาน Lab Boy"`; staff `"นักศึกษาติด blacklist"`.

- [ ] **Step 1:** Implement the changes above.
- [ ] **Step 2:** Run `npx tsc -b && npx eslint src && npx vitest run`. Expect PASS, apart from the known pre-existing `react-refresh/only-export-components` error in `WorkPlanTab.tsx`.
- [ ] **Step 3:** Rebuild with `docker compose up -d --build backend frontend`. Screenshot with `node <scratchpad>/shot.mjs` (prefix `MSYS_NO_PATHCONV=1`):
  - demo_std02: `/student/reports`, then `/student/reports/course/<id>`
  - demo_std03: `/reports/<confirmed id>`
  - the demo instructor: `/instructor/reports`
  - demo staff: `/staff/reports`

  Check by eye that the reported student's page shows no reporter name.
- [ ] **Step 4:** Commit `feat(reports): decision queue, blacklist list and detail page for peer reports`.
