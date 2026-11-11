import { describe, expect, it } from 'vitest'
import { MAX_LAB_SESSIONS_PER_TERM, capSessionDates, sessionSlotsUsed } from './labSessions'
import type { WorkOccurrence } from '../types'

const week = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`)

describe('capSessionDates', () => {
  it('keeps the first 15 dates of the term across months', () => {
    const months = [week('2026-07', 4), week('2026-08', 4), week('2026-09', 4), week('2026-10', 5), week('2026-11', 4)]
    const capped = capSessionDates(months)
    expect(capped.map((m) => m.length)).toEqual([4, 4, 4, 3, 0])
    expect(capped.flat()).toHaveLength(MAX_LAB_SESSIONS_PER_TERM)
    expect(capped[3]).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('counts sessions the group already has', () => {
    expect(capSessionDates([week('2026-11', 4)], 13)).toEqual([['2026-11-01', '2026-11-02']])
    expect(capSessionDates([week('2026-11', 4)], 15)).toEqual([[]])
  })

  it('leaves a short term untouched', () => {
    expect(capSessionDates([week('2026-07', 2), week('2026-08', 3)])).toEqual([week('2026-07', 2), week('2026-08', 3)])
  })
})

describe('sessionSlotsUsed', () => {
  const occ = (id: number, status: WorkOccurrence['status']) => ({ id, status }) as WorkOccurrence

  it('counts scheduled, completed and absent lab days', () => {
    expect(sessionSlotsUsed([occ(1, 'scheduled'), occ(2, 'completed'), occ(3, 'absent')])).toBe(3)
  })

  it('skips holiday-cancelled, cancelled and rescheduled days', () => {
    expect(sessionSlotsUsed([occ(1, 'cancelled_holiday'), occ(2, 'cancelled_other'), occ(3, 'rescheduled'), occ(4, 'scheduled')])).toBe(1)
  })
})
