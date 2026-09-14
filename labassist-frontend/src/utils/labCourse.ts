import type { Course } from '../types'

type LabCourse = Pick<Course, 'title' | 'english_title' | 'credits' | 'labboy_slots'>

export function isLabCourse(course: LabCourse): boolean {
  const titles = [course.title, course.english_title ?? '']
  if (titles.some((title) => {
    const normalized = title.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '')
    return /\bre(?:search|seach)\s+project\b/i.test(normalized)
      || normalized.replace(/\s/g, '').includes('โครงงานวิจัย')
      || /\bco[\s-]*operative\s+education\b/i.test(normalized)
      || normalized.replace(/\s/g, '').includes('สหกิจศึกษา')
  })) return false

  // Prefer recorded practice hours; staffing must not turn a lecture into a lab.
  const credits = course.credits?.normalize('NFKC').trim()
  const hours = credits?.match(/\(\s*\d+\s*[-–—]\s*(\d+)\s*[-–—]\s*\d+\s*\)/)
  if (hours) return Number(hours[1]) >= 2

  // Manually created courses do not have the spreadsheet's credit notation.
  return !credits && course.labboy_slots > 0
}
