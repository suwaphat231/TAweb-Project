// One display format for course schedules. The database holds three shapes:
//   • classlist import (English, one line per period, room after the time):
//       "Tu 13:00 - 16:35 1227/1,1227/2 ว.1"
//   • instructor-entered Thai, one or more days sharing a time:
//       "พฤ 13:00-16:00", "จ,พ,ศ 09:00-12:00"
// Every screen shows them the same way: "อังคาร 13:00–16:35 · ห้อง 1227/1,1227/2 ว.1".

export interface ScheduleMeeting {
  /** 0 = Sunday … 6 = Saturday, matching Date.getDay(). */
  dayIndex: number
  start: string // "HH:MM"
  end: string   // "HH:MM"
  room: string  // "" when the schedule carries no room
}

const DAY_INDEX: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
  'อา': 0, 'จ': 1, 'อ': 2, 'พ': 3, 'พฤ': 4, 'ศ': 5, 'ส': 6,
}

export const THAI_DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']

// <day or comma-separated days> <start>-<end> [room]
const MEETING_RE = /^((?:Mo|Tu|We|Th|Fr|Sa|Su|อา|พฤ|จ|อ|พ|ศ|ส)\.?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|อา|พฤ|จ|อ|พ|ศ|ส)\.?)*)\s+(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})\s*(.*)$/

const fmtTime = (t: string) => t.replace('.', ':').padStart(5, '0')

/**
 * Parses every meeting in a schedule, ordered by day then start time.
 * Returns null when any non-empty line isn't a recognisable meeting, so
 * callers can fall back to showing the raw text instead of losing it.
 */
export function parseSchedule(schedule?: string): ScheduleMeeting[] | null {
  const lines = (schedule ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const out: ScheduleMeeting[] = []
  for (const line of lines) {
    const m = MEETING_RE.exec(line)
    if (!m) return null
    for (const day of m[1].split(',').map((d) => d.trim().replace(/\.$/, ''))) {
      out.push({ dayIndex: DAY_INDEX[day], start: fmtTime(m[2]), end: fmtTime(m[3]), room: m[4].trim() })
    }
  }
  // Monday-first week, so Sunday sorts last.
  const dayOrder = (d: number) => (d + 6) % 7
  return out.sort((a, b) => dayOrder(a.dayIndex) - dayOrder(b.dayIndex) || a.start.localeCompare(b.start))
}

interface FormatOptions {
  /** Append "· ห้อง …" when the schedule names a room (default true). */
  room?: boolean
  /** Joins different days (default "\n" — render with white-space: pre-line). */
  separator?: string
}

/**
 * Formats a schedule as one entry per day: "อังคาร 13:00–16:35 · ห้อง 1227/1".
 * Several periods on the same day share the day name
 * ("พุธ 08:30–10:15, 10:20–12:05"). Unrecognised text is returned unchanged.
 */
export function formatSchedule(schedule?: string, { room = true, separator = '\n' }: FormatOptions = {}): string {
  const meetings = parseSchedule(schedule)
  if (!meetings) return (schedule ?? '').trim()
  const days: { dayIndex: number; times: string[]; rooms: string[] }[] = []
  for (const m of meetings) {
    let day = days.find((d) => d.dayIndex === m.dayIndex)
    if (!day) {
      day = { dayIndex: m.dayIndex, times: [], rooms: [] }
      days.push(day)
    }
    const time = `${m.start}–${m.end}`
    if (!day.times.includes(time)) day.times.push(time)
    if (m.room && !day.rooms.includes(m.room)) day.rooms.push(m.room)
  }
  return days
    .map((d) => {
      const text = `${THAI_DAY_NAMES[d.dayIndex]} ${d.times.join(', ')}`
      return room && d.rooms.length ? `${text} · ห้อง ${d.rooms.join(', ')}` : text
    })
    .join(separator)
}
