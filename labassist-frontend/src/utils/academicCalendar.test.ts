import { describe, expect, it } from 'vitest'
import type { CalendarPreviewEntry } from '../types'
import {
  academicYearOfMonth, currentAcademicYear, entryDays, filledTerms, formatEntryRange, importSummary, semesterMonthKeys,
  termIssue, toDraftRows, toImportPayload, toTermDrafts, toTermPayload,
} from './academicCalendar'

const entry = (over: Partial<CalendarPreviewEntry>): CalendarPreviewEntry => ({
  start_date: '2026-10-23', end_date: '2026-10-23', name: 'วันปิยมหาราช', semester: '1',
  date_type: 'public_holiday', include: true, page: 1, exists: false, ...over,
})

describe('academic calendar import helpers', () => {
  it('derives the academic year from June', () => {
    expect(currentAcademicYear(new Date(2026, 5, 1))).toBe(2569)
    expect(currentAcademicYear(new Date(2027, 4, 31))).toBe(2569)
  })

  it('counts days across months and years', () => {
    expect(entryDays('2026-10-12', '2026-10-12')).toBe(1)
    expect(entryDays('2026-12-30', '2027-01-02')).toBe(4)
    expect(entryDays('2026-10-12', '2026-10-01')).toBe(0)
  })

  it('formats single days and ranges', () => {
    expect(formatEntryRange('2026-10-01', '2026-10-01')).toBe('1 ต.ค. 2569')
    expect(formatEntryRange('2026-10-01', '2026-10-02')).toBe('1 ต.ค. 2569 – 2 ต.ค. 2569')
  })

  it('pre-selects suggested holidays not yet in the system', () => {
    const rows = toDraftRows([
      entry({}),
      entry({ name: 'วันพ่อแห่งชาติ', exists: true }),
      entry({ name: 'วันมหาธีรราชเจ้า', date_type: 'university_holiday', include: false }),
    ])
    expect(rows.map((r) => r.selected)).toEqual([true, false, false])
    expect(rows.every((r) => r.affects_work)).toBe(true)
  })

  it('sends only ticked, named, new rows and trims names', () => {
    const rows = toDraftRows([
      entry({ start_date: '2027-04-13', end_date: '2027-04-15', name: '  วันสงกรานต์ ' }),
      entry({ name: '   ' }),
      entry({ exists: true }),
      entry({ name: 'วันศิลป์ พีระศรี', date_type: 'university_holiday' }),
    ])
    rows[2].selected = true // already in the system
    rows[3].selected = false // unticked by the admin
    expect(toImportPayload(rows)).toEqual([{
      start_date: '2027-04-13', end_date: '2027-04-15', name: 'วันสงกรานต์', semester: '1',
      date_type: 'public_holiday', affects_work: true,
    }])
    expect(importSummary(rows)).toEqual({ entries: 1, days: 3 })
  })

  it('widens a term to the months of its holidays, not of global ones', () => {
    const defaults = ['2026-07', '2026-08', '2026-09', '2026-10']
    expect(semesterMonthKeys(defaults, [
      { date: '2026-06-22T00:00:00Z', scope: 'semester' },
      { date: '2026-11-02', scope: 'semester' },
      { date: '2026-08-12', scope: 'semester' },
      { date: '2025-12-31', scope: 'global' },
    ])).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  })
})

describe('semester open/close dates', () => {
  it('always gives the three semesters, empty where the file had none', () => {
    const drafts = toTermDrafts([{ semester: '2', open_date: '2026-11-09' }])
    expect(drafts.map((d) => d.semester)).toEqual(['1', '2', 'S'])
    expect(drafts[1].open_date).toBe('2026-11-09')
    expect(drafts[0].open_date).toBe('')
    expect(toTermDrafts(undefined)).toHaveLength(3)
  })

  it('sends only semesters that have at least one date', () => {
    const drafts = toTermDrafts([{ semester: '1', open_date: '2026-06-22', close_date: '2026-10-30' }, { semester: 'S', close_date: '2027-06-01' }])
    expect(filledTerms(drafts).map((d) => d.semester)).toEqual(['1', 'S'])
    expect(toTermPayload(drafts)).toEqual([
      { semester: '1', open_date: '2026-06-22', close_date: '2026-10-30' },
      { semester: 'S', open_date: '', close_date: '2027-06-01' },
    ])
  })

  it('flags a close date before the open date', () => {
    const base = { semester: '1', open_date: '2026-10-30', close_date: '2026-06-22' }
    expect(termIssue(base)).not.toBe('')
    expect(termIssue({ ...base, close_date: '2026-11-01' })).toBe('')
    expect(termIssue({ ...base, close_date: '' })).toBe('')
  })

  it('maps a calendar month to its academic year (starts in June)', () => {
    expect(academicYearOfMonth(2026, 5)).toBe(2569) // June 2026
    expect(academicYearOfMonth(2026, 4)).toBe(2568) // May 2026
    expect(academicYearOfMonth(2027, 0)).toBe(2569) // Jan 2027
  })
})

describe('academic events', () => {
  const act = (category: 'exam' | 'other') => ({
    start_date: '2026-08-22', end_date: '2026-09-05', name: ' สอบกลางภาค ', semester: '1', category, page: 2,
  })

  it('selects categorised rows only and trims names for the payload', async () => {
    const { toEventDrafts, toEventPayload } = await import('./academicCalendar')
    const drafts = toEventDrafts([act('exam'), act('other')])
    expect(drafts.map((d) => d.include)).toEqual([true, false])
    expect(toEventPayload(drafts)).toEqual([
      { start_date: '2026-08-22', end_date: '2026-09-05', name: 'สอบกลางภาค', semester: '1', category: 'exam' },
    ])
  })

  it('lists every day of a range and a single day otherwise', async () => {
    const { eventDays } = await import('./academicCalendar')
    expect(eventDays('2026-08-30', '2026-09-02')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])
    expect(eventDays('2026-08-30', '2026-08-01')).toEqual(['2026-08-30'])
  })
})
