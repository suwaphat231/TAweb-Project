const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const

const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const

/** Parse the Gregorian year, 1-based month, and day from a YYYY-MM-DD string (or
 *  RFC3339 — only the first 10 characters are used). Returns null on any failure. */
function parseYMD(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Validate against actual calendar boundaries.
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return { year, month, day }
}

/**
 * Format a date string (YYYY-MM-DD or RFC3339) as a Thai short date.
 * Example: "2026-10-01" → "1 ต.ค. 2569"
 */
export function formatThaiDate(value: string | null | undefined): string {
  const ymd = parseYMD(value)
  if (!ymd) return 'วันที่ไม่ถูกต้อง'
  return `${ymd.day} ${THAI_MONTHS_SHORT[ymd.month - 1]} ${ymd.year + 543}`
}

/**
 * Format a date string (YYYY-MM-DD or RFC3339) as a full Thai date.
 * Example: "2026-10-01" → "1 ตุลาคม 2569"
 */
export function formatThaiDateFull(value: string | null | undefined): string {
  const ymd = parseYMD(value)
  if (!ymd) return 'วันที่ไม่ถูกต้อง'
  return `${ymd.day} ${THAI_MONTHS[ymd.month - 1]} ${ymd.year + 543}`
}

/**
 * Return the Thai day-of-week abbreviation for a date string (YYYY-MM-DD or RFC3339).
 * Example: "2026-10-01" (Thursday) → "พฤ."
 */
export function thaiDayShort(value: string | null | undefined): string {
  const ymd = parseYMD(value)
  if (!ymd) return ''
  const dow = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay()
  return THAI_DAYS_SHORT[dow]
}

/**
 * Normalize any date value to a plain YYYY-MM-DD string,
 * stripping time and timezone components. Returns null if the value is
 * absent or does not contain a valid date.
 */
export function toDateOnly(value: string | null | undefined): string | null {
  const ymd = parseYMD(value)
  if (!ymd) return null
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`
}
