import { describe, expect, it } from 'vitest'
import { getAppliedSection, getAppliedSections, groupCourseSections, groupSectionsByTime, timeOptionSecLabel } from './courseGrouping'
import type { Application, Course } from '../types'

describe('applications across recruitment rounds', () => {
  const course = {
    id: 1, posting_id: 20, code: 'TEST', title: 'Test', instructor_id: null,
    instructor_name: '', semester: '1', academic_year: 2569,
    labboy_slots: 2, labboy_accepted: 0, status: 'open',
    require_grade_proof: false, labboy_schedule_confirmed: false, created_at: '',
  } satisfies Course
  const group = groupCourseSections([course])[0]
  const oldApplication = {
    id: 1, course_id: 1, posting_id: 10, posting_active: false,
    status: 'accepted', student_id: 1, student_name: '', student_code: '',
    student_gpa: 3, course_code: 'TEST', course_title: 'Test',
    role_applied: 'labboy', applied_at: '',
  } satisfies Application

  it('allows applying again when the previous round was archived', () => {
    expect(getAppliedSection(group, [oldApplication])).toBeUndefined()
  })

  it('still shows the selected section for an application in the current round', () => {
    expect(getAppliedSection(group, [oldApplication, {
      ...oldApplication, id: 2, posting_id: 20, posting_active: true, status: 'pending',
    }])).toBe(course)
  })

  it('returns every section applied to when the student picked several times', () => {
    const sec2 = { ...course, id: 2, section: 2 }
    const sec3 = { ...course, id: 3, section: 3 }
    const multi = groupCourseSections([course, sec2, sec3])[0]
    const current = { ...oldApplication, posting_active: true, status: 'pending' } satisfies Application
    expect(getAppliedSections(multi, [
      { ...current, id: 2, course_id: 1 },
      { ...current, id: 3, course_id: 3 },
      { ...current, id: 4, course_id: 2, status: 'withdrawn' },
    ]).map((s) => s.id)).toEqual([1, 3])
  })
})

describe('groupSectionsByTime', () => {
  const base = {
    posting_id: 1, code: '517121', title: 'T', instructor_id: null, instructor_name: '',
    semester: '1', academic_year: 2569, labboy_slots: 1, labboy_accepted: 0, status: 'open',
    require_grade_proof: false, labboy_schedule_confirmed: false, created_at: '',
  } satisfies Omit<Course, 'id'>

  it('merges different sections that meet at the same time', () => {
    const options = groupSectionsByTime([
      { ...base, id: 1, section: 1, schedule: 'Mo 10:20 - 12:05 ร.วท.2' },
      { ...base, id: 2, section: 1, schedule: 'Tu 13:00 - 16:35 1227/1,1227/2 ว.1' },
      { ...base, id: 3, section: 2, schedule: 'Mo 10:20 - 12:05 ร.วท.2' },
      { ...base, id: 4, section: 2, schedule: 'We 13:00 - 16:35 1227/1,1227/2 ว.1' },
    ])
    expect(options.map((o) => o.sections.map((s) => s.id))).toEqual([[1, 3], [2], [4]])
    expect(timeOptionSecLabel(options[0])).toBe('Sec 1, 2')
    expect(options[0].schedule).toBe('Mo 10:20 - 12:05 ร.วท.2')
  })

  it('lists times by day of the week, then start time', () => {
    const options = groupSectionsByTime([
      { ...base, id: 1, section: 1, schedule: 'Fr 16:40 - 18:25 1334 ว.1' },
      { ...base, id: 2, section: 2, schedule: 'We 13:00 - 16:35 1227 ว.1' },
      { ...base, id: 3, section: 1, schedule: 'Mo 13:00 - 14:45 1239 ว.1' },
      { ...base, id: 4, section: 2, schedule: 'Mo 9:00 - 10:15 1239 ว.1' },
    ])
    expect(options.map((o) => o.sections[0].id)).toEqual([4, 3, 2, 1])
  })

  it('treats the same period in different rooms as one time', () => {
    const options = groupSectionsByTime([
      { ...base, id: 1, section: 1, schedule: 'Fr 16:40 - 18:25 1227/1,1227/2 ว.1' },
      { ...base, id: 2, section: 2, schedule: 'Fr 16:40 - 18:25 1334 ว.1' },
    ])
    expect(options).toHaveLength(1)
    expect(options[0].schedule).toBe('Fr 16:40 - 18:25 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1334 ว.1')
  })

  it('keeps sections without a schedule apart', () => {
    expect(groupSectionsByTime([{ ...base, id: 1, section: 1 }, { ...base, id: 2, section: 2 }])).toHaveLength(2)
  })
})
