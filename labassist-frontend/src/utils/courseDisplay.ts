// Classlist imports sometimes carry both the Thai and English course name in
// one string, e.g. "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1 (บ.คอม สนเทศปี6-8) COMPUTER
// PROGRAMMING SKILL I", and often trail off with a parenthetical note such as
// "(ล.สารสนเทศปี3ขึ้นไป (แนะนำให้นศ.นำคอมส่วนตัวที่มีgpuมาเรียน))". Instructors only
// want the plain English name shown, so trailing parenthetical notes are
// dropped first, then the trailing run of Latin letters/digits (the part
// after the last Thai character run) is pulled out. Falls back to the
// paren-stripped raw title when there is no English suffix to extract.
const TRAILING_ENGLISH = /[A-Za-z][A-Za-z0-9\s'\-]*$/

// Repeatedly removes a balanced "(...)" group from the end of the string
// (handles nested parens), so a trailing note doesn't leak into the display.
function stripTrailingParens(s: string): string {
  let result = s.trim()
  while (result.endsWith(')')) {
    let depth = 0
    let openIndex = -1
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i] === ')') depth++
      else if (result[i] === '(') {
        depth--
        if (depth === 0) {
          openIndex = i
          break
        }
      }
    }
    if (openIndex < 0) break // unbalanced — bail out rather than strip everything
    result = result.slice(0, openIndex).trim()
  }
  return result
}

// Some classlist imports have a dedicated English-name column (COURSENAME/
// อังกฤษ), which the backend stores separately as english_title instead of
// folding into title. Prefer that when present — it's already the clean
// English name — before falling back to extracting one out of title.
export function displayCourseTitle(title: string, englishTitle?: string): string {
  if (englishTitle?.trim()) return stripTrailingParens(englishTitle.trim())

  const withoutTrailingNote = stripTrailingParens(title?.trim() ?? '')
  const match = withoutTrailingNote.match(TRAILING_ENGLISH)
  if (!match) return withoutTrailingNote
  return stripTrailingParens(match[0].trim()) || withoutTrailingNote
}
