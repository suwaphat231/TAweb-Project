import { describe, expect, it } from 'vitest'
import type { MakeupDay } from '../../types'
import { makeupProblem, pendingCount } from './makeupRules'

const day: MakeupDay = {
  occurrence_id: 1, staff_case_id: 1, schedule_group_id: 1, course_id: 1,
  course_code: '517122', course_title: 'วิชา', section: 1, semester: '2', academic_year: 2568,
  date: '2026-08-10', start_time: '13:00', end_time: '16:00', holiday_name: 'วันหยุด',
  status: 'pending', min_date: '2026-08-01', max_date: '2026-10-31',
  blocked_dates: ['2026-08-10', '2026-08-17'],
}

describe('makeupProblem', () => {
  it('accepts a free day inside the plan with the same or fewer hours', () => {
    expect(makeupProblem(day, '2026-09-08', '13:00', '16:00')).toBeNull()
    expect(makeupProblem(day, '2026-09-08', '09:00', '11:00')).toBeNull()
  })

  it('refuses days outside the plan, holidays and days already worked', () => {
    expect(makeupProblem(day, '', '13:00', '16:00')).toMatch('เลือกวันที่')
    expect(makeupProblem(day, '2026-11-02', '13:00', '16:00')).toMatch('ช่วงแผน')
    expect(makeupProblem(day, '2026-08-17', '13:00', '16:00')).toMatch('มีวันทำงานอยู่แล้ว')
  })

  it('keeps the current makeup date selectable when only the time changes', () => {
    const chosen: MakeupDay = {
      ...day, status: 'makeup', blocked_dates: [...day.blocked_dates, '2026-09-08'],
      makeup: { scheduled_date: '2026-09-08T00:00:00Z' } as MakeupDay['makeup'],
    }
    expect(makeupProblem(chosen, '2026-09-08', '13:00', '15:00')).toBeNull()
  })

  it('refuses a reversed time or more hours than the original day', () => {
    expect(makeupProblem(day, '2026-09-08', '16:00', '13:00')).toMatch('หลังเวลาเริ่ม')
    expect(makeupProblem(day, '2026-09-08', '13:00', '16:30')).toMatch('ไม่เกิน')
  })
})

it('pendingCount counts only undecided clashes', () => {
  expect(pendingCount([day, { ...day, status: 'makeup' }, { ...day, status: 'no_makeup' }, day])).toBe(2)
})
