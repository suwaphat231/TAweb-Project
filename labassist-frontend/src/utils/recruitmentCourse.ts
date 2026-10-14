const EXCLUDED_RECRUITMENT_CODES = new Set([
  '517392', '517493', '517494',
  '517791', '517793',
  '520393', '520493', '520494',
])

export function isRecruitmentExcludedCourse(course: { code: string }): boolean {
  return EXCLUDED_RECRUITMENT_CODES.has(course.code.trim())
}