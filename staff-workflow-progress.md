# Staff Workflow — Session Progress

**Date:** 2026-09-30
**Session started:** ~14:47 GMT+7
**Session ended:** ~15:10 GMT+7

---

## Objective

Continue the Staff document-management workflow (Lab Boy hiring and payment) from where the previous session stopped. Perform a full recovery audit, then complete the next coherent implementation unit without discarding or reverting existing work.

---

## Recovery Audit Results

### State at session start

All files from the previous session were intact as unstaged changes + untracked files.
No merge-conflict markers. No staged changes. No commits since `origin/main`.

### What existed before this session

**Backend (complete):**
- `labassist-backend/models/staff_case.go` — `StaffCase`, `ScheduleGroup`
- `labassist-backend/models/calendar_date.go` — `CalendarDate`
- `labassist-backend/models/work_occurrence.go` — `WorkOccurrence` (6-state)
- `labassist-backend/models/monthly_period.go` — `MonthlyPeriod`
- `labassist-backend/models/staff_audit_log.go` — `StaffAuditLog`
- `labassist-backend/models/staff_document.go` — extended with versioning/snapshot/signed-upload fields
- `labassist-backend/database/staff_case.go` — full data access layer (EnsureStaffCase, GenerateWorkOccurrences, RescheduleOccurrence, CloseMonthlyPeriod, …)
- `labassist-backend/Staff/cases.go` — 8 handler endpoints
- `labassist-backend/Staff/holidays.go` — 3 handler endpoints
- `labassist-backend/Staff/occurrences.go` — 4 handler endpoints
- `labassist-backend/Staff/monthly.go` — 4 handler endpoints (ListMonthlyPeriods, OpenMonthlyPeriod, CloseMonthlyPeriod, GetMonthlyOccurrences)
- `labassist-backend/Teacher/courses.go` — extended `ConfirmSchedule` to call `EnsureStaffCase`
- `labassist-backend/database/database.go` — new models registered in AutoMigrate
- `labassist-backend/routes/routes.go` — 19 new endpoints wired

**Frontend (complete):**
- `labassist-frontend/src/types/index.ts` — all new Staff workflow types
- `labassist-frontend/src/services/api.ts` — all new staffApi methods
- `labassist-frontend/src/pages/staff/StaffCourseDetail.tsx` — two new tabs wired (workplan, monthly)
- `labassist-frontend/src/pages/staff/components/WorkPlanTab.tsx` — 350-line component (generate occurrences, add holidays, occurrence table with status actions, lock plan). **Missing:** settings form and reschedule UI
- `labassist-frontend/src/pages/staff/components/MonthlyOpsTab.tsx` — monthly period open/close, occurrence summary, payment display. **Missing:** document generation buttons were `disabled`

**Problem found:** Money truncation bug in `monthly.go` — `int64(...)` truncated instead of rounded.

---

## Work Completed This Session

### 1. Money truncation bug fixed

**File:** `labassist-backend/Staff/monthly.go`
Added `math` import. Changed:
```go
// before
resp.TotalAmountSatang = int64(resp.TotalHours * float64(sc.RatePerHour))
// after
resp.TotalAmountSatang = int64(math.Round(resp.TotalHours * float64(sc.RatePerHour)))
```
This ensures `TotalAmountSatang` rounds to nearest satang rather than truncating, preventing systematic underpayment.

### 2. WorkPlanTab — Settings form + Reschedule UI

**File:** `labassist-frontend/src/pages/staff/components/WorkPlanTab.tsx`
Rewrote the component (same logic, plus new sections):

- **Settings panel** (always visible, collapsed by default) — displays current `hours_per_session` and `rate_per_hour` from `StaffCase`. A "ตั้งค่า" button opens an edit form with:
  - Hours per session (decimal)
  - Rate per hour (baht, converted → satang before sending to `PUT /staff/cases/:id`)
  - Work start/end dates
- **Reschedule UI** — each `scheduled` occurrence row now has a "เลื่อน" button. Clicking it reveals an inline form (new date, new start/end time, reason) that calls `POST /staff/occurrences/:id/reschedule`.

### 3. Document generation for monthly periods

**Backend — `labassist-backend/Staff/monthly.go`:**
New handler `GenerateMonthlyDocument` added to the existing file. New imports added.

Endpoint: `POST /staff/monthly-periods/:id/documents`
Body: `{ type: "work_report"|"payment_request", ref_number?, prior_memo_ref?, ... }`

Logic:
1. Load `MonthlyPeriod` + `StaffCase`
2. Validate `HoursPerSession > 0` and `RatePerHour > 0` (returns 422 if not set)
3. Collect completed occurrences → extract day-of-month list
4. Validate at least 1 completed occurrence (422 otherwise)
5. Compute `totalHours = roundSatang(HoursPerSession × sessions)`, `rateBaht = RatePerHour / 100`, `perAmount = roundSatang(totalHours × rateBaht)`, `totalAmount = sum(perAmount × labboys)`
6. Freeze JSON snapshot into `DataSnapshot` field
7. Create `StaffDocument` with `StaffCaseID`, `MonthlyPeriodID`, snapshot, version=1
8. Check if template is available (returns `X-Render-Warning` header if not, does not block)
9. Create audit log entry

**Route added — `labassist-backend/routes/routes.go`:**
```
POST /staff/monthly-periods/:id/documents → staffH.GenerateMonthlyDocument
```

