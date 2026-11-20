import { describe, expect, it } from 'vitest'
import type { Course, CourseRelation } from '../types'
import { curriculumSuffixes, groupMyCourses, matchesMyCourse, sameTitleOtherCodes, sectionSlots, sectionsOf } from './myCourseGroups'

let nextId = 1
function rel(p: Partial<Course> & { source?: CourseRelation['source'] }): CourseRelation {
  const { source = 'imported', ...c } = p
  const id = nextId++
  return {
    id,
    source,
    created_at: '',
    course: { id, code: '517122', title: 'Prog', semester: '1', academic_year: 2569, section: 1, ...c } as Course,
  }
}

describe('groupMyCourses', () => {
  it('groups sections of the same course', () => {
    const g = groupMyCourses([rel({ section: 2 }), rel({ section: 1 })])
    expect(g).toHaveLength(1)
    expect(g[0].rels.map((r) => r.course.section)).toEqual([1, 2])
  })

  it('separates semesters and sources', () => {
    const g = groupMyCourses([rel({}), rel({ semester: '2' }), rel({ source: 'self_added' })])
    expect(g).toHaveLength(3)
  })

  it('sorts newest term first then code', () => {
    const g = groupMyCourses([
      rel({ code: '500001', academic_year: 2568 }),
      rel({ code: '517200' }),
      rel({ code: '517100' }),
      rel({ code: '517300', semester: '2' }),
    ])
    expect(g.map((x) => x.head.code)).toEqual(['517300', '517100', '517200', '500001'])
  })
})

describe('sectionsOf', () => {
  it('merges the per-day rows of one Sec and orders meetings Monday-first', () => {
    const secs = sectionsOf([
      rel({ section: 1, schedule: 'Fr 08:30 - 10:15 1227/1' }),
      rel({ section: 1, schedule: 'Mo 09:00 - 12:00' }),
      rel({ section: 2, schedule: 'Tu 14:50 - 16:35 1227/1' }),
    ])
    expect(secs.map((s) => s.section)).toEqual([1, 2])
    expect(secs[0].rels).toHaveLength(2)
    expect(secs[0].meetings.map((m) => [m.dayIndex, m.start, m.room])).toEqual([[1, '09:00', ''], [5, '08:30', '1227/1']])
  })

  it('dedupes identical meetings and keeps unparseable text', () => {
    const [s] = sectionsOf([
      rel({ section: 1, schedule: 'Mo 09:00 - 12:00' }),
      rel({ section: 1, schedule: 'Mo 09:00 - 12:00' }),
      rel({ section: 1, schedule: 'ตามตกลง' }),
    ])
    expect(s.meetings).toHaveLength(1)
    expect(s.raw).toEqual(['ตามตกลง'])
  })

  it('handles rows without section or schedule', () => {
    const [s] = sectionsOf([rel({ section: 0, schedule: '' })])
    expect(s.section).toBeNull()
    expect(s.meetings).toEqual([])
    expect(s.raw).toEqual([])
  })
})

describe('sectionSlots', () => {
  it('one row per distinct meeting time, Monday-first, duplicates folded together', () => {
    const [sec] = sectionsOf([
      rel({ section: 1, schedule: 'Fr 08:30 - 10:15 1227/1,1227/2 ว.1' }),
      rel({ section: 1, schedule: 'Tu 14:50 - 16:35 1227/1,1227/2 ว.1' }),
      rel({ section: 1, schedule: 'Tu 14:50 - 16:35 1227/1,1227/2 ว.1' }),
    ])
    const slots = sectionSlots(sec)
    expect(slots.map((s) => s.meetings.map((m) => [m.dayIndex, m.start, m.room]))).toEqual([
      [[2, '14:50', '1227/1,1227/2 ว.1']],
      [[5, '08:30', '1227/1,1227/2 ว.1']],
    ])
    expect(slots[0].rels).toHaveLength(2)
    expect(slots[1].rels).toHaveLength(1)
  })

  it('keeps unparseable text as-is and empty schedules last, never inventing a time', () => {
    const [sec] = sectionsOf([
      rel({ section: 2, schedule: '' }),
      rel({ section: 2, schedule: 'ตามตกลง' }),
      rel({ section: 2, schedule: 'We 10:20 - 12:05' }),
    ])
    const slots = sectionSlots(sec)
    expect(slots.map((s) => [s.meetings.length, s.raw])).toEqual([[1, null], [0, 'ตามตกลง'], [0, null]])
  })

  it('a single-row section gives a single slot', () => {
    const [sec] = sectionsOf([rel({ section: 1, schedule: 'Mo 09:00 - 12:00' })])
    expect(sectionSlots(sec)).toHaveLength(1)
  })
})

