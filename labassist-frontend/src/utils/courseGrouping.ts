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

// Every section of the group the student holds an active (pending/accepted)
// application for in the current round. A student may apply to several
// times of one course, one application per section.
export function getAppliedSections(group: CourseGroup, apps: Application[]): Course[] {
  const appliedIds = new Set(
    apps
      .filter((a) => a.posting_active !== false && (a.status === 'pending' || a.status === 'accepted'))
      .map((a) => a.course_id),
  )
  return group.sections.filter((s) => appliedIds.has(s.id))
}

export function getAppliedSection(group: CourseGroup, apps: Application[]): Course | undefined {
  return getAppliedSections(group, apps)[0]
}

// A "time option" is every section of a posting that meets at the same
// time — e.g. Sec 1 and Sec 2 both "Mo 10:20 - 12:05" share one lecture, so
// instructors open and students pick them as a single choice. Rows stay
// separate underneath (own slot count/applications); only the choice merges.
export interface TimeOption {
  key: string
  /** Distinct schedule texts of the merged sections, one per line. */
  schedule: string
  sections: Course[]
}

const TIME_LINE_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/

// Day + start-end of every meeting line, ignoring the room, so the same
// period in different rooms still counts as the same time.
function scheduleTimeKey(schedule?: string): string {
  const lines = (schedule ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return lines
    .map((l) => {
      const m = TIME_LINE_RE.exec(l)
      return m ? `${m[1]} ${m[2].padStart(5, '0')}-${m[3].padStart(5, '0')}` : l
    })
    .sort()
    .join('|')
}

export function groupSectionsByTime(sections: Course[]): TimeOption[] {
  const map = new Map<string, Course[]>()
  for (const s of sections) {
    // No schedule means nothing to match on — keep the section on its own.
    const key = scheduleTimeKey(s.schedule) || `id:${s.id}`
    const arr = map.get(key)
    if (arr) arr.push(s)
    else map.set(key, [s])
  }
  return Array.from(map.entries())
    .map(([key, secs]) => ({
      key,
      schedule: Array.from(new Set(secs.map((s) => s.schedule?.trim() ?? '').filter(Boolean))).join('\n'),
      sections: secs,
    }))
    .sort((a, b) => timeSortKey(a.schedule).localeCompare(timeSortKey(b.schedule)))
}

const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// Earliest meeting as "<day index> <start>" so options list Mo → Su, then by
// start time; schedules without a recognisable day sort after the rest.
function timeSortKey(schedule: string): string {
  const keys = schedule.split('\n').flatMap((l) => {
    const m = TIME_LINE_RE.exec(l.trim())
    return m ? [`${DAY_ORDER.indexOf(m[1])} ${m[2].padStart(5, '0')}`] : []
  })
  return keys.length ? keys.sort()[0] : '9'
}

/** "Sec 1" / "Sec 1, 2" for the sections merged into one time option. */
export function timeOptionSecLabel(option: TimeOption): string {
  const secs = Array.from(new Set(option.sections.map((s) => s.section).filter((n): n is number => !!n))).sort((a, b) => a - b)
  return secs.length ? `Sec ${secs.join(', ')}` : ''
}
