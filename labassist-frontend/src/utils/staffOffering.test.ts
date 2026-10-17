import { describe, expect, it } from 'vitest'
import { findStaffReview } from './staffOffering'
import type { FormReview } from '../types'

// 517122 sec 1 meets Tue and Thu, so it is two courses that share a section.
const base = {
  reviewer_id: 0, status: 'pending', updated_at: '', course_code: '517122',
  course_title: 'Programming Skill 2', section: 1, semester: '1', academic_year: 2569,
  instructor_name: '', labboy_slots: 6, submitted_at: '',
} satisfies Omit<FormReview, 'id' | 'course_id' | 'labboy_accepted'>
const thursday: FormReview = { ...base, id: 2, course_id: 84, labboy_accepted: 0 }
const tuesday: FormReview = { ...base, id: 1, course_id: 83, labboy_accepted: 6 }
const key = { year: '2569', semester: '1', code: '517122', section: '1' }

describe('findStaffReview', () => {
  it('opens the exact day the staff member clicked, not the first row of the section', () => {
    expect(findStaffReview([thursday, tuesday], { ...key, courseId: '83' })).toBe(tuesday)
    expect(findStaffReview([tuesday, thursday], { ...key, courseId: '84' })).toBe(thursday)
  })

  it('does not fall back to another day when the course id does not match', () => {
    expect(findStaffReview([thursday, tuesday], { ...key, courseId: '999' })).toBeUndefined()
  })

  it('still resolves old links without a course id when the section has a single row', () => {
    const only = { ...tuesday, course_code: '517121' }
    expect(findStaffReview([only], { ...key, code: '517121' })).toBe(only)
  })
})
