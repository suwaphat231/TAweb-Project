import type { BadgeVariant } from '../ui/Badge'
import type { ReportCategory, ReportStatus, ReportReview, ReportResponse } from '../../types'

// Wording is deliberately neutral: a category is what was *reported*.
// An instructor's own report is CONFIRMED as soon as they submit it. A
// report a student sends in is SUBMITTED until the course instructor
// confirms it or rejects it (NOT_SUBSTANTIATED). Older statuses stay
// labelled for old records.

export const statusInfo: Record<ReportStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  DRAFT:             { label: 'ฉบับร่าง',               variant: 'gray',   hint: 'ยังไม่ได้ส่ง มีเพียงผู้รายงานที่เห็น' },
  SUBMITTED:         { label: 'รออาจารย์ตรวจสอบ',        variant: 'blue',   hint: 'นักศึกษาส่งรายงานแล้ว ยังไม่มีผลจนกว่าอาจารย์ผู้สอนของรายวิชาจะยืนยัน' },
  UNDER_REVIEW:      { label: 'อยู่ระหว่างตรวจสอบ',      variant: 'amber',  hint: 'ผู้ตรวจสอบกำลังพิจารณา ยังไม่ใช่ข้อสรุป' },
  AWAITING_RESPONSE: { label: 'รอคำชี้แจง/ข้อมูลเพิ่ม',  variant: 'amber',  hint: 'ผู้ตรวจสอบขอข้อมูลเพิ่มเติมก่อนพิจารณาต่อ' },
  CONFIRMED:         { label: 'รายงานแล้ว', variant: 'purple', hint: 'รายงานมีผลแล้ว อาจารย์รายวิชาอื่นที่นักศึกษาสมัครจะเห็นว่านักศึกษาคนนี้ถูกรายงาน นักศึกษาที่ถูกรายงานได้รับแจ้ง (ไม่ระบุผู้รายงาน) และอุทธรณ์ได้ 1 ครั้งภายใน 7 วัน' },
  NOT_SUBSTANTIATED: { label: 'ไม่มีมูล', variant: 'green', hint: 'อาจารย์พิจารณาแล้วว่ารายงานนี้ไม่มีมูล (ไม่รับรายงาน หรือรับอุทธรณ์) ไม่มีผลต่อนักศึกษาที่ถูกรายงาน' },
  WITHDRAWN:         { label: 'ถอนรายงานแล้ว',           variant: 'gray',   hint: 'ผู้รายงานถอนรายงานพร้อมเหตุผล ไม่แสดงแก่อาจารย์คนอื่นแล้ว' },
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
  CONFIRM:                 'อาจารย์ยืนยันรายงาน',
  NOT_SUBSTANTIATED:       'อาจารย์ไม่รับรายงาน',
  REOPEN:                  'นำกลับมาตรวจสอบใหม่',
  DECLINE_RECONSIDERATION: 'คงผลเดิม (ไม่รับอุทธรณ์)',
}

export const responseKindLabel: Record<ReportResponse['kind'], string> = {
  EXPLANATION:     'คำชี้แจงของนักศึกษา',
  RECONSIDERATION: 'คำอุทธรณ์ของนักศึกษา',
  REPORTER_INFO:   'ข้อมูลเพิ่มเติมจากผู้รายงาน',
}

export function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function formatDateTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