// Real codes from the classlist import: one row per curriculum code string.
const MERGED = '517122-165, -2560'

describe('curriculum codes', () => {
  it('keeps different full codes in separate groups, codes untouched', () => {
    const g = groupMyCourses([
      rel({ code: '517122', section: 1 }),
      rel({ code: MERGED, section: 1 }),
      rel({ code: MERGED, section: 2 }),
    ])
    expect(g.map((x) => x.head.code).sort()).toEqual(['517122', MERGED])
    const merged = g.find((x) => x.head.code === MERGED)!
    expect(merged.rels.every((r) => r.course.code === MERGED)).toBe(true)
    expect(sectionsOf(merged.rels).map((s) => s.section)).toEqual([1, 2])
  })

  it('does not merge the same full code across terms', () => {
    expect(groupMyCourses([rel({ code: MERGED }), rel({ code: MERGED, semester: '2' }), rel({ code: MERGED, academic_year: 2568 })])).toHaveLength(3)
  })

  it('reads curriculum suffixes from the code without changing it', () => {
    expect(curriculumSuffixes(MERGED)).toEqual(['165', '2560'])
    expect(curriculumSuffixes('517122')).toEqual([])
    expect(curriculumSuffixes('517122-165')).toEqual(['165'])
  })

  it('finds other codes with the same title in the same term', () => {
    const g = groupMyCourses([
      rel({ code: '517122', title: 'ทักษะ 2' }),
      rel({ code: MERGED, title: 'ทักษะ 2' }),
      rel({ code: MERGED, title: 'ทักษะ 2', semester: '1' }),
      rel({ code: '517999', title: 'อื่น' }),
    ])
    const plain = g.find((x) => x.head.code === '517122')!
    expect(sameTitleOtherCodes(g, plain)).toEqual([MERGED])
    expect(sameTitleOtherCodes(g, g.find((x) => x.head.code === '517999')!)).toEqual([])
  })

  it('ignores same-title codes from another term or source', () => {
    const g = groupMyCourses([
      rel({ code: '517122', title: 'ทักษะ 2' }),
      rel({ code: MERGED, title: 'ทักษะ 2', semester: '2' }),
      rel({ code: MERGED, title: 'ทักษะ 2', source: 'self_added' }),
    ])
    expect(sameTitleOtherCodes(g, g.find((x) => x.head.code === '517122')!)).toEqual([])
  })

  it('keeps each curriculum\'s sections and schedule to its own card', () => {
    const g = groupMyCourses([
      rel({ code: '517122', section: 1, schedule: '' }),
      rel({ code: MERGED, section: 1, schedule: 'Tu 14:50 - 16:35 1227/1' }),
      rel({ code: MERGED, section: 3, schedule: 'Th 09:00 - 12:00' }),
    ])
    const plain = sectionsOf(g.find((x) => x.head.code === '517122')!.rels)
    const merged = sectionsOf(g.find((x) => x.head.code === MERGED)!.rels)
    expect(plain.map((s) => s.section)).toEqual([1])
    expect(plain[0].meetings).toEqual([])
    expect(merged.map((s) => [s.section, s.meetings.length])).toEqual([[1, 1], [3, 1]])
    expect(merged.flatMap((s) => s.rels).every((r) => r.course.code === MERGED)).toBe(true)
  })
})

describe('matchesMyCourse', () => {
  const c = { code: MERGED, title: 'ทักษะการเขียนโปรแกรม 2', english_title: 'COMPUTER PROGRAMMING SKILL II', section: 2 } as Course
  it.each(['517122', '517122-165', '-2560', '165', '2560', 'ทักษะ', 'skill ii', '2', 'sec 2', ''])('matches "%s"', (q) => {
    expect(matchesMyCourse(c, q)).toBe(true)
  })
  it.each(['517121', 'sec 3', '-999'])('does not match "%s"', (q) => {
    expect(matchesMyCourse(c, q)).toBe(false)
  })
  it('curriculum suffix queries do not hit the plain base code', () => {
    const plain = { ...c, code: '517122', section: 1 } as Course
    expect(matchesMyCourse(plain, '517122')).toBe(true)
    expect(matchesMyCourse(plain, '-165')).toBe(false)
    expect(matchesMyCourse(plain, '-2560')).toBe(false)
  })
})
