import { describe, expect, it } from 'vitest'
import type { CalendarPreviewEntry } from '../types'
import {
  currentAcademicYear, entryDays, formatEntryRange, importSummary, semesterMonthKeys, toDraftRows, toImportPayload,
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
