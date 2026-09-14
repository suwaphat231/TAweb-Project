import { describe, expect, it } from 'vitest'
import { isLabCourse } from './labCourse'

describe('admin lab course filtering', () => {
  const course = { title: 'Programming', credits: '3 (2-2-5)', labboy_slots: 0 }

  it.each([
    { title: 'RESEARCH PROJECT I' },
    { title: 'Research\n Project II' },
    { title: 'reseach project' },
    { title: 'เตรียม โครงงาน วิจัย' },
    { english_title: 'PREPARATION OF RESEARCH PROJECT' },
    { title: 'COOPERATIVE EDUCATION' },
    { title: 'สหกิจศึกษา' },
  ])('excludes research projects even with practice hours and staffing: %j', (names) => {
    expect(isLabCourse({ ...course, ...names, labboy_slots: 2 })).toBe(false)
  })

  it('excludes lectures even when staff slots were assigned', () => {
    expect(isLabCourse({ ...course, credits: '3 (3-0-6)', labboy_slots: 2 })).toBe(false)
  })

  it.each(['3 (2-2-5)', '3 ( 2 - 2 - 5 )', '3 (2–2–5)'])('retains labs with credits %s', (credits) => {
    expect(isLabCourse({ ...course, credits })).toBe(true)
  })

  it('retains manually added courses with staffing and no credits', () => {
    expect(isLabCourse({ ...course, credits: '', labboy_slots: 1 })).toBe(true)
    expect(isLabCourse({ ...course, credits: '', labboy_slots: 0 })).toBe(false)
  })
})
