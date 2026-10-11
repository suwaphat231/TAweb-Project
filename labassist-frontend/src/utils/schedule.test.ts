import { describe, expect, it } from 'vitest'
import { formatSchedule, parseSchedule } from './schedule'

describe('formatSchedule', () => {
  it('formats the classlist import format with its room', () => {
    expect(formatSchedule('Tu 13:00 - 16:35 1227/1,1227/2 ว.1')).toBe('อังคาร 13:00–16:35 · ห้อง 1227/1,1227/2 ว.1')
  })
  it('formats instructor-entered Thai the same way', () => {
    expect(formatSchedule('พฤ 13:00-16:00')).toBe('พฤหัส 13:00–16:00')
    expect(formatSchedule('อ 9:00-12:00')).toBe('อังคาร 09:00–12:00')
  })
  it('expands comma-separated Thai days', () => {
    expect(formatSchedule('จ,พ,ศ 09:00-12:00')).toBe('จันทร์ 09:00–12:00\nพุธ 09:00–12:00\nศุกร์ 09:00–12:00')
  })
  it('merges periods on one day and orders days Monday first', () => {
    expect(formatSchedule('Su 08:30 - 12:05 1639\nWe 10:20 - 12:05 1227\nWe 08:30 - 10:15 1227')).toBe(
      'พุธ 08:30–10:15, 10:20–12:05 · ห้อง 1227\nอาทิตย์ 08:30–12:05 · ห้อง 1639',
    )
  })
  it('can drop rooms and join days on one line', () => {
    expect(formatSchedule('Mo 10:20 - 12:05 1239\nTh 13:00 - 14:45 1334', { room: false, separator: ' / ' })).toBe(
      'จันทร์ 10:20–12:05 / พฤหัส 13:00–14:45',
    )
  })
  it('returns unrecognised text unchanged', () => {
    expect(formatSchedule('TBA')).toBe('TBA')
    expect(formatSchedule('')).toBe('')
    expect(parseSchedule('Mo 10:00 - 11:00\nnot a time')).toBeNull()
  })
})
