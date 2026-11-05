import type { CalendarImportEntry, CalendarImportTerm, CalendarImportType, CalendarPreviewEntry, CalendarPreviewTerm } from '../types'
import { formatThaiDate } from './thaiDate'

/** A holiday read from the calendar file that the admin can edit before saving. */
export interface CalendarDraftRow extends CalendarPreviewEntry {
  /** Ticked to be saved. */
  selected: boolean
  affects_work: boolean
}

export const CALENDAR_SEMESTER_LABELS: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  S: 'ภาคฤดูร้อน',
}

export const CALENDAR_IMPORT_TYPE_LABELS: Record<CalendarImportType, string> = {
  public_holiday: 'วันหยุดราชการ',
  university_holiday: 'วันหยุดมหาวิทยาลัย',
}

/** The academic year (พ.ศ.) in progress on the given day; it starts in June. */
export function currentAcademicYear(today = new Date()): number {
  const be = today.getFullYear() + 543
  return today.getMonth() + 1 >= 6 ? be : be - 1
}

/** Number of days an entry covers, counting both ends. */
export function entryDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Number.isNaN(ms) || ms < 0 ? 0 : Math.round(ms / 86_400_000) + 1
}

/** "12 ต.ค. 2569" or "12 ต.ค. 2569 – 23 ต.ค. 2569". */
export function formatEntryRange(start: string, end: string): string {
  return start === end ? formatThaiDate(start) : `${formatThaiDate(start)} – ${formatThaiDate(end)}`
}

/** Holidays the file clearly marks as days off start ticked; named days
 * that may not stop teaching (include = false) wait for the admin. */
export function toDraftRows(entries: CalendarPreviewEntry[]): CalendarDraftRow[] {
  return entries.map((e) => ({ ...e, selected: e.include && !e.exists, affects_work: true }))
}

/** Rows that will be saved: ticked, named and not already imported. */
export function rowsToImport(rows: CalendarDraftRow[]): CalendarDraftRow[] {
  return rows.filter((r) => r.selected && !r.exists && r.name.trim())
}

export function toImportPayload(rows: CalendarDraftRow[]): CalendarImportEntry[] {
  return rowsToImport(rows).map((r) => ({
    start_date: r.start_date,
    end_date: r.end_date,
    name: r.name.trim(),
    semester: r.semester,
    date_type: r.date_type,
    affects_work: r.affects_work,
  }))
}

export function importSummary(rows: CalendarDraftRow[]): { entries: number; days: number } {
  const chosen = rowsToImport(rows)
  return { entries: chosen.length, days: chosen.reduce((n, r) => n + entryDays(r.start_date, r.end_date), 0) }
}

/** Imported holidays carry this reason, so staff can tell them apart. */
export const CALENDAR_IMPORT_REASON = 'นำเข้าจากปฏิทินการศึกษา'

/** "YYYY-MM" of every month a staff holiday page should show for a term:
 * the term's usual months plus any month that holds one of its holidays
 * (an imported calendar may put them outside the usual months). */
export function semesterMonthKeys(defaults: string[], dates: { date: string; scope: string }[]): string[] {
  const keys = new Set(defaults)
  for (const d of dates) {
    // Global holidays apply to every year; only term holidays widen the range.
    if (d.scope === 'semester') keys.add(d.date.slice(0, 7))
  }
  return [...keys].sort()
}

// ── Semester open / close dates ────────────────────────────────────────

/** One semester's open/close date while the admin reviews it (YYYY-MM-DD, '' = empty). */
export interface TermDraft {
  semester: string
  open_date: string
  close_date: string
  /** Where the dates were read from, for display. */
  open_name?: string
  close_name?: string
  page?: number
  saved_open_date?: string
  saved_close_date?: string
}

export function toTermDrafts(terms: CalendarPreviewTerm[] | undefined): TermDraft[] {
  return ['1', '2', 'S'].map((semester) => {
    const t = (terms ?? []).find((x) => x.semester === semester)
    return {
      semester,
      open_date: t?.open_date ?? '', close_date: t?.close_date ?? '',
      open_name: t?.open_name, close_name: t?.close_name, page: t?.page,
      saved_open_date: t?.saved_open_date, saved_close_date: t?.saved_close_date,
    }
  })
}

/** Problem with one semester's dates, or '' when fine (a blank pair is fine). */
export function termIssue(t: TermDraft): string {
  if (t.open_date && t.close_date && t.close_date < t.open_date) return 'วันปิดภาคเรียนต้องไม่ก่อนวันเปิดภาคเรียน'
  return ''
}

export function filledTerms(terms: TermDraft[]): TermDraft[] {
  return terms.filter((t) => t.open_date || t.close_date)
}

export function toTermPayload(terms: TermDraft[]): CalendarImportTerm[] {
  return filledTerms(terms).map((t) => ({ semester: t.semester, open_date: t.open_date, close_date: t.close_date }))
}

/** Academic year (พ.ศ.) a calendar month belongs to: the year starts in June. */
export function academicYearOfMonth(ceYear: number, month0: number): number {
  return (month0 >= 5 ? ceYear : ceYear - 1) + 543
}

// ── Academic events (registration, exams, deadlines, ...) ─────────────────────

export const EVENT_CATEGORY_LABEL: Record<import('../types').AcademicEventCategory, string> = {
  registration: 'ลงทะเบียน / ถอน', exam: 'สอบ', deadline: 'กำหนดส่ง / วันสุดท้าย', other: 'อื่น ๆ',
}

export interface EventDraft {
  activity: import('../types').CalendarPreviewActivity
  include: boolean
}

/** Rows start selected except the uncategorised ones, which are mostly noise. */
export function toEventDrafts(activities: import('../types').CalendarPreviewActivity[] = []): EventDraft[] {
  return activities.map((activity) => ({ activity, include: activity.category !== 'other' }))
}

export function toEventPayload(drafts: EventDraft[]): import('../types').CalendarImportEvent[] {
  return drafts.filter((d) => d.include).map(({ activity: a }) => ({
    start_date: a.start_date, end_date: a.end_date, name: a.name.trim(), semester: a.semester, category: a.category,
  }))
}

/** Every ISO day (YYYY-MM-DD) from start to end inclusive; one day when end is missing or earlier. */
export function eventDays(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${endIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return []
  const days: string[] = []
  for (let d = start; !(d > end) && days.length < 400; d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10))
  return days.length > 0 ? days : [start.toISOString().slice(0, 10)]
}
