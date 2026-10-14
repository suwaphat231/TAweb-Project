import { describe, expect, it } from 'vitest'
import { daysLeft, isoDateFrom, penaltyInfo } from './reportLabels'
import type { PenaltyStatus } from '../../types'

describe('appeal helpers', () => {
  it('labels every penalty status', () => {
    const all: PenaltyStatus[] = ['blacklisted', 'appeal_pending', 'appeal_approved', 'appeal_rejected', 'appeal_more_info']
    for (const s of all) expect(penaltyInfo[s].label).toBeTruthy()
    expect(penaltyInfo.appeal_pending.label).toBe('รอพิจารณาอุทธรณ์')
  })

  it('formats a local date some days ahead, across month ends', () => {
    expect(isoDateFrom(1, new Date(2026, 0, 31))).toBe('2026-02-01')
    expect(isoDateFrom(180, new Date(2026, 9, 14))).toBe('2027-04-12')
  })

  it('counts whole days left on the 15-day appeal window, never negative', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(daysLeft('2026-10-29T00:00:00Z', now)).toBe(15)
    expect(daysLeft('2026-10-14T06:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})
