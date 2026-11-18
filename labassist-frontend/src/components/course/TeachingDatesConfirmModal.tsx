import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { formatThaiDate, thaiDayShort } from '../../utils/thaiDate'
import { payableMinutes } from '../../utils/payableHours'
import { MAX_LAB_SESSIONS_PER_TERM } from '../../utils/labSessions'
import { parseSchedule, THAI_DAY_NAMES } from '../../utils/schedule'
import type { CourseTeachingDates, TeachingDate } from '../../types'

const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const thCss: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-500)', fontSize: 12,
}

const hoursOf = (d: TeachingDate) => payableMinutes(d.start_time, d.end_time) / 60

/** Same rule as the staff plan: at most 15 lab sessions per term; holidays take no slot. */
type NumberedDate = TeachingDate & { no?: number }

function capSessions(dates: TeachingDate[]): NumberedDate[] {
  let used = 0
  const out: NumberedDate[] = []
  for (const d of dates) {
    if (d.holiday) { out.push(d); continue }
    if (used >= MAX_LAB_SESSIONS_PER_TERM) continue
    used += 1
    out.push({ ...d, no: used })
  }
  return out
}

interface Props {
  isOpen: boolean
  courseIds: number[]
  courseCode: string
  courseTitle: string
  semester: string
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}

