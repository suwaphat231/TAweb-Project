import type { Application, Course, CourseStatus } from '../types'

// A "posting" is one recruiting announcement; each section an instructor
// teaches for the same course/semester/instructor is a separate Course row
// under the hood (own schedule + own Lab Boy slot count), but students must
// see and apply through a single combined post, picking whichever section
// fits their schedule.
export interface CourseGroup {
  key: string
  code: string
  title: string
  english_title?: string
  instructor_name: string
  semester: string
  academic_year: number
  status: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
  requireGradeProof: boolean
  totalSlots: number
  totalAccepted: number
  sections: Course[]
}

const STATUS_RANK: Record<CourseStatus, number> = {
  open: 0,
  closing_soon: 1,
  closed: 2,
  draft: 3,
  archived: 4,
}

export function groupCourseKey(c: Course): string {
  return `${c.code}__${c.semester}__${c.academic_year}__${c.instructor_id}`
}

export function groupCourseSections(courses: Course[]): CourseGroup[] {
  const map = new Map<string, Course[]>()
  for (const c of courses) {
    const key = groupCourseKey(c)
    const arr = map.get(key)
    if (arr) arr.push(c)
    else map.set(key, [c])
  }

  return Array.from(map.entries()).map(([key, sections]) => {
    sections.sort((a, b) => (a.section ?? 0) - (b.section ?? 0))
    // The "headline" status/description/etc. come from whichever section is
    // furthest along in accepting applications (open beats draft, etc.) so
    // the merged card reflects the most actionable state.
    const primary = sections.reduce((best, c) => (STATUS_RANK[c.status] < STATUS_RANK[best.status] ? c : best), sections[0])
    const deadlines = sections.map((s) => s.deadline).filter((d): d is string => !!d).sort()

    return {
      key,
      code: primary.code,
      title: primary.title,
      english_title: primary.english_title,
      instructor_name: primary.instructor_name,
      semester: primary.semester,
      academic_year: primary.academic_year,
      status: primary.status,
      deadline: deadlines[0],
      description: primary.description,
      requirements: primary.requirements,
      requireGradeProof: primary.require_grade_proof,
      totalSlots: sections.reduce((s, c) => s + c.labboy_slots, 0),
      totalAccepted: sections.reduce((s, c) => s + c.labboy_accepted, 0),
      sections,
    }
  })
}

// A student can only hold one active application per posting — match by any
// section belonging to the group, not just one specific course row.
export function getAppliedSection(group: CourseGroup, apps: Application[]): Course | undefined {
  const sectionIds = new Set(group.sections.map((s) => s.id))
  const app = apps.find((a) => sectionIds.has(a.course_id) && a.status !== 'withdrawn')
  if (!app) return undefined
  return group.sections.find((s) => s.id === app.course_id)
}
