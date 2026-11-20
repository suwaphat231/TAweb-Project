import { describe, expect, it } from 'vitest'
import { daysUntilDeadline, deadlineInfo } from './postingDeadline'

const now = new Date(2026, 10, 19, 15, 0) // 19 Nov 2026, afternoon

describe('daysUntilDeadline', () => {
  it('counts calendar days, deadline day itself is 0', () => {
    expect(daysUntilDeadline('2026-11-19', now)).toBe(0)
    expect(daysUntilDeadline('2026-11-22', now)).toBe(3)
    expect(daysUntilDeadline('2026-11-18', now)).toBe(-1)
  })
})

describe('deadlineInfo', () => {
  it('returns null without a deadline or for drafts', () => {
    expect(deadlineInfo(undefined, 'open', now)).toBeNull()
    expect(deadlineInfo('2026-11-25', 'draft', now)).toBeNull()
  })
  it('flags soon, today, overdue and ok', () => {
    expect(deadlineInfo('2026-11-21', 'open', now)?.tone).toBe('soon')
    expect(deadlineInfo('2026-11-19', 'open', now)?.label).toBe('ปิดรับวันนี้')
    expect(deadlineInfo('2026-11-10', 'open', now)?.tone).toBe('overdue')
    expect(deadlineInfo('2026-12-30', 'open', now)?.tone).toBe('ok')
  })
  it('closed postings never show a countdown', () => {
    expect(deadlineInfo('2026-11-21', 'closed', now)?.tone).toBe('closed')
  })
})
