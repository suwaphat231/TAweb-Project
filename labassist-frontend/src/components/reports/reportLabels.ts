import type { BadgeVariant } from '../ui/Badge'
import type { ReportCategory, ReportStatus, ReportReview, ReportResponse } from '../../types'

// Wording is deliberately neutral: a category is what was *reported*, and
// only CONFIRMED means a reviewer checked it. Never label a student by it.

export const statusInfo: Record<ReportStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  DRAFT:             { label: 'ฉบับร่าง',               variant: 'gray',   hint: 'ยังไม่ได้ส่ง มีเพียงผู้รายงานที่เห็น' },
  SUBMITTED:         { label: 'ส่งแล้ว รอตรวจสอบ',       variant: 'blue',   hint: 'ยังไม่ใช่ข้อสรุป รอผู้ตรวจสอบรับเรื่อง' },
  UNDER_REVIEW:      { label: 'อยู่ระหว่างตรวจสอบ',      variant: 'amber',  hint: 'ผู้ตรวจสอบกำลังพิจารณา ยังไม่ใช่ข้อสรุป' },
  AWAITING_RESPONSE: { label: 'รอคำชี้แจง/ข้อมูลเพิ่ม',  variant: 'amber',  hint: 'ผู้ตรวจสอบขอข้อมูลเพิ่มเติมก่อนพิจารณาต่อ' },
  CONFIRMED:         { label: 'ยืนยันผลการตรวจสอบแล้ว', variant: 'purple', hint: 'ผู้ตรวจสอบยืนยันรายงานพร้อมเหตุผลแล้ว' },
  NOT_SUBSTANTIATED: { label: 'ไม่ยืนยัน (ข้อมูลไม่เพียงพอ)', variant: 'green', hint: 'ข้อมูลไม่เพียงพอที่จะยืนยันข้อกล่าวอ้าง' },
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
  CONFIRM:                 'ยืนยันรายงาน',
  NOT_SUBSTANTIATED:       'ไม่ยืนยัน — ข้อมูลไม่เพียงพอ',
  REOPEN:                  'นำกลับมาตรวจสอบใหม่',
  DECLINE_RECONSIDERATION: 'คงผลเดิม (ไม่รับคำขอทบทวน)',
}

export const responseKindLabel: Record<ReportResponse['kind'], string> = {
  EXPLANATION:     'คำชี้แจงของนักศึกษา',
  RECONSIDERATION: 'คำขอทบทวน',
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
