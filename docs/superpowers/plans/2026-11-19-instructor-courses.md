# Instructor Courses Regroup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** /instructor/courses shows one card per course with one line per Sec (schedule + accepted Lab Boys); details folded; self-added courses in their own section.
**Architecture:** Pure grouping helper (tested) + rewritten render in `InstructorMyCourses.tsx`; existing modals/mutations untouched.
**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-19-instructor-courses-design.md`

## Global Constraints
- No API / type changes; frontend only; reuse Card, StatusBadge, Avatar, Button, EmptyState, CourseEditRequestModal.
- Applicants fetched only for `source === 'imported'` (self_added → 403).

## Review Focus
- Same code taught in two semesters → two separate cards (key includes semester + year).
- Same course both imported and self_added → separate groups (key includes source).
- Course with no section number → line labelled without "Sec".
- Search by "2" / "Sec 2" matches only the group containing Sec 2 and shows only matching lines? → show whole group (simpler; whole course stays readable).
- Pending/rejected edit request on a Sec visible without expanding details.

---

### Task 1: `groupMyCourses`

**Files:** Create `src/utils/myCourseGroups.ts`, Test `src/utils/myCourseGroups.test.ts`

**Interfaces — Produces:**
```ts
export interface MyCourseGroup { key: string; source: CourseRelation['source']; head: Course; rels: CourseRelation[] }
export function groupMyCourses(rels: CourseRelation[]): MyCourseGroup[]
```
Key = `${source}|${code}|${semester}|${academic_year}`; rels sorted by section asc; groups sorted academic_year desc, semester desc, code asc.

- [ ] Tests: `groups sections of the same course`, `separates semesters and sources`, `sorts newest term first then code`
- [ ] Implement, run `npx vitest run src/utils/myCourseGroups.test.ts` → PASS

### Task 2: Render regroup

**Files:** Modify `src/pages/instructor/InstructorMyCourses.tsx`, `src/styles/globals.css`
- [ ] Replace FilterChips + per-relation cards with two sections ("วิชาที่สอนตามตารางสอน (N)", "วิชาที่เพิ่มเอง · ดูเท่านั้น (M)" + one-line permission note).
- [ ] Group card: header code/title/term + "รายละเอียด" toggle (aria-expanded); one `.mc-sec-row` per rel: Sec + schedule + StatusBadge | Lab Boy x/y + avatar chips (imported) ; edit-request status bar inline per row when pending/rejected.
- [ ] Details panel: english title, credits, per-Sec "ขอแก้ไขรายละเอียด" (imported) / "ยกเลิกเชื่อมโยง" (self_added).
- [ ] CSS `.mc-sec-row` grid 2 cols, 1 col ≤640px.
- [ ] `npm run build`, eslint, vitest → pass; rebuild frontend container.
