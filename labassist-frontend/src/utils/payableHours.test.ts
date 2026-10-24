import { describe, expect, it } from 'vitest'
import { payableHours, payableMinutes } from './payableHours'

describe('payableMinutes', () => {
  it('rounds a partial hour up from the start time', () => {
    expect(payableMinutes('13:00', '16:35')).toBe(240)
    expect(payableMinutes('09:00', '12:10')).toBe(240)
    expect(payableMinutes('08:30', '10:20')).toBe(120)
  })
  it('keeps whole hours as they are', () => {
    expect(payableMinutes('13:00', '17:00')).toBe(240)
  })
  it('returns 0 for empty or reversed ranges', () => {
    expect(payableMinutes('13:00', '13:00')).toBe(0)
    expect(payableMinutes('16:00', '13:00')).toBe(0)
    expect(payableMinutes('', '16:35')).toBe(0)
  })
})

describe('payableHours', () => {
  it('pays 13:00–16:35 as 4 hours', () => {
    expect(payableHours('13:00', '16:35')).toBe(4)
  })
})
