import { Fragment, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  ScheduleGroup, GroupMonthPlanEntry, CalendarDate, WorkOccurrence,
  OccurrenceStatus, GroupWeekDaySlot, UpdateScheduleGroupPayload, PatchOccurrencePayload,
} from '../../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_OPTIONS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี',
  FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}
export const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
const OCC_LABEL: Record<OccurrenceStatus, string> = {
  scheduled: 'กำหนด', cancelled_holiday: 'หยุด', rescheduled: 'เลื่อน',
  completed: 'เสร็จ', absent: 'ขาด', cancelled_other: 'ยกเลิก',
}
const OCC_BADGE: Record<OccurrenceStatus, string> = {
  scheduled: 'badge-primary', cancelled_holiday: 'badge-amber',
  rescheduled: 'badge-blue', completed: 'badge-green',
  absent: 'badge-red', cancelled_other: 'badge-red',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseGroupSlots(group: ScheduleGroup): GroupWeekDaySlot[] {
  if (group.week_days_json) {
    try {
      const parsed = JSON.parse(group.week_days_json) as GroupWeekDaySlot[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* fall through */ }
  }
  if (group.week_day) {
    return [{ day: group.week_day, start_time: group.start_time, end_time: group.end_time }]
  }
  return []
}

function computeSlotHours(s: string, e: string): number | null {
  if (!s || !e) return null
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : null
}

export function thaiFmt(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
}

function thaiDayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][d.getDay()]
}

const thCss: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left',
  fontWeight: 600, color: 'var(--ink-500)', fontSize: 11,
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  caseId: number
  group: ScheduleGroup
  entry: GroupMonthPlanEntry
  calDates: CalendarDate[]
  isReadOnly: boolean
}

