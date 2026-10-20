import type { Course } from '../types'

export function termLabel(semester: string): string {
  return `ภาคเรียนที่ ${semester}`
}

// Terms of the given courses the student still has to save a schedule for
// (the backend flags those courses with schedule_missing), oldest first.
export function missingScheduleTerms(courses: Course[]): string[] {
  const terms = new Map<string, string>()
  for (const c of courses) {
    if (c.schedule_missing) terms.set(`${c.academic_year}|${c.semester}`, termLabel(c.semester))
  }
  return [...terms.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label)
}
