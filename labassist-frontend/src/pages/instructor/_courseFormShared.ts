import type { CreateCoursePayload } from '../../types'

export { GRADE_OPTIONS } from '../../utils/grades'

// Must track the admin import page's default academic year (AdminCourses.tsx)
// — a mismatch here means the section picker queries the wrong year and
// finds nothing, even though the instructor's real imported sections exist.
//
// status defaults to 'open' (not 'draft') because the create-posting form no
// longer shows a status picker — the button is literally "เปิดรับสมัคร", so
// submitting it must actually open the section, not silently leave it draft.
export const COURSE_FORM_EMPTY: CreateCoursePayload = {
  code: '', title: '', semester: '1', academic_year: 2569,
  labboy_slots: 0, status: 'open', description: '', requirements: '', deadline: '',
  require_grade_proof: false,
}

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
