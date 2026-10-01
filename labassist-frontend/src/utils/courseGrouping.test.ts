import { describe, expect, it } from 'vitest'
import { getAppliedSection, groupCourseSections } from './courseGrouping'
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
})
