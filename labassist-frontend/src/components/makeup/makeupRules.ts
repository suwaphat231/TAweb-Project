import type { MakeupDay } from '../../types'

function minutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Why a makeup choice would be refused, or null when it is fine. Mirrors the
 * server rules (database/makeup_days.go) so the form can say so before saving.
 */
export function makeupProblem(day: MakeupDay, date: string, start: string, end: string): string | null {
  if (!date) return 'กรุณาเลือกวันที่'
  if (date < day.min_date || date > day.max_date) return 'วันชดเชยต้องอยู่ในช่วงแผนปฏิบัติงาน'
  const current = day.makeup?.scheduled_date.slice(0, 10)
  if (date !== current && day.blocked_dates.includes(date)) return 'วันที่เลือกเป็นวันหยุดหรือมีวันทำงานอยู่แล้ว'
  const s = minutes(start), e = minutes(end)
  if (s === null || e === null || e <= s) return 'เวลาเลิกต้องหลังเวลาเริ่ม'
  const os = minutes(day.start_time), oe = minutes(day.end_time)
  if (os !== null && oe !== null && e - s > oe - os) return 'ชั่วโมงวันชดเชยต้องไม่เกินชั่วโมงของวันเดิม'
  return null
}

/** react-query key of the instructor's makeup day list (page + sidebar badge). */
export const MAKEUP_DAYS_KEY = ['instructor-makeup-days']

export function pendingCount(days: MakeupDay[]): number {
  return days.filter((d) => d.status === 'pending').length
}
