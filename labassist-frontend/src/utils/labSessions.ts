import type { WorkOccurrence } from '../types'

// Mirrors models.MaxLabSessionsPerTerm: a term holds at most 15 lab sessions
// per schedule group (the server refuses more). Holiday-cancelled days do not
// take a slot.
export const MAX_LAB_SESSIONS_PER_TERM = 15

const LAB_DAY = new Set<WorkOccurrence['status']>(['scheduled', 'completed', 'absent'])

/** Slots used toward MAX_LAB_SESSIONS_PER_TERM, counted like the server does. */
export function sessionSlotsUsed(occs: WorkOccurrence[]): number {
  return occs.filter((o) => LAB_DAY.has(o.status)).length
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
