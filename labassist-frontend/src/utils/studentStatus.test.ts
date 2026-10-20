import { describe, expect, it } from 'vitest'
import { isNormalStudentStatus } from './studentStatus'

describe('isNormalStudentStatus', () => {
  it('accepts normal enrolment', () => {
    expect(isNormalStudentStatus('ปกติ')).toBe(true)
    expect(isNormalStudentStatus('กำลังศึกษา')).toBe(true)
  })

  it('rejects every other status', () => {
    for (const s of ['ไม่ปกติ', 'พ้นสภาพ', 'ลาพักการศึกษา', 'สำเร็จการศึกษา', '', undefined]) {
      expect(isNormalStudentStatus(s)).toBe(false)
    }
  })
})
