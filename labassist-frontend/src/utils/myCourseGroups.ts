import type { Course, CourseRelation } from '../types'
import { parseSchedule, type ScheduleMeeting } from './schedule'

/** One course on the instructor's "วิชาของฉัน" page: every Sec they hold of it, from one source. */
export interface MyCourseGroup {
  key: string
  source: CourseRelation['source']
  /** First section — carries the shared code / title / term. */
  head: Course
  rels: CourseRelation[]
}

export function groupMyCourses(rels: CourseRelation[]): MyCourseGroup[] {
  const map = new Map<string, CourseRelation[]>()
  for (const r of rels) {
    const c = r.course
    const key = `${r.source}|${c.code}|${c.semester}|${c.academic_year}`
    const arr = map.get(key)
    if (arr) arr.push(r)
    else map.set(key, [r])
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      list.sort((a, b) => (a.course.section ?? 0) - (b.course.section ?? 0))
      return { key, source: list[0].source, head: list[0].course, rels: list }
    })
    .sort((a, b) =>
      b.head.academic_year - a.head.academic_year
      || b.head.semester.localeCompare(a.head.semester)
      || a.head.code.localeCompare(b.head.code))
}

/** One Section of a course. A Sec meeting on several days is several course rows. */
export interface MySection {
  /** Section number, or null when the rows carry none. */
  section: number | null
  rels: CourseRelation[]
  /** Every meeting of the Sec, deduplicated, Monday-first. */
  meetings: ScheduleMeeting[]
  /** Schedule text that couldn't be parsed — shown as-is rather than lost. */
  raw: string[]
}

const dayOrder = (d: number) => (d + 6) % 7

export function sectionsOf(rels: CourseRelation[]): MySection[] {
  const map = new Map<number | null, CourseRelation[]>()
  for (const r of rels) {
    const sec = r.course.section || null
    const arr = map.get(sec)
    if (arr) arr.push(r)
    else map.set(sec, [r])
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
    .map(([section, list]) => {
      const meetings: ScheduleMeeting[] = []
      const raw: string[] = []
      for (const r of list) {
        const text = (r.course.schedule ?? '').trim()
        if (!text) continue
        const parsed = parseSchedule(text)
        if (!parsed) {
          if (!raw.includes(text)) raw.push(text)
          continue
        }
        for (const m of parsed) {
          if (!meetings.some((x) => x.dayIndex === m.dayIndex && x.start === m.start && x.end === m.end && x.room === m.room)) meetings.push(m)
        }
      }
      meetings.sort((a, b) => dayOrder(a.dayIndex) - dayOrder(b.dayIndex) || a.start.localeCompare(b.start))
      return { section, rels: list, meetings, raw }
    })
}

/**
 * One meeting time of a Section, with every course row (slot) that carries
 * exactly that schedule text — duplicate rows fold into one line.
 */
export interface MySlot {
  rels: CourseRelation[]
  /** Parsed meetings of the row's schedule; empty when unparseable or blank. */
  meetings: ScheduleMeeting[]
  /** Schedule text that couldn't be parsed — shown verbatim, never reinterpreted. */
  raw: string | null
}

/**
 * The Section's meeting times, one line each: Monday-first, unparseable text
 * after them and rows without a schedule last. Times always come from the
 * rows' own course.schedule — nothing is inferred (e.g. lecture vs lab).
 */
export function sectionSlots(sec: MySection): MySlot[] {
  const byText = new Map<string, CourseRelation[]>()
  for (const r of sec.rels) {
    const text = (r.course.schedule ?? '').trim()
    const arr = byText.get(text)
    if (arr) arr.push(r)
    else byText.set(text, [r])
  }
  const rank = (s: MySlot) => (s.meetings.length > 0 ? 0 : s.raw ? 1 : 2)
  const firstMeeting = (s: MySlot) => {
    const m = s.meetings[0]
    return m ? dayOrder(m.dayIndex) * 1440 + Number(m.start.slice(0, 2)) * 60 + Number(m.start.slice(3, 5)) : 0
  }
  return Array.from(byText.entries())
    .map(([text, rels]): MySlot => {
      const parsed = text ? parseSchedule(text) : null
      return { rels, meetings: parsed ?? [], raw: text && !parsed ? text : null }
    })
    .sort((a, b) => rank(a) - rank(b) || firstMeeting(a) - firstMeeting(b))
}

/**
 * Curriculum suffixes written into a course code, e.g. "517122-165, -2560" →
 * ["165", "2560"]. The code itself is never changed: the classlist import keeps
 * one row per code string, so "517122" and "517122-165, -2560" stay distinct
 * courses (grouping keys on the full code, see groupMyCourses).
 */
export function curriculumSuffixes(code: string): string[] {
  return Array.from(code.matchAll(/-\s*([0-9A-Za-z]+)/g), (m) => m[1])
}

/** Full codes of other groups in the same source and term that share this group's title. */
export function sameTitleOtherCodes(groups: MyCourseGroup[], g: MyCourseGroup): string[] {
  const title = g.head.title.trim().toLowerCase()
  return groups
    .filter((o) => o !== g
      && o.source === g.source
      && o.head.semester === g.head.semester
      && o.head.academic_year === g.head.academic_year
      && o.head.code !== g.head.code
      && o.head.title.trim().toLowerCase() === title)
    .map((o) => o.head.code)
}

/**
 * Search used on "วิชาของฉัน": full code (so base code, "517122-165", "-2560",
 * "165" all hit), Thai/English title, or a section number ("2", "sec 2").
 */
export function matchesMyCourse(c: Pick<Course, 'code' | 'title' | 'english_title' | 'section'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || (c.english_title ?? '').toLowerCase().includes(q)) return true
  const sec = /^(?:sec(?:tion)?\.?\s*|กลุ่ม\s*)?(\d+)$/.exec(q)?.[1]
  return !!sec && !!c.section && String(c.section) === sec
}
