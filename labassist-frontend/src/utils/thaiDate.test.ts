import { describe, expect, it } from 'vitest'
import { formatThaiDate, formatThaiDateFull, thaiDayShort, toDateOnly } from './thaiDate'

describe('formatThaiDate', () => {
  it('formats a plain YYYY-MM-DD date', () => {
    expect(formatThaiDate('2026-10-01')).toBe('1 ต.ค. 2569')
  })

  it('handles RFC3339 by using only the date part', () => {
    expect(formatThaiDate('2026-10-01T00:00:00Z')).toBe('1 ต.ค. 2569')
  })

  it('handles RFC3339 with offset', () => {
    expect(formatThaiDate('2026-10-01T07:00:00+07:00')).toBe('1 ต.ค. 2569')
  })

  it('returns error string for undefined', () => {
    expect(formatThaiDate(undefined)).toBe('วันที่ไม่ถูกต้อง')
  })

  it('returns error string for null', () => {
    expect(formatThaiDate(null)).toBe('วันที่ไม่ถูกต้อง')
  })

  it('returns error string for empty string', () => {
    expect(formatThaiDate('')).toBe('วันที่ไม่ถูกต้อง')
  })

  it('returns error string for a non-date string', () => {
    expect(formatThaiDate('invalid')).toBe('วันที่ไม่ถูกต้อง')
  })

  it('formats January correctly (month index 1 → array index 0)', () => {
    expect(formatThaiDate('2026-01-15')).toBe('15 ม.ค. 2569')
  })

  it('formats December correctly', () => {
    expect(formatThaiDate('2026-12-31')).toBe('31 ธ.ค. 2569')
  })

  it('rejects month 13 as invalid', () => {
    expect(formatThaiDate('2026-13-01')).toBe('วันที่ไม่ถูกต้อง')
  })

  it('rejects day 32 as invalid', () => {
    expect(formatThaiDate('2026-10-32')).toBe('วันที่ไม่ถูกต้อง')
  })
})

describe('formatThaiDateFull', () => {
  it('uses full month name', () => {
    expect(formatThaiDateFull('2026-10-01')).toBe('1 ตุลาคม 2569')
  })

  it('handles RFC3339', () => {
    expect(formatThaiDateFull('2026-10-01T00:00:00Z')).toBe('1 ตุลาคม 2569')
  })

  it('returns error string for invalid input', () => {
    expect(formatThaiDateFull(undefined)).toBe('วันที่ไม่ถูกต้อง')
  })
})

describe('thaiDayShort — October 2026 Tuesday and Thursday', () => {
  it('Tuesday 6 Oct 2026 → อ.', () => {
    expect(thaiDayShort('2026-10-06')).toBe('อ.')
  })

  it('Thursday 1 Oct 2026 → พฤ.', () => {
    expect(thaiDayShort('2026-10-01')).toBe('พฤ.')
  })

  it('Sunday → อา.', () => {
    expect(thaiDayShort('2026-10-04')).toBe('อา.')
  })

  it('returns empty string for invalid input', () => {
    expect(thaiDayShort(undefined)).toBe('')
    expect(thaiDayShort('not-a-date')).toBe('')
  })
})

describe('toDateOnly', () => {
  it('passes through a plain date', () => {
    expect(toDateOnly('2026-10-01')).toBe('2026-10-01')
  })

  it('strips RFC3339 time component', () => {
    expect(toDateOnly('2026-10-01T00:00:00Z')).toBe('2026-10-01')
  })

  it('returns null for undefined', () => {
    expect(toDateOnly(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(toDateOnly('')).toBeNull()
  })
})

describe('Buddhist year conversion', () => {
  it('adds exactly 543 to gregorian year', () => {
    // 2026 + 543 = 2569
    expect(formatThaiDate('2026-10-01')).toContain('2569')
    // Ensure no double conversion
    expect(formatThaiDate('2026-10-01')).not.toContain('3112') // 2569 + 543 would be 3112
  })

  it('generated October 2569 dates are stored as 2026-10-DD', () => {
    // The gregorian year in the API value must be 2026, not 2569
    expect(toDateOnly('2026-10-07')).toBe('2026-10-07')
    expect(toDateOnly('2026-10-01')).toBe('2026-10-01')
  })

  it('no rendered output contains NaN', () => {
    const rfc3339 = '2026-10-01T00:00:00Z'
    expect(formatThaiDate(rfc3339)).not.toContain('NaN')
    expect(formatThaiDate(rfc3339)).not.toContain('undefined')
  })
})
