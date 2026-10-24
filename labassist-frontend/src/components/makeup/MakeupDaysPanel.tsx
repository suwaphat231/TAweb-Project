import { Fragment, useState } from 'react'
import type { MakeupDay, MakeupDayPayload } from '../../types'
import { formatThaiDate, thaiDayShort } from '../../utils/thaiDate'
import { makeupProblem } from './makeupRules'
import { DateInput } from '../ui/DateInput'
import { TimeTextInput } from '../ui/TimeTextInput'

interface Props {
  days: MakeupDay[]
  /** Staff only watch: the instructor alone picks makeup days. */
  mode: 'instructor' | 'staff'
  /** Show the course column (the instructor page lists every course). */
  showCourse?: boolean
  /** Omit both to show the list read-only. */
  onChoose?: (occurrenceId: number, data: MakeupDayPayload) => Promise<unknown>
  onDecline?: (occurrenceId: number) => Promise<unknown>
}

const thCss: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-500)', fontSize: 12,
}
const tdCss: React.CSSProperties = { padding: '9px 10px', verticalAlign: 'top' }

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? 'บันทึกไม่สำเร็จ'
}

function StatusCell({ day, mode }: { day: MakeupDay; mode: Props['mode'] }) {
  if (day.status === 'makeup' && day.makeup) {
    const m = day.makeup
    return (
      <div>
        <span className="badge badge-green">ชดเชย</span>
        <div style={{ fontSize: 12, color: 'var(--ink-700)', marginTop: 4 }}>
          {formatThaiDate(m.scheduled_date)} ({thaiDayShort(m.scheduled_date)}) {m.start_time.slice(0, 5)}–{m.end_time.slice(0, 5)}
        </div>
      </div>
    )
  }
  if (day.status === 'no_makeup') return <span className="badge" style={{ background: 'var(--line-soft)', color: 'var(--ink-600)' }}>ไม่ชดเชย</span>
  return <span className="badge badge-amber">{mode === 'staff' ? 'รอวันชดเชยจากอาจารย์' : 'รอเลือกวันชดเชย'}</span>
}

export function MakeupDaysPanel({ days, mode, showCourse = false, onChoose, onDecline }: Props) {
  const [editId, setEditId] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; text: string } | null>(null)

  const editable = !!onChoose && !!onDecline
  const cols = (showCourse ? 5 : 4) - (editable ? 0 : 1)

  function openForm(d: MakeupDay) {
    setEditId(d.occurrence_id)
    setDate(d.makeup?.scheduled_date.slice(0, 10) ?? '')
    setStart((d.makeup?.start_time ?? d.start_time).slice(0, 5))
    setEnd((d.makeup?.end_time ?? d.end_time).slice(0, 5))
    setError(null)
  }

  async function run(id: number, fn: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      setEditId(null)
    } catch (err) {
      setError({ id, text: errorText(err) })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)', overflowX: 'auto', background: '#fff' }}>
      <table style={{ width: '100%', minWidth: showCourse ? 760 : 620, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--line-soft)' }}>
            {showCourse && <th style={thCss}>รายวิชา</th>}
            <th style={thCss}>วันที่ชนวันหยุด</th>
            <th style={thCss}>เวลาเดิม</th>
            <th style={thCss}>วันชดเชย</th>
            {editable && <th style={{ ...thCss, textAlign: 'right' }}>จัดการ</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const editing = editId === d.occurrence_id
            const busy = busyId === d.occurrence_id
            const problem = editing ? makeupProblem(d, date, start, end) : null
            return (
              <Fragment key={d.occurrence_id}>
                <tr style={{ borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none' }}>
                  {showCourse && (
                    <td style={tdCss}>
                      <div style={{ fontWeight: 600 }}>{d.course_code} ตอน {d.section}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{d.course_title} · ภาคเรียนที่ {d.semester}</div>
                    </td>
                  )}
                  <td style={tdCss}>
                    <div style={{ fontWeight: 500 }}>{formatThaiDate(d.date)} ({thaiDayShort(d.date)})</div>
                    {d.holiday_name && <div style={{ fontSize: 12, color: 'var(--amber)' }}>{d.holiday_name}</div>}
                  </td>
                  <td style={{ ...tdCss, color: 'var(--ink-600)' }}>{d.start_time.slice(0, 5)}–{d.end_time.slice(0, 5)}</td>
                  <td style={tdCss}><StatusCell day={d} mode={mode} /></td>
                  {editable && <td style={{ ...tdCss, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!editing && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-primary btn-xs" disabled={busy} onClick={() => openForm(d)}>
                          {d.status === 'pending' ? 'เลือกวันชดเชย' : 'เปลี่ยน'}
                        </button>
                        {d.status !== 'no_makeup' && (
                          <button type="button" className="btn btn-outline btn-xs" disabled={busy}
                            onClick={() => {
                              if (window.confirm(`ยืนยันไม่ชดเชยวันที่ ${formatThaiDate(d.date)}?`)) {
                                void run(d.occurrence_id, () => onDecline!(d.occurrence_id))
                              }
                            }}>
                            ไม่ชดเชย
                          </button>
                        )}
                      </div>
                    )}
                    {error?.id === d.occurrence_id && !editing && (
                      <div role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, whiteSpace: 'normal' }}>{error.text}</div>
                    )}
                  </td>}
                </tr>
                {editing && (
                  <tr>
                    <td colSpan={cols} style={{ padding: '10px 12px', background: 'var(--blue-bg)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>ชดเชยเป็นวันที่</span>
                        <DateInput aria-label="วันชดเชย" value={date} min={d.min_date} max={d.max_date}
                          onChange={(e) => setDate(e.target.value)} className="form-input"
                          style={{ width: 150, fontSize: 13, padding: '4px 8px' }} />
                        <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>เวลา</span>
                        <TimeTextInput aria-label="เวลาเริ่ม" value={start} onChange={setStart}
                          className="form-input" style={{ width: 72, fontSize: 13, padding: '4px 8px', textAlign: 'center' }} />
                        <span>–</span>
                        <TimeTextInput aria-label="เวลาเลิก" value={end} onChange={setEnd}
                          className="form-input" style={{ width: 72, fontSize: 13, padding: '4px 8px', textAlign: 'center' }} />
                        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>น.</span>
                        <button type="button" className="btn btn-primary btn-xs" disabled={busy || problem !== null}
                          onClick={() => void run(d.occurrence_id, () => onChoose!(d.occurrence_id, { date, start_time: start, end_time: end }))}>
                          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => setEditId(null)}>ยกเลิก</button>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 6, color: problem || error?.id === d.occurrence_id ? 'var(--red)' : 'var(--ink-500)' }}>
                        {problem ?? (error?.id === d.occurrence_id ? error.text
                          : `เลือกได้ ${formatThaiDate(d.min_date)} – ${formatThaiDate(d.max_date)} ยกเว้นวันหยุดและวันที่มีงานอยู่แล้ว · ชั่วโมงไม่เกินวันเดิม · Lab Boy จะได้รับแจ้งเตือน`)}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
