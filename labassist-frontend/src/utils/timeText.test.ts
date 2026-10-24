import { describe, expect, it } from 'vitest'
import { formatTyping, normalizeTime } from './timeText'

describe('formatTyping', () => {
  it('keeps digits only and adds the colon after the hour', () => {
    expect(formatTyping('13')).toBe('13')
    expect(formatTyping('130')).toBe('13:0')
    expect(formatTyping('1300')).toBe('13:00')
    expect(formatTyping('13:00')).toBe('13:00')
    expect(formatTyping('13.30น')).toBe('13:30')
    expect(formatTyping('130045')).toBe('13:00')
  })
})

describe('normalizeTime', () => {
  it('pads short entries to HH:MM', () => {
    expect(normalizeTime('9')).toBe('09:00')
    expect(normalizeTime('13')).toBe('13:00')
    expect(normalizeTime('93:0')).toBe('09:30')
    expect(normalizeTime('08:30')).toBe('08:30')
  })

  it('leaves impossible times as typed', () => {
    expect(normalizeTime('25')).toBe('25')
    expect(normalizeTime('12:75')).toBe('12:75')
  })
})
