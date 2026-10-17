import type { FormReview } from '../types'

export interface StaffOfferingKey {
  year?: string
  semester?: string
  code?: string
  section?: string
  /** The course row (one meeting day) — sections meeting on several days have one row per day. */
  courseId?: string | null
}

/**
 * The review behind a staff course page. A section that meets on several
 * days is several courses sharing a section number, so the course id picks
 * the day; links without one (older bookmarks) fall back to the section.
 */
export function findStaffReview(reviews: FormReview[], key: StaffOfferingKey): FormReview | undefined {
  return reviews.find((r) =>
    String(r.academic_year) === key.year &&
    r.semester === key.semester &&
    r.course_code === key.code &&
    String(r.section) === key.section &&
    (!key.courseId || String(r.course_id) === key.courseId),
  )
}
