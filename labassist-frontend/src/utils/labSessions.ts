import type { WorkOccurrence } from '../types'

// Mirrors models.MaxLabSessionsPerTerm: a term holds at most 15 lab sessions
// per schedule group (the server refuses more). A day that falls on a holiday
// takes a slot until a makeup day replaces it.
export const MAX_LAB_SESSIONS_PER_TERM = 15

const LAB_DAY = new Set<WorkOccurrence['status']>(['scheduled', 'completed', 'absent'])

/** Slots used toward MAX_LAB_SESSIONS_PER_TERM, counted like the server does. */
export function sessionSlotsUsed(occs: WorkOccurrence[]): number {
  const madeUp = new Set(occs.map((o) => o.rescheduled_from_occurrence_id).filter((id) => id != null))
  return occs.filter((o) => LAB_DAY.has(o.status) || (o.status === 'cancelled_holiday' && !madeUp.has(o.id))).length
}

/**
 * Trims each month's working dates (in term order) so the term holds at most
 * MAX_LAB_SESSIONS_PER_TERM sessions, counting `existing` sessions first.
 * Later months lose their dates once the cap is reached.
 */
export function capSessionDates(months: string[][], existing = 0): string[][] {
  let left = Math.max(0, MAX_LAB_SESSIONS_PER_TERM - existing)
  return months.map((dates) => {
    const kept = dates.slice(0, left)
    left -= kept.length
    return kept
  })
}
