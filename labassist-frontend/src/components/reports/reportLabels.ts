import type { BadgeVariant } from '../ui/Badge'
import type { BlacklistAppealEvent, PenaltyStatus, ReportCategory, ReportStatus, ReportReview, ReportResponse } from '../../types'

// Wording is deliberately neutral: a category is what was *reported*, and
// only CONFIRMED (Blacklist) means the course's instructor decided on it.
// Never label a student by an undecided report.

export const statusInfo: Record<ReportStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  DRAFT:             { label: 'ฉบับร่าง',               variant: 'gray',   hint: 'ยังไม่ได้ส่ง มีเพียงผู้รายงานที่เห็น' },
  SUBMITTED:         { label: 'รออาจารย์พิจารณา',        variant: 'blue',   hint: 'ยังไม่ใช่ข้อสรุป รออาจารย์ประจำวิชาพิจารณาว่าจะ Blacklist หรือยกรายงาน' },
  UNDER_REVIEW:      { label: 'อาจารย์กำลังพิจารณา',      variant: 'amber',  hint: 'อาจารย์ประจำวิชากำลังพิจารณา ยังไม่ใช่ข้อสรุป' },
  AWAITING_RESPONSE: { label: 'รอคำชี้แจง/ข้อมูลเพิ่ม',  variant: 'amber',  hint: 'อาจารย์ประจำวิชาขอข้อมูลเพิ่มเติมก่อนพิจารณาต่อ' },
  CONFIRMED:         { label: 'Blacklist แล้ว',          variant: 'red',    hint: 'อาจารย์ประจำวิชา Blacklist แล้ว — อาจารย์รายวิชาอื่นจะเห็นว่านักศึกษาคนนี้เคยโดนรีพอร์ท' },
  NOT_SUBSTANTIATED: { label: 'ยกรายงาน',                variant: 'green',  hint: 'อาจารย์ประจำวิชาพิจารณาแล้วไม่ Blacklist — ไม่มีผลต่อประวัติของนักศึกษา' },
  WITHDRAWN:         { label: 'ถอนรายงานแล้ว',           variant: 'gray',   hint: 'ผู้รายงานถอนรายงานพร้อมเหตุผล' },
}

export const categoryLabel: Record<ReportCategory, string> = {
  ABSENCE:                'ขาดการปฏิบัติงาน',
  LATE_NOTICE:            'ไม่แจ้งล่วงหน้า / แจ้งล่าช้า',
  DUTY_NEGLECT:           'ไม่ปฏิบัติหน้าที่ตามที่ได้รับมอบหมาย',
  UNPROFESSIONAL_CONDUCT: 'พฤติกรรมไม่เหมาะสมระหว่างปฏิบัติงาน',
  OTHER:                  'อื่น ๆ',
}

export const categoryOptions = (Object.keys(categoryLabel) as ReportCategory[])
  .map((value) => ({ value, label: categoryLabel[value] }))

export const decisionLabel: Record<ReportReview['decision'], string> = {
  REQUEST_INFO:            'ขอข้อมูลเพิ่มเติม',
  CONFIRM:                 'Blacklist',
  NOT_SUBSTANTIATED:       'ยกรายงาน (ไม่ Blacklist)',
  REOPEN:                  'นำกลับมาพิจารณาใหม่',
  // From the old reconsideration step; kept so earlier records still read.
  DECLINE_RECONSIDERATION: 'คง Blacklist เดิม (ไม่รับคำขอทบทวน)',
}

export const responseKindLabel: Record<ReportResponse['kind'], string> = {
  EXPLANATION:     'คำชี้แจงของนักศึกษา',
  RECONSIDERATION: 'คำขอทบทวน',
  REPORTER_INFO:   'ข้อมูลเพิ่มเติมจากผู้รายงาน',
}

export const penaltyInfo: Record<PenaltyStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  blacklisted:      { label: 'ถูก Blacklist',         variant: 'red',   hint: 'ยื่นอุทธรณ์ได้ภายใน 15 วันนับจากวันที่ถูก Blacklist' },
  appeal_pending:   { label: 'รอพิจารณาอุทธรณ์',      variant: 'amber', hint: 'อาจารย์ประจำวิชากำลังพิจารณาอุทธรณ์ ระหว่างนี้แก้ไขหรือยื่นซ้ำไม่ได้' },
  appeal_more_info: { label: 'อาจารย์ขอข้อมูลเพิ่มเติม', variant: 'blue',  hint: 'ส่งข้อมูลหรือหลักฐานเพิ่มเติมเพื่อให้อาจารย์พิจารณาต่อ' },
  appeal_approved:  { label: 'อุทธรณ์อนุมัติ — ยกเลิก Blacklist', variant: 'green', hint: 'Blacklist ถูกยกเลิกแล้ว ไม่แสดงว่าเคยโดนรีพอร์ทจากรายงานนี้' },
  appeal_rejected:  { label: 'อุทธรณ์ไม่อนุมัติ',       variant: 'gray',  hint: 'Blacklist ยังมีผลจนถึงวันสิ้นสุด' },
}

export const appealEventLabel: Record<BlacklistAppealEvent['kind'], string> = {
  SUBMIT:       'ยื่นอุทธรณ์',
  REQUEST_INFO: 'อาจารย์ขอข้อมูลเพิ่มเติม',
  STUDENT_INFO: 'นักศึกษาส่งข้อมูลเพิ่มเติม',
  APPROVE:      'อนุมัติอุทธรณ์ — ยกเลิก Blacklist',
  REJECT:       'ไม่อนุมัติอุทธรณ์',
}

/** Default end date for a new blacklisting, matching the server's 180 days. */
export const DEFAULT_BLACKLIST_DAYS = 180

/** A local calendar date `days` from `from`, as YYYY-MM-DD. */
export function isoDateFrom(days: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days left until `deadline` (0 once it has passed). */
export function daysLeft(deadline: string, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000))
}

export function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function formatDateTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
