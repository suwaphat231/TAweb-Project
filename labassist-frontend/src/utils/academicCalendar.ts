import type { CalendarImportEntry, CalendarImportType, CalendarPreviewEntry } from '../types'
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
