import type { CourseStatus } from '../types'

export type DeadlineTone = 'ok' | 'soon' | 'overdue' | 'closed'

export interface DeadlineInfo {
  tone: DeadlineTone
  label: string
  /** Whole calendar days left; 0 = the deadline is today, negative = past. */
  days: number
}

/** A posting counts as "closing soon" when its deadline is within this many days. */
export const CLOSING_SOON_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Calendar days from today to the deadline day (deadline day itself is still open). */
export function daysUntilDeadline(deadline: string, now: Date = new Date()): number {
  return Math.round((startOfDay(new Date(deadline)) - startOfDay(now)) / DAY_MS)
}

/**
 * Describes a posting's deadline for display. Returns null when there is no
 * deadline to talk about (none set, or the posting is already closed/archived
 * so a countdown would be meaningless).
 */
export function deadlineInfo(deadline: string | undefined, status: CourseStatus, now: Date = new Date()): DeadlineInfo | null {
  if (!deadline) return null
  const days = daysUntilDeadline(deadline, now)
  if (status === 'closed' || status === 'archived') return { tone: 'closed', label: 'ปิดรับแล้ว', days }
  if (status === 'draft') return null
  if (days < 0) return { tone: 'overdue', label: 'เลยกำหนดแล้ว', days }
  if (days === 0) return { tone: 'soon', label: 'ปิดรับวันนี้', days }
  if (days <= CLOSING_SOON_DAYS) return { tone: 'soon', label: `ใกล้ปิดรับ · อีก ${days} วัน`, days }
  return { tone: 'ok', label: `อีก ${days} วัน`, days }
}
