// Spreadsheet imports sometimes append an admin-only remark straight onto
// the Thai title cell (e.g. "...\n(ล.คอมปี3ขึ้นไป (แนะนำ...))"), so the raw
// `title` field isn't fit for students to see as-is. Strip everything from
// the first "(" onward — parenthetical asides are never meant for the
// posting students browse to apply.
export function cleanCourseTitle(title: string): string {
  const parenIndex = title.indexOf('(')
  const truncated = parenIndex === -1 ? title : title.slice(0, parenIndex)
  return truncated.replace(/\s+/g, ' ').trim()
}
