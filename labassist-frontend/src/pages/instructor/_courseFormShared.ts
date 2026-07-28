import type { CreateCoursePayload } from '../../types'

export const COURSE_FORM_EMPTY: CreateCoursePayload = {
  code: '', title: '', semester: '1', academic_year: 2567,
  ta_slots: 0, labboy_slots: 0, status: 'draft', description: '', requirements: '', deadline: '',
}

export const GRADE_OPTIONS = [
  { value: '', label: '-' },
  { value: 'D', label: 'D' },
  { value: 'D+', label: 'D+' },
  { value: 'C', label: 'C' },
  { value: 'C+', label: 'C+' },
  { value: 'B', label: 'B' },
  { value: 'B+', label: 'B+' },
  { value: 'A', label: 'A' },
]

const GRADE_PREFIX_RE = /^เกรดเฉลี่ยขั้นต่ำ:\s*(A|B|C|D)\s*\n?/

export function splitRequirements(requirements: string) {
  const match = requirements.match(GRADE_PREFIX_RE)
  if (!match) return { minGrade: '', rest: requirements }
  return { minGrade: match[1], rest: requirements.slice(match[0].length) }
}

export function joinRequirements(minGrade: string, rest: string) {
  const gradeText = minGrade ? `เกรดเฉลี่ยขั้นต่ำ: ${minGrade}` : ''
  return [gradeText, rest.trim()].filter(Boolean).join('\n')
}
