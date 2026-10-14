import { describe, expect, it } from 'vitest'
import { isRecruitmentExcludedCourse } from './recruitmentCourse'

describe('recruitment course filtering', () => {
  it.each(['517392', '517493', '517494', '517791', '517793', '520393', '520493', '520494'])(
    'excludes course code %s',
    (code) => expect(isRecruitmentExcludedCourse({ code })).toBe(true),
  )

  it('keeps other course codes eligible', () => {
    expect(isRecruitmentExcludedCourse({ code: '517122' })).toBe(false)
  })
})