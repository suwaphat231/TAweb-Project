import type { ScheduleSlot } from '../../../types'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
type DayKey = (typeof DAYS)[number]

const DAY_LABELS: Record<DayKey, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ',
  THU: 'พฤหัสบดี', FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}

const DAY_STRIP: Record<DayKey, string> = {
  MON: '#F59E0B', TUE: '#F472B6', WED: '#34D399',
  THU: '#FB923C', FRI: '#60A5FA', SAT: '#A78BFA', SUN: '#94A3B8',
}

const DAY_ROW_BG: Record<DayKey, string> = {
  MON: '#FFFBEB', TUE: '#FDF2F8', WED: '#F0FDF4',
  THU: '#FFF7ED', FRI: '#EFF6FF', SAT: '#F5F3FF', SUN: '#F8FAFC',
}

const DAY_BLOCK: Record<DayKey, { bg: string; border: string; text: string }> = {
  MON: { bg: '#FEF3C7', border: '#F59E0B', text: '#78350F' },
  TUE: { bg: '#FCE7F3', border: '#F472B6', text: '#831843' },
  WED: { bg: '#D1FAE5', border: '#34D399', text: '#064E3B' },
  THU: { bg: '#FFEDD5', border: '#FB923C', text: '#7C2D12' },
  FRI: { bg: '#DBEAFE', border: '#60A5FA', text: '#1E3A8A' },
  SAT: { bg: '#EDE9FE', border: '#A78BFA', text: '#4C1D95' },
  SUN: { bg: '#F1F5F9', border: '#94A3B8', text: '#1E293B' },
}

const PX_PER_MIN = 1.15
const LABEL_W = 92
const ROW_H = 66
const HEADER_H = 42

function toMin(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

interface Props {
  slots: ScheduleSlot[]
}

export function WeeklyCalendarPreview({ slots }: Props) {
  let minH = 8
  let maxH = 18

  for (const s of slots) {
    const start = toMin(s.start_time)
    const end = toMin(s.end_time)
    if (start > 0) minH = Math.min(minH, Math.floor(start / 60))
    if (end > 0) maxH = Math.max(maxH, Math.ceil(end / 60))
  }
  maxH = Math.max(maxH, minH + 2)

  const hours: number[] = []
  for (let h = minH; h <= maxH; h++) hours.push(h)

  const gridW = (maxH - minH) * 60 * PX_PER_MIN
  const totalW = LABEL_W + gridW

  const byDay: Partial<Record<DayKey, ScheduleSlot[]>> = {}
  for (const s of slots) {
    const d = s.day as DayKey
    if (!byDay[d]) byDay[d] = []
    byDay[d]!.push(s)
  }

  return (
    <div
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}
      role="img"
      aria-label="ตัวอย่างตารางรายสัปดาห์"
    >
      <div style={{ minWidth: totalW }}>
        {/* Header: corner + time axis */}
        <div style={{ display: 'flex', height: HEADER_H, borderBottom: '2px solid var(--line)', background: '#F8F9FA' }}>
          <div style={{
            width: LABEL_W, flexShrink: 0,
            borderRight: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--ink-600)',
          }}>
            วัน / เวลา
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            {hours.map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  left: (h - minH) * 60 * PX_PER_MIN,
                  top: 0, bottom: 0,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 5,
                  borderLeft: h > minH ? '1px solid var(--line-soft)' : 'none',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Day rows */}
        {DAYS.map((day, di) => {
          const daySlots = byDay[day] ?? []
          const c = DAY_BLOCK[day]
          return (
            <div
              key={day}
              style={{
                display: 'flex',
                height: ROW_H,
                borderBottom: di < DAYS.length - 1 ? '1px solid var(--line)' : 'none',
                background: DAY_ROW_BG[day],
              }}
            >
              {/* Day label */}
              <div style={{
                width: LABEL_W, flexShrink: 0,
                borderRight: '1px solid var(--line)',
                display: 'flex', alignItems: 'center',
                paddingLeft: 10, gap: 8,
              }}>
                <div style={{
                  width: 4, borderRadius: 2, alignSelf: 'stretch',
                  margin: '10px 0', background: DAY_STRIP[day], flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>
                  {DAY_LABELS[day]}
                </span>
              </div>

              {/* Timeline */}
              <div style={{ flex: 1, position: 'relative' }}>
                {/* Hour grid lines */}
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      left: (h - minH) * 60 * PX_PER_MIN,
                      top: 0, bottom: 0, width: 1,
                      background: 'var(--line-soft)',
                    }}
                  />
                ))}

                {/* Slot blocks */}
                {daySlots.map((slot, i) => {
                  const startMin = toMin(slot.start_time)
                  const endMin = toMin(slot.end_time)
                  if (!startMin || !endMin || endMin <= startMin) return null
                  const left = (startMin - minH * 60) * PX_PER_MIN
                  const width = Math.max((endMin - startMin) * PX_PER_MIN - 3, 24)
                  return (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left, top: 8, bottom: 8, width,
                        background: c.bg,
                        border: `1.5px solid ${c.border}`,
                        borderRadius: 6,
                        padding: '3px 6px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: 1,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: c.text, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                        {slot.start_time} – {slot.end_time}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
