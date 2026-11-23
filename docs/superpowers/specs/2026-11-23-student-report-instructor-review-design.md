# Student-filed Lab Boy reports, reviewed by the instructor

## Intent
Students can report a fellow Lab Boy again, but a student's report has no
effect until the course's instructor reviews it and confirms it.

## Design (approved 2026-11-23)
- Same `labboy_reports` table and statuses; no schema change.
  - Student report: DRAFT -> SUBMITTED (waiting for instructor).
  - Instructor of the report's course: SUBMITTED -> CONFIRMED (confirm) or
    SUBMITTED -> NOT_SUBSTANTIATED (reject, reason required).
  - Instructor-filed report: DRAFT -> CONFIRMED on submit (unchanged).
- Student may report only accepted Lab Boys in a course where they are also
  an accepted Lab Boy (not themselves). Can draft, add evidence, submit,
  withdraw while DRAFT/SUBMITTED, and sees the result + reason.
- Instructor gets a notification and a "รอตรวจ" list; sees reporter's name.
- Reported student never sees reports. Admin read-only. Staff nothing.
- Only CONFIRMED reports set the red flag (unchanged).
- Remove the startup migration that auto-confirmed every SUBMITTED report.
- Rejected reports cannot be reopened.

## Approaches
- Reuse existing table/statuses (chosen): restores the pre-existing student
  flow from git, minimal new code.
- Separate "student complaint" table: duplicates list/evidence/history; rejected.