**Frontend — `labassist-frontend/src/services/api.ts`:**
Added `generateMonthlyDocument(periodId, type, extras?)` method.
Removed duplicate `downloadDocument` entry.

**Frontend — `labassist-frontend/src/pages/staff/components/MonthlyOpsTab.tsx`:**
- Added `downloadBlob` helper at top of file
- `PeriodAccordion` gains `generatedDoc` and `genDocError` state, two mutations (`genDocMut`, `downloadDocMut`)
- "สร้างรายงานผลการปฏิบัติงาน" and "สร้างบันทึกขออนุมัติเบิกจ่าย" buttons are now active
- Buttons disabled (not hidden) when `completed_sessions === 0`
- On success: shows document name and a "ดาวน์โหลด .docx" button that streams via `GET /staff/documents/:id/file`

---

## Database Changes

No schema changes in this session. All new tables were already registered in `migrateApplicationData` in the previous session.

---

## API Changes

| Method | Path | Handler |
|--------|------|---------|
| POST | `/staff/monthly-periods/:id/documents` | `GenerateMonthlyDocument` |

---

## UI Changes

- `WorkPlanTab` — added settings form + reschedule form
- `MonthlyOpsTab` — enabled document generation buttons with post-generate download

---

## Tests Added

None. Existing tests all pass (`go test ./...`).

---

## Commands Run and Results

```
go build ./...          → OK (no output)
go test ./...           → all pass, Staff/ has no test files (expected)
npm run build           → ✓ built in 420ms (zero TypeScript errors)
git diff --check        → only LF/CRLF warning on database.go (pre-existing, harmless on Windows)
git status --short      → 7 modified + 10 untracked (same set as session start, no extras)
```

---

## Completed Requirements

1. ✅ StaffCase idempotent creation after instructor confirmation (EnsureStaffCase)
2. ✅ Unique StaffCase per Posting (unique index enforced)
3. ✅ Course offering identified by academic_year + semester + course_code + section (via CourseID + Posting)
4. ✅ Instructor confirmation gating (ConfirmSchedule → EnsureStaffCase)
5. ✅ WorkOccurrence 6-state lifecycle (scheduled / cancelled_holiday / rescheduled / completed / absent / cancelled_other)
6. ✅ Holiday/exception/makeup CalendarDate management (scoped: global / semester / case)
7. ✅ Occurrence generation engine (GenerateWorkOccurrences)
8. ✅ Reschedule occurrence (atomic: marks original rescheduled, creates new scheduled)
9. ✅ MonthlyPeriod open/close lifecycle
10. ✅ Money stored as satang (int64), never as float in DB
11. ✅ Backend calculates totals — frontend sends no financial values to GenerateMonthlyDocument
12. ✅ DataSnapshot frozen at document creation time
13. ✅ Version field on StaffDocument
14. ✅ Audit log for all significant actions
15. ✅ WorkPlanTab — generate occurrences, manage holidays, update occurrence status, reschedule, lock plan, configure rate/hours
16. ✅ MonthlyOpsTab — open/close periods, display totals, generate work report + payment request
17. ✅ money truncation bug fixed (math.Round)

---

## Incomplete Requirements

1. ❌ Signed document upload endpoint — `StaffDocument` model has fields (`SignedFileData`, `SignedAt`, `SignedByID`) but no handler (`PUT /staff/documents/:id/signed-upload`)
2. ❌ Audit log UI — `GET /staff/cases/:id/audit` endpoint exists but no frontend component calls it
3. ❌ Backend tests for `Staff/` package — no test files
4. ❌ `UpdateDocumentStatus` still only allows `draft|pending|approved` — the 5 new `DocStatus` values are not accepted yet
5. ❌ `work_start_date` / `work_end_date` from StaffCase not yet used to pre-fill generate-occurrences form
6. ❌ Document generation for `DocHiringNotice` (start-of-term document) is wired in the existing `CreateDocument` endpoint but not exposed as a "one-click generate from StaffCase" action

---

## Known Problems

1. `StaffCaseDone` state can be set by manually updating but the application has no handler to transition `plan_locked → done` yet. Low impact as the workflow still functions with `plan_locked`.
2. The `work_report.docx` template assumes all sessions have the same scheduled time (`buildSessionTime`). When `ActualHours` differs between occurrences, the hours shown in the template will use the fixed `HoursPerSession`. The financial calculation is correct (per occurrence hours are not yet tracked individually); this is a known limitation of the template design.

---

## Exact Recommended Next Step

### Priority 1 — Signed document upload

Implement `PUT /staff/documents/:id/signed-upload` (multipart/form-data) that:
1. Checks that `doc.Status == DocGenerated` or `DocAwaitingSignature` (prevent overwriting an already-signed doc silently)
2. Reads the uploaded file into `SignedFileData`
3. Sets `SignedFileName`, `SignedAt = now()`, `SignedByID = staffID`
4. Updates `Status = DocSigned`
5. Creates an audit log entry

Frontend: add an upload button in `MonthlyOpsTab` that appears after a document has been generated.

### Priority 2 — Backend test for GenerateMonthlyDocument

Test that:
- 422 returned when `hours_per_session == 0`
- 422 returned when no completed occurrences
- Created document has correct `TotalAmount`
- `DataSnapshot` is valid JSON

### Priority 3 — `UpdateDocumentStatus` extended statuses

Update the validator in `Staff/documents.go:283` to also accept the new statuses (`generated`, `awaiting_signature`, `signed`, `cancelled`, `superseded`).

---

*Do not commit, merge, or push until authorized.*
