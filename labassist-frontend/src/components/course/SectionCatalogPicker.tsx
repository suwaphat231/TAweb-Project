import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { DAY_ORDER, splitMeeting, splitSchedule } from '../../utils/courseDisplay'
import type { SlotSelection } from '../../types'

interface Props {
  code: string
  semester: string
  academicYear: number
  selected: SlotSelection[]
  onChange: (slots: SlotSelection[]) => void
}

interface Slot {
  time: string
  rooms: string[]
  secs: { id: number; section?: number; pickable: boolean }[]
}

// Sec number + schedule always come from the admin's Excel import, never
// typed in by the instructor (a free-text field was too easy to fat-finger
// against the real timetable) — this is the only place they get picked from.
//
// Each meeting time is its own option, opened as its own posting; Secs that
// meet at the same time are merged into one option.
export function SectionCatalogPicker({ code, semester, academicYear, selected, onChange }: Props) {
  const enabled = !!code && !!semester && !!academicYear

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['course-catalog-sections', code, semester, academicYear],
    queryFn: () => instructorApi.courseCatalogSections({ code, semester, academic_year: academicYear }),
    enabled,
  })

  // Rows with `sections` are postings already opened per time slot; the
  // rest are the imported Sec rows the slots are built from.
  const openedTimes = new Set(
    rows.filter((r) => r.sections).map((r) => splitMeeting(splitSchedule(r.schedule ?? '')[0] ?? '').time),
  )
  const slotMap = new Map<string, Slot>()
  for (const r of rows) {
    if (r.sections) continue
    for (const meeting of splitSchedule(r.schedule ?? '')) {
      const { time, room } = splitMeeting(meeting)
      let slot = slotMap.get(time)
      if (!slot) slotMap.set(time, (slot = { time, rooms: [], secs: [] }))
      if (room && !slot.rooms.includes(room)) slot.rooms.push(room)
      // A Sec opened whole under the old per-Sec flow is already recruiting.
      if (!slot.secs.some((s) => s.id === r.id)) slot.secs.push({ id: r.id, section: r.section, pickable: r.status === 'draft' })
    }
  }
  const slots = [...slotMap.values()].sort((a, b) => {
    const day = (s: Slot) => { const i = DAY_ORDER.indexOf(s.time.slice(0, 2)); return i < 0 ? 99 : i }
    return day(a) - day(b) || a.time.localeCompare(b.time)
  })

  function toggle(slot: Slot, ids: number[]) {
    onChange(selected.some((s) => s.time === slot.time)
      ? selected.filter((s) => s.time !== slot.time)
      : [...selected, { time: slot.time, section_ids: ids }])
  }

  if (!enabled) return null

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
        เลือกช่วงเวลาที่จะเปิดรับสมัคร
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>กำลังโหลด...</div>
      ) : slots.length === 0 ? (
        <div style={{
          fontSize: 13, color: 'var(--ink-500)', padding: '9px 12px',
          border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-input)',
        }}>
          ไม่พบ section ของวิชานี้ในภาค/ปีที่เลือก — ให้แอดมินนำเข้ารายชื่อวิชาก่อน
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((slot) => {
            const pickable = slot.secs.filter((s) => s.pickable).map((s) => s.id)
            const alreadyOpen = openedTimes.has(slot.time) || pickable.length === 0
            const isSelected = selected.some((s) => s.time === slot.time)
            return (
              <label
                key={slot.time}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                  background: isSelected ? 'var(--primary-50)' : alreadyOpen ? '#F5F5F5' : '#fff',
                  cursor: alreadyOpen ? 'not-allowed' : 'pointer',
                  opacity: alreadyOpen ? 0.6 : 1,
                }}
              >
                <input type="checkbox" checked={isSelected} disabled={alreadyOpen} onChange={() => toggle(slot, pickable)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
                    🕐 {slot.time}
                    {slot.rooms.length > 0 && (
                      <span style={{ fontWeight: 400, color: 'var(--ink-500)', marginLeft: 6 }}>{slot.rooms.join(' / ')}</span>
                    )}
                    {alreadyOpen && (
                      <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--ink-400)' }}>
                        เปิดรับสมัครแล้ว
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                    Sec {slot.secs.map((s) => s.section).join(', ')}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