// Shown right before a posting is opened: the same month-by-month teaching
// plan the staff see under "กำหนดตารางปฏิบัติงาน Lab Boy", read-only.
export function TeachingDatesConfirmModal({
  isOpen, courseIds, courseCode, courseTitle, semester, loading, onClose, onConfirm,
}: Props) {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['teaching-dates', courseIds],
    queryFn: () => instructorApi.teachingDates(courseIds),
    enabled: isOpen && courseIds.length > 0,
  })

  const sections = useMemo(() => data.map((c) => ({ ...c, dates: capSessions(c.dates) })), [data])
  const totalDays = sections.reduce((n, c) => n + c.dates.filter((d) => !d.holiday).length, 0)
  const totalHolidays = sections.reduce((n, c) => n + c.dates.filter((d) => d.holiday).length, 0)
  const totalHours = sections.reduce((n, c) => n + c.dates.filter((d) => !d.holiday).reduce((h, d) => h + hoursOf(d), 0), 0)

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px',
      }}
      role="dialog" aria-modal="true" aria-label="ตารางวันที่สอน"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: 900,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 48px)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px 14px', borderBottom: '1.5px solid var(--line)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>ตารางวันที่สอนทั้งหมด</span>
                <span className="badge badge-amber">ตรวจสอบก่อนเปิดรับสมัคร</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{courseCode} · {courseTitle}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                ภาคเรียนที่ {semester}
                {sections.length > 0 && <> · {sections.length} ตอนเรียน</>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด"
              style={{
                width: 32, height: 32, border: 'none', background: 'var(--line-soft)', color: 'var(--ink-600)',
                borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0,
              }}>
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-600)', padding: '8px 12px', background: 'var(--primary-50)', borderRadius: 'var(--radius-input)' }}>
            Lab มีได้ไม่เกิน {MAX_LAB_SESSIONS_PER_TERM} ครั้งต่อภาคเรียน — วันที่ตรงกับวันหยุดตามปฏิทินจะแสดงเป็น "วันหยุด" และไม่นับเป็นครั้ง
          </div>
          {isLoading ? (
            <div style={{ height: 120, background: 'var(--line-soft)', borderRadius: 8 }} />
          ) : isError ? (
            <div style={{ fontSize: 13, color: 'var(--red)', padding: '16px 0' }}>
              โหลดวันที่สอนไม่สำเร็จ — ยังสามารถเปิดรับสมัครต่อได้
            </div>
          ) : (
            sections.map((c) => <SectionPlan key={c.course_id} item={c} showTitle={sections.length > 1} />)
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px', borderTop: '1.5px solid var(--line)', display: 'flex', gap: 8,
          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
            {!isLoading && !isError && (
              <>
                วันสอนรวม <strong style={{ color: 'var(--primary)' }}>{totalDays} วัน</strong>
                {' · '}<strong style={{ color: 'var(--primary)' }}>{totalHours.toFixed(1)} ชม.</strong>
                {totalHolidays > 0 && <> · วันหยุด {totalHolidays} วัน</>}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">ย้อนกลับ</button>
            <button type="button" onClick={onConfirm} disabled={loading} className="btn btn-green">
              {loading ? 'กำลังเปิดรับสมัคร...' : 'ยืนยันเปิดรับสมัคร'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function missingTermText(item: { semester: string; academic_year: number; open_date?: string; close_date?: string }): string {
  const term = `ภาคเรียนที่ ${item.semester} ปีการศึกษา ${item.academic_year}`
  const missing = [!item.open_date && 'วันเปิดภาคเรียน', !item.close_date && 'วันปิดภาคเรียน'].filter(Boolean).join(' และ ')
  return `ปฏิทินการศึกษา${term} ยังไม่มี${missing} จึงยังแสดงวันที่สอนไม่ได้ — ให้แอดมินบันทึกที่เมนู “ปฏิทินการศึกษา”`
}

function SectionPlan({ item, showTitle }: { item: Omit<CourseTeachingDates, 'dates'> & { dates: NumberedDate[] }; showTitle: boolean }) {
  const slots = parseSchedule(item.schedule) ?? []

  const months = useMemo(() => {
    const map = new Map<string, NumberedDate[]>()
    for (const d of item.dates) {
      const k = d.date.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(d)
    }
    return [...map.entries()]
  }, [item])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {showTitle && (
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
          {item.section ? `ตอนเรียน (Sec) ${item.section}` : 'ตอนเรียน'}
        </div>
      )}

      {!item.term_known ? (
        <div style={{ padding: '10px 12px', background: 'var(--amber-bg)', border: '1px solid #FCD34D', borderRadius: 'var(--radius-input)', fontSize: 12, color: 'var(--amber)' }}>
          {missingTermText(item)}
        </div>
      ) : item.dates.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 13, padding: '24px 0', border: '2px dashed var(--line)', borderRadius: 'var(--radius-card)' }}>
          ไม่พบวันที่สอน (ตารางเรียนอาจไม่อยู่ในรูปแบบที่ระบบอ่านได้)
        </div>
      ) : months.map(([key, entries]) => {
        const [y, m] = key.split('-').map(Number)
        const counted = entries.filter((e) => !e.holiday)
        const hours = counted.reduce((h, e) => h + hoursOf(e), 0)
        return (
          <div className="card" key={key}>
            <div style={{
              padding: '11px 16px', background: 'var(--primary-50)', borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
              borderBottom: '1.5px solid var(--line)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{MONTH_NAMES[m - 1]} {y + 543}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 10 }}>
                {counted.length} วันสอน · {hours.toFixed(1)} ชม.
              </span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  ตารางสัปดาห์
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {slots.map((s, i) => (
                    <span key={i} className="badge badge-primary" style={{ fontSize: 12 }}>
                      {THAI_DAY_NAMES[s.dayIndex]} {s.start}–{s.end} ({(payableMinutes(s.start, s.end) / 60).toFixed(1)} ชม.)
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  วันสอน ({entries.length})
                </div>
                <div style={{ maxWidth: 560 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        <th style={thCss}>ครั้งที่</th>
                        <th style={thCss}>วันที่</th>
                        <th style={thCss}>เวลา</th>
                        <th style={thCss}>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={`${e.date}-${e.start_time}`} style={{
                          borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none',
                          color: e.holiday ? 'var(--ink-400)' : undefined,
                        }}>
                          <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {e.holiday ? '—' : `${e.no}/${MAX_LAB_SESSIONS_PER_TERM}`}
                          </td>
                          <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600 }}>{formatThaiDate(e.date)}</span>
                            <span style={{ color: 'var(--ink-400)', fontSize: 12, marginLeft: 6 }}>{thaiDayShort(e.date)}</span>
                          </td>
                          <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>{e.start_time}–{e.end_time}</td>
                          <td style={{ padding: '10px 10px' }}>
                            {e.holiday && (
                              <>
                                <span className="badge badge-amber">วันหยุด</span>
                                <span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 6 }}>{e.holiday_name}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
