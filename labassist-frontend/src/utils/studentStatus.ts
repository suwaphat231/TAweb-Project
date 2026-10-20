/**
 * Whether a registrar student status (สถานภาพนักศึกษา) means the student is
 * enrolled as normal — the only status that may apply for Lab Boy. Mirrors
 * IsNormalStudentStatus in the backend.
 */
export function isNormalStudentStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').trim()
  if (s.includes('ไม่ปกติ')) return false
  return s.includes('ปกติ') || s.includes('กำลังศึกษา')
}
