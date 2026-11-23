import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiErrorMessage, instructorApi } from '../../services/api'
import { useToast } from '../../hooks/useToast'
import { formatThaiDate, thaiDayShort } from '../../utils/thaiDate'
import { payableMinutes } from '../../utils/payableHours'
import { MAX_LAB_SESSIONS_PER_TERM } from '../../utils/labSessions'
import { parseSchedule, THAI_DAY_NAMES } from '../../utils/schedule'
import type { CourseTeachingDates, TeachingDate } from '../../types'

const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const thCss: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--ink-600)', fontSize: 13,
}

type Row = { date: string; start_time: string; end_time: string }

const hoursOf = (r: Row) => payableMinutes(r.start_time, r.end_time) / 60
const byDate = (a: Row, b: Row) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)

/** Same rule as the staff plan: at most 15 lab sessions per term; holidays take no slot. */
function capSessions(dates: TeachingDate[], holidays: Set<string>): Row[] {
  let left = MAX_LAB_SESSIONS_PER_TERM
  const out: Row[] = []
  for (const d of dates) {
    if (!holidays.has(d.date)) {
      if (left <= 0) continue
      left -= 1
    }
    out.push({ date: d.date, start_time: d.start_time, end_time: d.end_time })
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
// plan the staff see under "กำหนดตารางปฏิบัติงาน Lab Boy". The instructor can
// change a day or its time, drop a day or add one; what they leave here is
// saved with the posting and becomes the staff's starting plan.
export function TeachingDatesConfirmModal({
  isOpen, courseIds, courseCode, courseTitle, semester, loading, onClose, onConfirm,
}: Props) {
  const showToast = useToast()
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['teaching-dates', courseIds],
    queryFn: () => instructorApi.teachingDates(courseIds),
    enabled: isOpen && courseIds.length > 0,
  })

  // Rows the instructor changed, per course. A course with no entry shows the
  // server's dates; `reset` marks courses sent back to the calendar's dates.
  const [drafts, setDrafts] = useState<Record<number, Row[]>>({})
  const [reset, setReset] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const sections = useMemo(() => data.map((c) => {
    const hol = new Set(c.holidays.map((h) => h.date))
    const rows = drafts[c.course_id] ?? (c.edited ? c.dates.map((d) => ({ date: d.date, start_time: d.start_time, end_time: d.end_time })) : capSessions(c.dates, hol))
    return { item: c, hol, rows: [...rows].sort(byDate) }
  }), [data, drafts])

  const totals = sections.reduce((t, s) => {
    for (const r of s.rows) {
      if (s.hol.has(r.date)) t.holidays += 1
      else { t.days += 1; t.hours += hoursOf(r) }
    }
    return t
  }, { days: 0, hours: 0, holidays: 0 })

  const invalidTimes = sections.some((s) => s.rows.some((r) => !(r.start_time && r.end_time && r.end_time > r.start_time)))
  const overCap = sections.some((s) => s.rows.filter((r) => !s.hol.has(r.date)).length > MAX_LAB_SESSIONS_PER_TERM)

  function setRows(courseId: number, rows: Row[]) {
    setDrafts((d) => ({ ...d, [courseId]: rows }))
    setReset((r) => { const n = new Set(r); n.delete(courseId); return n })
  }

  async function resetToCalendar(courseId: number) {
    try {
      const [auto] = await instructorApi.teachingDates([courseId], { auto: true })
      const hol = new Set(auto.holidays.map((h) => h.date))
      setDrafts((d) => ({ ...d, [courseId]: capSessions(auto.dates, hol) }))
      setReset((r) => new Set(r).add(courseId))
    } catch (err) {
      showToast(await getApiErrorMessage(err, 'โหลดวันที่จากปฏิทินไม่สำเร็จ'), 'error')
    }
  }

  async function confirm() {
    setSaving(true)
    try {
      for (const s of sections) {
        const id = s.item.course_id
        if (reset.has(id)) await instructorApi.saveTeachingPlan(id, [])
        else if (drafts[id]) await instructorApi.saveTeachingPlan(id, drafts[id])
      }
    } catch (err) {
      showToast(await getApiErrorMessage(err, 'บันทึกวันสอนไม่สำเร็จ'), 'error')
      setSaving(false)
      return
    }
    setSaving(false)
    setDrafts({})
    setReset(new Set())
    onConfirm()
  }

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
          {isLoading ? (
            <div style={{ height: 120, background: 'var(--line-soft)', borderRadius: 8 }} />
          ) : isError ? (
            <div style={{ fontSize: 13, color: 'var(--red)', padding: '16px 0' }}>
              โหลดวันที่สอนไม่สำเร็จ — ยังสามารถเปิดรับสมัครต่อได้
            </div>
          ) : (
            sections.map((s) => (
              <SectionPlan
                key={s.item.course_id}
                item={s.item}
                rows={s.rows}
                holidays={s.hol}
                holidayNames={new Map(s.item.holidays.map((h) => [h.date, h.name]))}
                showTitle={sections.length > 1}
                changed={!!drafts[s.item.course_id]}
                onChange={(rows) => setRows(s.item.course_id, rows)}
                onReset={() => resetToCalendar(s.item.course_id)}
              />
            ))
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
                วันสอนรวม <strong style={{ color: 'var(--primary)' }}>{totals.days} วัน</strong>
                {' · '}<strong style={{ color: 'var(--primary)' }}>{totals.hours.toFixed(1)} ชม.</strong>
                {totals.holidays > 0 && <> · วันหยุด {totals.holidays} วัน</>}
                {(invalidTimes || overCap) && (
                  <span style={{ color: 'var(--red)', display: 'block' }}>
                    {invalidTimes ? 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' : `มีวันสอนเกิน ${MAX_LAB_SESSIONS_PER_TERM} ครั้ง`}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">ย้อนกลับ</button>
            <button type="button" onClick={confirm} disabled={loading || saving || invalidTimes || overCap} className="btn btn-green">
              {loading || saving ? 'กำลังเปิดรับสมัคร...' : 'ยืนยันเปิดรับสมัคร'}
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
  return `ปฏิทินการศึกษา${term} ยังไม่มี${missing} จึงยังคำนวณวันที่สอนให้อัตโนมัติไม่ได้ — ให้แอดมินบันทึกที่เมนู “ปฏิทินการศึกษา” หรือเพิ่มวันเองด้านล่าง`
}

interface SectionProps {
  item: CourseTeachingDates
  rows: Row[]
  holidays: Set<string>
  holidayNames: Map<string, string>
  showTitle: boolean
  changed: boolean
  onChange: (rows: Row[]) => void
  onReset: () => void
}

function SectionPlan({ item, rows, holidays, holidayNames, showTitle, changed, onChange, onReset }: SectionProps) {
  const slots = parseSchedule(item.schedule) ?? []
  const [newDate, setNewDate] = useState('')
  const [newStart, setNewStart] = useState(slots[0]?.start ?? '09:00')
  const [newEnd, setNewEnd] = useState(slots[0]?.end ?? '12:00')
  const [addError, setAddError] = useState('')

  const used = rows.filter((r) => !holidays.has(r.date)).length

  // Number each counted session in date order across the whole term.
  const numbering = useMemo(() => {
    let n = 0
    return rows.map((r) => (holidays.has(r.date) ? 0 : ++n))
  }, [rows, holidays])

  const months = useMemo(() => {
    const map = new Map<string, { row: Row; index: number }[]>()
    rows.forEach((row, index) => {
      const k = row.date.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push({ row, index })
    })
    return [...map.entries()]
  }, [rows])

  function update(index: number, patch: Partial<Row>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function add() {
    setAddError('')
    if (!newDate) return setAddError('เลือกวันที่ก่อน')
    if (!(newStart && newEnd && newEnd > newStart)) return setAddError('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
    if (rows.some((r) => r.date === newDate && r.start_time === newStart)) return setAddError('มีวันและเวลานี้อยู่แล้ว')
    if (!holidays.has(newDate) && used >= MAX_LAB_SESSIONS_PER_TERM) {
      return setAddError(`Lab มีได้ไม่เกิน ${MAX_LAB_SESSIONS_PER_TERM} ครั้งต่อภาคเรียน — ลบวันอื่นออกก่อน`)
    }
    onChange([...rows, { date: newDate, start_time: newStart, end_time: newEnd }].sort(byDate))
    setNewDate('')
  }

  const timeInput: React.CSSProperties = { width: 96, fontSize: 12, padding: '3px 8px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
          {showTitle ? (item.section ? `ตอนเรียน (Sec) ${item.section}` : 'ตอนเรียน') : ''}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', marginLeft: showTitle ? 10 : 0 }}>
            ใช้ไป {used}/{MAX_LAB_SESSIONS_PER_TERM} ครั้ง
            {(changed || item.edited) && <span className="badge badge-blue" style={{ marginLeft: 8 }}>แก้ไขแล้ว</span>}
          </span>
        </div>
        {(changed || item.edited) && item.term_known && (
          <button type="button" onClick={onReset} className="btn btn-ghost btn-xs">↺ คืนค่าตามปฏิทินการศึกษา</button>
        )}
      </div>

      {!item.term_known && rows.length === 0 && (
        <div style={{ padding: '10px 12px', background: 'var(--amber-bg)', border: '1px solid #FCD34D', borderRadius: 'var(--radius-input)', fontSize: 12, color: 'var(--amber)' }}>
          {missingTermText(item)}
        </div>
      )}

      {item.term_known && rows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 13, padding: '24px 0', border: '2px dashed var(--line)', borderRadius: 'var(--radius-card)' }}>
          ไม่พบวันที่สอน (ตารางเรียนอาจไม่อยู่ในรูปแบบที่ระบบอ่านได้) — เพิ่มวันเองด้านล่างได้
        </div>
      )}

      {slots.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-600)' }}>ตารางเรียนประจำสัปดาห์:</span>
          {slots.map((s, i) => (
            <span key={i} className="badge badge-primary" style={{ fontSize: 13 }}>
              {THAI_DAY_NAMES[s.dayIndex]} {s.start}–{s.end} ({(payableMinutes(s.start, s.end) / 60).toFixed(1)} ชม.)
            </span>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--line)', background: 'var(--line-soft)' }}>
                <th style={thCss}>ครั้งที่</th>
                <th style={thCss}>วันที่</th>
                <th style={thCss}>เวลา</th>
                <th style={thCss}>สถานะ</th>
                <th style={thCss} aria-label="ลบ" />
              </tr>
            </thead>
            {months.map(([key, entries]) => {
              const [y, m] = key.split('-').map(Number)
              const counted = entries.filter((e) => !holidays.has(e.row.date))
              const hours = counted.reduce((h, e) => h + hoursOf(e.row), 0)
              return (
                <tbody key={key}>
                  <tr style={{ background: 'var(--primary-50)', borderTop: '1.5px solid var(--line)', borderBottom: '1.5px solid var(--line)' }}>
                    <td colSpan={5} style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>{MONTH_NAMES[m - 1]} {y + 543}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-600)', fontWeight: 600, marginLeft: 12 }}>
                        {counted.length} วันสอน · {hours.toFixed(1)} ชม.
                      </span>
                    </td>
                  </tr>
                  {entries.map(({ row, index }, i) => {
                    const hol = holidays.has(row.date)
                    return (
                      <tr key={`${row.date}-${row.start_time}-${index}`} style={{
                        borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none',
                        background: hol ? 'var(--amber-bg)' : undefined,
                        color: hol ? 'var(--ink-500)' : undefined,
                      }}>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: hol ? 'var(--ink-400)' : 'var(--primary)' }}>
                          {hol ? '—' : `${numbering[index]}/${MAX_LAB_SESSIONS_PER_TERM}`}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: hol ? 'var(--ink-500)' : 'var(--ink-900)', minWidth: 130 }}>
                              {thaiDayShort(row.date)} {formatThaiDate(row.date)}
                            </span>
                            <input type="date" value={row.date} className="form-input" style={{ width: 140, fontSize: 12, padding: '2px 6px' }}
                              onChange={(e) => e.target.value && update(index, { date: e.target.value })} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input type="time" value={row.start_time} className="form-input" style={timeInput}
                              onChange={(e) => update(index, { start_time: e.target.value })} />
                            <span>–</span>
                            <input type="time" value={row.end_time} className="form-input" style={timeInput}
                              onChange={(e) => update(index, { end_time: e.target.value })} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {hol && (
                            <>
                              <span className="badge badge-amber">วันหยุด</span>
                              <span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 6 }}>{holidayNames.get(row.date)}</span>
                            </>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button type="button" title="ลบวันนี้" aria-label="ลบวันนี้"
                            onClick={() => onChange(rows.filter((_, i2) => i2 !== index))}
                            className="btn btn-xs"
                            style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5' }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
        </div>
      )}

      {/* Add a day */}
      <div style={{ padding: '10px 12px', background: 'var(--line-soft)', borderRadius: 'var(--radius-input)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-600)' }}>เพิ่มวันสอน</span>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="form-input" style={{ width: 150, fontSize: 12, padding: '3px 8px' }} />
        <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="form-input" style={timeInput} />
        <span>–</span>
        <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="form-input" style={timeInput} />
        <button type="button" onClick={add} className="btn btn-primary btn-xs">+ เพิ่ม</button>
        {addError && <span style={{ fontSize: 11, color: 'var(--red)', width: '100%' }}>{addError}</span>}
      </div>
    </div>
  )
}