export function MonthlyWorkPlanCard({ caseId, group, entry, calDates, isReadOnly }: Props) {
  const qc = useQueryClient()
  const { month: sgm, occurrences, summary } = entry
  const slots = parseGroupSlots(group)

  // Weekly schedule edit
  const [editSched, setEditSched] = useState(false)
  const [editSlots, setEditSlots] = useState<GroupWeekDaySlot[]>(slots)

  // Add occurrence
  const [showAdd, setShowAdd] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newStart, setNewStart] = useState(slots[0]?.start_time ?? '13:00')
  const [newEnd, setNewEnd] = useState(slots[0]?.end_time ?? '16:00')

  // Edit occurrence time
  const [editOccId, setEditOccId] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  // Reschedule occurrence
  const [rsOccId, setRsOccId] = useState<number | null>(null)
  const [rsDate, setRsDate] = useState('')
  const [rsStart, setRsStart] = useState('')
  const [rsEnd, setRsEnd] = useState('')
  const [rsReason, setRsReason] = useState('')

  function inv() { qc.invalidateQueries({ queryKey: ['monthly-plan', caseId] }) }

  const genMut = useMutation({
    mutationFn: () => staffApi.generateMonthOccurrences(caseId, group.id, sgm.year, sgm.month),
    onSuccess: inv,
  })
  const addOccMut = useMutation({
    mutationFn: () => staffApi.addGroupMonthOccurrence(caseId, group.id, sgm.year, sgm.month, {
      date: newDate, start_time: newStart, end_time: newEnd,
    }),
    onSuccess: () => { inv(); setShowAdd(false); setNewDate('') },
  })
  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PatchOccurrencePayload }) =>
      staffApi.patchOccurrence(id, data),
    onSuccess: () => { inv(); setEditOccId(null) },
  })
  const delOccMut = useMutation({
    mutationFn: (id: number) => staffApi.deleteOccurrence(id),
    onSuccess: inv,
  })
  const rsMut = useMutation({
    mutationFn: (id: number) =>
      staffApi.rescheduleOccurrence(id, rsDate, rsStart, rsEnd, rsReason || undefined),
    onSuccess: () => { inv(); setRsOccId(null); setRsDate(''); setRsReason('') },
  })
  const updSchedMut = useMutation({
    mutationFn: (data: UpdateScheduleGroupPayload) =>
      staffApi.updateScheduleGroup(caseId, group.id, data),
    onSuccess: () => { inv(); setEditSched(false) },
  })
  const delGroupMut = useMutation({
    mutationFn: () => staffApi.deleteScheduleGroup(caseId, group.id),
    onSuccess: inv,
  })

  const holidayDates = new Set(
    calDates
      .filter(cd => {
        const d = new Date(cd.date + 'T00:00:00')
        return d.getFullYear() === sgm.year && (d.getMonth() + 1) === sgm.month && cd.affects_work
      })
      .map(cd => cd.date),
  )
  const holidaysThisMonth = calDates.filter(cd => holidayDates.has(cd.date))

  function startEditOcc(occ: WorkOccurrence) {
    setEditOccId(occ.id)
    setEditStart(occ.start_time.slice(0, 5))
    setEditEnd(occ.end_time.slice(0, 5))
    setRsOccId(null)
  }
  function startRs(occ: WorkOccurrence) {
    setRsOccId(occ.id)
    setRsDate('')
    setRsStart(occ.start_time.slice(0, 5))
    setRsEnd(occ.end_time.slice(0, 5))
    setRsReason('')
    setEditOccId(null)
  }
  function saveSchedEdit() {
    const vs = editSlots.filter(s => s.day && s.start_time && s.end_time)
    if (!vs.length) return
    updSchedMut.mutate({
      week_day: vs[0].day, start_time: vs[0].start_time, end_time: vs[0].end_time,
      week_day_slots: vs,
    })
  }

  const sorted = [...occurrences].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  return (
    <div className="card">
      {/* Card header */}
      <div style={{
        padding: '11px 16px',
        background: 'var(--primary-50)',
        borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
        borderBottom: '1.5px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
            {MONTH_NAMES[sgm.month - 1]} {sgm.year + 543}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 10 }}>
            {summary.valid} วันนับ · {summary.valid_hours.toFixed(1)} ชม. · {summary.pay_per_person_baht.toFixed(0)} บาท/คน
          </span>
        </div>
        {!isReadOnly && (
          <button type="button"
            onClick={() => {
              if (window.confirm(`ลบเดือน${MONTH_NAMES[sgm.month - 1]}และวันปฏิบัติงานทั้งหมดในเดือนนี้?`))
                delGroupMut.mutate()
            }}
            disabled={delGroupMut.isPending}
            className="btn btn-ghost btn-xs"
            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            ✕ ลบเดือน
          </button>
        )}
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ─ Weekly schedule ─ */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ตารางสัปดาห์
            </span>
            {!isReadOnly && !editSched && (
              <button type="button"
                onClick={() => { setEditSlots(slots.map(s => ({ ...s }))); setEditSched(true) }}
                className="btn btn-ghost btn-xs">
                แก้ไข
              </button>
            )}
          </div>

          {editSched ? (
            <div style={{ background: 'var(--line-soft)', borderRadius: 'var(--radius-input)', padding: 10 }}>
              {editSlots.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <select value={s.day}
                    onChange={e => setEditSlots(editSlots.map((sl, idx) => idx === i ? { ...sl, day: e.target.value } : sl))}
                    className="form-input" style={{ width: 128 }}>
                    <option value="">เลือกวัน</option>
                    {DAY_OPTIONS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                  </select>
                  <input type="time" value={s.start_time}
                    onChange={e => setEditSlots(editSlots.map((sl, idx) => idx === i ? { ...sl, start_time: e.target.value } : sl))}
                    className="form-input" style={{ width: 104 }} />
                  <span style={{ color: 'var(--ink-400)' }}>–</span>
                  <input type="time" value={s.end_time}
                    onChange={e => setEditSlots(editSlots.map((sl, idx) => idx === i ? { ...sl, end_time: e.target.value } : sl))}
                    className="form-input" style={{ width: 104 }} />
                  {editSlots.length > 1 && (
                    <button type="button"
                      onClick={() => setEditSlots(editSlots.filter((_, idx) => idx !== i))}
                      className="btn btn-xs"
                      style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5' }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {editSlots.length < 4 && (
                <button type="button"
                  onClick={() => setEditSlots([...editSlots, { day: '', start_time: '', end_time: '' }])}
                  style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                  + เพิ่มวัน
                </button>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button type="button" onClick={saveSchedEdit} disabled={updSchedMut.isPending}
                  className="btn btn-primary btn-sm">
                  {updSchedMut.isPending ? '...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setEditSched(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.length > 0
                ? slots.map((s, i) => {
                    const hrs = computeSlotHours(s.start_time, s.end_time)
                    return (
                      <span key={i} className="badge badge-primary" style={{ fontSize: 12 }}>
                        {DAY_LABELS[s.day] ?? s.day} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        {hrs !== null ? ` (${hrs.toFixed(1)} ชม.)` : ''}
                      </span>
                    )
                  })
                : <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่กำหนดตาราง</span>}
            </div>
          )}
        </div>

        {/* ─ Occurrences ─ */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              วันปฏิบัติงาน ({sorted.length})
            </span>
            {!isReadOnly && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => genMut.mutate()} disabled={genMut.isPending}
                  className="btn btn-outline btn-xs">
                  {genMut.isPending ? '...' : '⚡ สร้างอัตโนมัติ'}
                </button>
                <button type="button" onClick={() => setShowAdd(!showAdd)}
                  className={`btn btn-xs ${showAdd ? 'btn-primary' : 'btn-ghost'}`}>
                  + เพิ่มวัน
                </button>
              </div>
            )}
          </div>

          {showAdd && !isReadOnly && (
            <div style={{
              padding: '8px 10px', background: 'var(--line-soft)', borderRadius: 'var(--radius-input)',
              marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="form-input" style={{ width: 148 }} />
              <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)}
                className="form-input" style={{ width: 104 }} />
              <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>–</span>
              <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                className="form-input" style={{ width: 104 }} />
              <button type="button" onClick={() => addOccMut.mutate()}
                disabled={addOccMut.isPending || !newDate || !newStart || !newEnd}
                className="btn btn-primary btn-xs">
                {addOccMut.isPending ? '...' : 'เพิ่ม'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost btn-xs">ยกเลิก</button>
              {addOccMut.isError && (
                <span style={{ fontSize: 11, color: 'var(--red)', width: '100%' }}>
                  {(addOccMut.error as Error).message}
                </span>
              )}
            </div>
          )}

          {genMut.isError && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 6 }}>
              {(genMut.error as Error).message}
            </div>
          )}

          {sorted.length === 0 ? (
            <div style={{
              textAlign: 'center', color: 'var(--ink-400)', fontSize: 13,
              padding: '16px 0', border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-input)',
            }}>
              กด ⚡ สร้างอัตโนมัติ ตามตารางสัปดาห์ หรือ + เพิ่มวัน เพื่อเพิ่มทีละวัน
            </div>
          ) : (
            <div style={{ border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--line-soft)' }}>
                    <th style={thCss}>วันที่</th>
                    <th style={thCss}>เวลา</th>
                    <th style={thCss}>สถานะ</th>
                    {!isReadOnly && <th style={{ ...thCss, textAlign: 'right' }}>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((occ, i) => {
                    const isHol = holidayDates.has(occ.scheduled_date)
                    const isEditing = editOccId === occ.id
                    const isRs = rsOccId === occ.id
                    const dimmed = occ.status === 'cancelled_holiday' || occ.status === 'cancelled_other'
                    return (
                      <Fragment key={occ.id}>
                        <tr style={{
                          borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none',
                          background: dimmed ? 'var(--line-soft)' : '#fff',
                          opacity: dimmed ? 0.7 : 1,
                        }}>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ fontWeight: 500 }}>{thaiFmt(occ.scheduled_date)}</span>
                            <span style={{ color: 'var(--ink-400)', fontSize: 11, marginLeft: 4 }}>
                              {thaiDayShort(occ.scheduled_date)}
                            </span>
                            {isHol && (
                              <span className="badge badge-amber" style={{ marginLeft: 5, fontSize: 10 }}>หยุด</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', color: 'var(--ink-600)' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                                  className="form-input" style={{ width: 96, fontSize: 12, padding: '3px 8px' }} />
                                <span>–</span>
                                <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                                  className="form-input" style={{ width: 96, fontSize: 12, padding: '3px 8px' }} />
                              </div>
                            ) : (
                              <>{occ.start_time.slice(0, 5)}–{occ.end_time.slice(0, 5)}</>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <span className={`badge ${OCC_BADGE[occ.status]}`}>{OCC_LABEL[occ.status]}</span>
                            {occ.status === 'rescheduled' && occ.rescheduled_to_date && (
                              <span style={{ fontSize: 11, color: 'var(--ink-500)', marginLeft: 6 }}>
                                → {thaiFmt(occ.rescheduled_to_date)}
                              </span>
                            )}
                          </td>
                          {!isReadOnly && (
                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  <button type="button"
                                    onClick={() => patchMut.mutate({ id: occ.id, data: { start_time: editStart, end_time: editEnd } })}
                                    disabled={patchMut.isPending}
                                    className="btn btn-primary btn-xs">
                                    {patchMut.isPending ? '...' : 'บันทึก'}
                                  </button>
                                  <button type="button" onClick={() => setEditOccId(null)}
                                    className="btn btn-ghost btn-xs">ยกเลิก</button>
                                </div>
                              ) : !isRs ? (
                                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                  {occ.status === 'scheduled' && (
                                    <>
                                      <button type="button"
                                        onClick={() => patchMut.mutate({ id: occ.id, data: { status: 'cancelled_holiday' } })}
                                        disabled={patchMut.isPending}
                                        className="btn btn-xs"
                                        style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #FCD34D' }}>
                                        หยุด
                                      </button>
                                      <button type="button" onClick={() => startRs(occ)}
                                        className="btn btn-xs"
                                        style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid #BFDBF5' }}>
                                        เลื่อน
                                      </button>
                                    </>
                                  )}
                                  {(occ.status === 'cancelled_holiday' || occ.status === 'cancelled_other') && (
                                    <button type="button"
                                      onClick={() => patchMut.mutate({ id: occ.id, data: { status: 'scheduled' } })}
                                      disabled={patchMut.isPending}
                                      className="btn btn-outline btn-xs">
                                      คืนสถานะ
                                    </button>
                                  )}
                                  <button type="button" onClick={() => startEditOcc(occ)}
                                    className="btn btn-ghost btn-xs" title="แก้ไขเวลา">✏</button>
                                  <button type="button"
                                    onClick={() => { if (window.confirm('ลบวันนี้?')) delOccMut.mutate(occ.id) }}
                                    disabled={delOccMut.isPending}
                                    className="btn btn-xs"
                                    style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5' }}>
                                    ✕
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          )}
                        </tr>
                        {isRs && (
                          <tr style={{ borderTop: '1px solid var(--line-soft)' }}>
                            <td colSpan={isReadOnly ? 3 : 4}
                              style={{ padding: '8px 10px', background: 'var(--blue-bg)' }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>เลื่อนเป็น:</span>
                                <input type="date" value={rsDate} onChange={e => setRsDate(e.target.value)}
                                  className="form-input" style={{ width: 148, fontSize: 12, padding: '3px 8px' }} />
                                <input type="time" value={rsStart} onChange={e => setRsStart(e.target.value)}
                                  className="form-input" style={{ width: 100, fontSize: 12, padding: '3px 8px' }} />
                                <span style={{ color: 'var(--ink-400)' }}>–</span>
                                <input type="time" value={rsEnd} onChange={e => setRsEnd(e.target.value)}
                                  className="form-input" style={{ width: 100, fontSize: 12, padding: '3px 8px' }} />
                                <input type="text" value={rsReason} onChange={e => setRsReason(e.target.value)}
                                  placeholder="เหตุผล (ไม่บังคับ)" className="form-input"
                                  style={{ width: 160, fontSize: 12, padding: '3px 8px' }} />
                                <button type="button" onClick={() => rsMut.mutate(occ.id)}
                                  disabled={rsMut.isPending || !rsDate}
                                  className="btn btn-primary btn-xs">
                                  {rsMut.isPending ? '...' : 'ยืนยัน'}
                                </button>
                                <button type="button" onClick={() => setRsOccId(null)}
                                  className="btn btn-ghost btn-xs">ยกเลิก</button>
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
          )}
        </div>

        {/* ─ Holidays notice ─ */}
        {holidaysThisMonth.length > 0 && (
          <div style={{
            padding: '8px 12px', background: 'var(--amber-bg)',
            border: '1px solid #FCD34D', borderRadius: 'var(--radius-input)',
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, color: 'var(--amber)' }}>วันหยุดในเดือนนี้: </span>
            {holidaysThisMonth.map((h, i) => (
              <span key={h.id} style={{ color: 'var(--ink-700)' }}>
                {i > 0 && ' · '}{thaiFmt(h.date)} ({h.name})
              </span>
            ))}
          </div>
        )}

        {/* ─ Monthly summary tiles ─ */}
        {sorted.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
            {[
              { label: 'ทั้งหมด', value: `${summary.total}`, unit: 'วัน', color: 'var(--ink-600)', bold: false },
              { label: 'หยุด', value: `${summary.cancelled_holiday}`, unit: 'วัน', color: 'var(--amber)', bold: false },
              { label: 'วันนับ', value: `${summary.valid}`, unit: 'วัน', color: 'var(--green)', bold: true },
              { label: 'ชั่วโมง', value: summary.valid_hours.toFixed(1), unit: 'ชม.', color: 'var(--primary)', bold: true },
              { label: 'บาท/คน', value: summary.pay_per_person_baht.toFixed(0), unit: '฿', color: 'var(--primary)', bold: true },
            ].map((t, i) => (
              <div key={i} style={{
                padding: '6px 8px', background: 'var(--line-soft)',
                borderRadius: 'var(--radius-input)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 600, marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 14, fontWeight: t.bold ? 700 : 500, color: t.color }}>
                  {t.value} <span style={{ fontSize: 10 }}>{t.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
