import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  ScheduleGroup, GroupMonthPlanEntry,
  WorkOccurrence, OccurrenceStatus, PatchOccurrencePayload,
  AddGroupMonthOccurrencePayload, CalendarDate,
} from '../../../types'

const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
const DAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  scheduled: 'กำหนดการ',
  cancelled_holiday: 'วันหยุด',
  rescheduled: 'เลื่อน',
  completed: 'เสร็จสิ้น',
  absent: 'ขาด',
  cancelled_other: 'ยกเลิก',
}

function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const cls: Record<OccurrenceStatus, string> = {
    scheduled:        'badge badge-primary',
    cancelled_holiday:'badge badge-red',
    rescheduled:      'badge badge-amber',
    completed:        'badge badge-green',
    absent:           'badge badge-red',
    cancelled_other:  'badge',
  }
  const extra: Partial<Record<OccurrenceStatus, React.CSSProperties>> = {
    cancelled_other: { background: 'var(--line-soft)', color: 'var(--ink-500)', border: '1px solid var(--line)' },
  }
  return (
    <span className={cls[status]} style={extra[status]}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function formatThaiDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`
}

function formatThaiWeekday(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return DAY_SHORT[d.getDay()]
}

function formatThaiDateLong(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`
}

function formatThaiMonthYear(year: number, month: number) {
  return `${MONTHS_TH[month - 1]} ${year + 543}`
}

function validateTime(start: string, end: string): string | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (sh * 60 + sm >= eh * 60 + em) return 'เวลาเริ่มต้องก่อนเวลาสิ้นสุด'
  return null
}

function computeHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

interface Props {
  caseId: number
  group: ScheduleGroup
  planLocked: boolean
  entries: GroupMonthPlanEntry[]
  isLoading: boolean
  calDates: CalendarDate[]
}

export default function MonthlyPlanSection({ caseId, group, planLocked, entries, isLoading, calDates }: Props) {
  const qc = useQueryClient()
  const groupId = group.id
  const isReadOnly = planLocked || !!group.locked_at

  const now = new Date()

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['monthly-plan', caseId] })
    qc.invalidateQueries({ queryKey: ['staff-group-occurrences', groupId] })
  }

  const addMonthMut = useMutation({
    mutationFn: (data: { year: number; month: number }) =>
      staffApi.addGroupMonth(caseId, groupId, data),
    onSuccess: () => { invalidate(); setShowAddMonth(false) },
  })

  const deleteMonthMut = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      staffApi.deleteGroupMonth(caseId, groupId, year, month),
    onSuccess: invalidate,
  })

  const genMonthMut = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      staffApi.generateMonthOccurrences(caseId, groupId, year, month),
    onSuccess: invalidate,
  })

  const addOccMut = useMutation({
    mutationFn: ({ year, month, data }: { year: number; month: number; data: AddGroupMonthOccurrencePayload }) =>
      staffApi.addGroupMonthOccurrence(caseId, groupId, year, month, data),
    onSuccess: () => { invalidate(); setAddingToMonth(null) },
  })

  const patchOccMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PatchOccurrencePayload }) =>
      staffApi.patchOccurrence(id, data),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const deleteOccMut = useMutation({
    mutationFn: (id: number) => staffApi.deleteOccurrence(id),
    onSuccess: invalidate,
  })

  const rescheduleMut = useMutation({
    mutationFn: ({ id, new_date, new_start, new_end, reason }: {
      id: number; new_date: string; new_start: string; new_end: string; reason: string
    }) => staffApi.rescheduleOccurrence(id, new_date, new_start, new_end, reason),
    onSuccess: () => { invalidate(); setReschedulingId(null) },
  })

  const [showAddMonth, setShowAddMonth] = useState(false)
  const [addMonthForm, setAddMonthForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [addingToMonth, setAddingToMonth] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ date: '', start_time: group.start_time, end_time: group.end_time })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [reschedulingId, setReschedulingId] = useState<number | null>(null)

  const existingMonthKeys = new Set(entries.map((e) => `${e.month.year}-${e.month.month}`))

  function toggleMonth(key: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startAddToMonth(key: string, year: number, month: number) {
    setAddingToMonth(key)
    const d = new Date(year, month - 1, 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    setAddForm({
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      start_time: group.start_time,
      end_time: group.end_time,
    })
  }

  if (isLoading) {
    return (
      <div style={{ height: 80, background: 'var(--line-soft)', borderRadius: 'var(--radius-card)', animation: 'fadeIn .3s' }} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Add Month CTA ── */}
      {!isReadOnly && (
        showAddMonth ? (
          <AddMonthForm
            form={addMonthForm}
            onChange={setAddMonthForm}
            existingMonthKeys={existingMonthKeys}
            isPending={addMonthMut.isPending}
            error={addMonthMut.isError ? String((addMonthMut.error as Error).message) : undefined}
            onSubmit={() => addMonthMut.mutate(addMonthForm)}
            onCancel={() => { setShowAddMonth(false); addMonthMut.reset() }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddMonth(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '11px 16px',
              borderRadius: 'var(--radius-card)',
              border: '2px dashed var(--primary-100)',
              background: 'var(--primary-50)',
              color: 'var(--primary)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-100)'
              e.currentTarget.style.borderColor = 'var(--primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-100)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            เพิ่มเดือนปฏิบัติงาน
          </button>
        )
      )}

      {/* ── Month List ── */}
      {entries.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          border: '1.5px dashed var(--line)',
          borderRadius: 'var(--radius-card)',
          color: 'var(--ink-400)', fontSize: 13,
        }}>
          {isReadOnly ? 'ไม่มีรายการเดือน' : 'ยังไม่มีรายการเดือน — กด "เพิ่มเดือนปฏิบัติงาน" เพื่อเริ่ม'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((entry) => {
            const { month: sgMonth, occurrences, summary } = entry
            const monthKey = `${sgMonth.year}-${sgMonth.month}`
            const isExpanded = !collapsedMonths.has(monthKey)
            const isGenPending =
              genMonthMut.isPending &&
              genMonthMut.variables?.year === sgMonth.year &&
              genMonthMut.variables?.month === sgMonth.month
            const isDelPending =
              deleteMonthMut.isPending &&
              deleteMonthMut.variables?.year === sgMonth.year &&
              deleteMonthMut.variables?.month === sgMonth.month
            const existingDates = occurrences.map((o) => o.scheduled_date.slice(0, 10))

            return (
              <div
                key={monthKey}
                className="card"
                style={{ overflow: 'hidden' }}
              >
                {/* Month header */}
                <div style={{
                  display: 'flex', alignItems: 'stretch',
                  background: isExpanded ? 'var(--primary-50)' : '#fff',
                  transition: 'background .15s',
                }}>
                  <button
                    type="button"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                    }}
                    onClick={() => toggleMonth(monthKey)}
                  >
                    {/* Calendar mini icon */}
                    <div style={{
                      width: 42, height: 42, flexShrink: 0,
                      background: 'var(--primary)', borderRadius: 8,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 1,
                    }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', fontWeight: 600, lineHeight: 1 }}>
                        {sgMonth.year + 543}
                      </span>
                      <span style={{ fontSize: 13, color: '#fff', fontWeight: 700, lineHeight: 1 }}>
                        {MONTHS_SHORT[sgMonth.month - 1]}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
                        {formatThaiMonthYear(sgMonth.year, sgMonth.month)}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>
                          ปฏิบัติงาน <strong style={{ color: 'var(--ink-900)' }}>{summary.valid} วัน</strong>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                          {summary.valid_hours.toFixed(1)} ชม.
                        </span>
                        {summary.pay_per_person_baht > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                            {summary.pay_per_person_baht.toFixed(0)} บ./คน
                          </span>
                        )}
                        {summary.cancelled_holiday > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--amber)' }}>
                            หยุด {summary.cancelled_holiday} วัน
                          </span>
                        )}
                      </div>
                    </div>

                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="var(--ink-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`ลบเดือน ${formatThaiMonthYear(sgMonth.year, sgMonth.month)} และวันทำงานทั้งหมด?`)) {
                          deleteMonthMut.mutate({ year: sgMonth.year, month: sgMonth.month })
                        }
                      }}
                      disabled={isDelPending}
                      title="ลบเดือนนี้"
                      style={{
                        padding: '0 14px', background: 'transparent',
                        border: 'none', borderLeft: '1.5px solid var(--line)',
                        color: 'var(--red)', fontSize: 12, cursor: 'pointer',
                        flexShrink: 0, opacity: isDelPending ? 0.5 : 1,
                      }}
                    >
                      {isDelPending ? '...' : 'ลบ'}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1.5px solid var(--line)' }}>

                    {/* ⚡ Auto-generate box */}
                    {!isReadOnly && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px',
                        background: 'var(--green-bg)',
                        border: '1px solid #86EFAC',
                        borderRadius: 'var(--radius-input)',
                      }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                            สร้างวันทำงานอัตโนมัติ
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--green)', opacity: 0.8 }}>
                            สร้างจากตารางประจำสัปดาห์ของกลุ่มนี้
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => genMonthMut.mutate({ year: sgMonth.year, month: sgMonth.month })}
                          disabled={isGenPending}
                          className="btn btn-green btn-sm"
                        >
                          {isGenPending ? 'กำลังสร้าง...' : 'สร้างเลย'}
                        </button>
                        {genMonthMut.isError && genMonthMut.variables?.year === sgMonth.year && (
                          <span style={{ fontSize: 11, color: 'var(--red)' }}>
                            {String((genMonthMut.error as Error).message)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Occurrence table */}
                    {occurrences.length === 0 ? (
                      <div style={{
                        padding: '20px', textAlign: 'center',
                        color: 'var(--ink-400)', fontSize: 12,
                        border: '1px dashed var(--line)',
                        borderRadius: 'var(--radius-input)',
                      }}>
                        ยังไม่มีวันทำงานในเดือนนี้
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--line-soft)', borderBottom: '1.5px solid var(--line)' }}>
                              <th style={thStyle}>#</th>
                              <th style={thStyle}>วันที่</th>
                              <th style={{ ...thStyle, textAlign: 'center' }}>วัน</th>
                              <th style={thStyle}>เวลาเริ่ม</th>
                              <th style={thStyle}>เวลาสิ้นสุด</th>
                              <th style={{ ...thStyle, textAlign: 'right' }}>ชม.</th>
                              <th style={thStyle}>สถานะ</th>
                              <th style={{ ...thStyle, width: 100 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {occurrences.map((occ, idx) => (
                              <OccurrenceRows
                                key={occ.id}
                                occ={occ}
                                seq={idx + 1}
                                isReadOnly={isReadOnly}
                                isEditing={editingId === occ.id}
                                isRescheduling={reschedulingId === occ.id}
                                patchPending={patchOccMut.isPending && editingId === occ.id}
                                deletePending={deleteOccMut.isPending}
                                reschedulePending={rescheduleMut.isPending && reschedulingId === occ.id}
                                patchError={
                                  patchOccMut.isError && editingId === occ.id
                                    ? String((patchOccMut.error as Error).message)
                                    : undefined
                                }
                                rescheduleError={
                                  rescheduleMut.isError && reschedulingId === occ.id
                                    ? String((rescheduleMut.error as Error).message)
                                    : undefined
                                }
                                existingDates={existingDates}
                                calDates={calDates}
                                onStartEdit={() => { setEditingId(occ.id); setReschedulingId(null) }}
                                onCancelEdit={() => setEditingId(null)}
                                onSaveEdit={(data) => patchOccMut.mutate({ id: occ.id, data })}
                                onDelete={() => deleteOccMut.mutate(occ.id)}
                                onStartReschedule={() => { setReschedulingId(occ.id); setEditingId(null) }}
                                onCancelReschedule={() => setReschedulingId(null)}
                                onReschedule={(nd, ns, ne, r) =>
                                  rescheduleMut.mutate({ id: occ.id, new_date: nd, new_start: ns, new_end: ne, reason: r })
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Add occurrence */}
                    {!isReadOnly && (
                      addingToMonth === monthKey ? (
                        <AddOccurrenceForm
                          form={addForm}
                          onChange={setAddForm}
                          existingDates={existingDates}
                          isPending={addOccMut.isPending}
                          error={addOccMut.isError ? String((addOccMut.error as Error).message) : undefined}
                          onSubmit={() =>
                            addOccMut.mutate({
                              year: sgMonth.year,
                              month: sgMonth.month,
                              data: { date: addForm.date, start_time: addForm.start_time, end_time: addForm.end_time },
                            })
                          }
                          onCancel={() => { setAddingToMonth(null); addOccMut.reset() }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAddToMonth(monthKey, sgMonth.year, sgMonth.month)}
                          className="btn btn-outline btn-sm"
                          style={{ alignSelf: 'flex-start' }}
                        >
                          + เพิ่มวันทำงาน
                        </button>
                      )
                    )}

                    {/* Payment summary */}
                    {(summary.lab_boy_count > 0 || summary.valid > 0) && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                        padding: '12px 16px',
                        background: 'var(--blue-bg)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-input)',
                      }}>
                        <SummaryCell label="วันทำงาน" value={`${summary.valid} วัน`} />
                        <SummaryCell label="รวมชั่วโมง" value={`${summary.valid_hours.toFixed(1)} ชม.`} />
                        <SummaryCell label="Lab Boy" value={`${summary.lab_boy_count} คน`} />
                        <SummaryCell label="อัตราค่าตอบแทน" value={`${summary.rate_per_hour_baht.toFixed(0)} บ./ชม.`} />
                        <SummaryCell label="ค่าตอบแทน/คน" value={`${summary.pay_per_person_baht.toFixed(2)} บ.`} />
                        <SummaryCell label="รวมทั้งหมด" value={`${summary.total_pay_baht.toFixed(2)} บ.`} highlight />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '7px 10px', fontWeight: 600, color: 'var(--ink-500)',
  textAlign: 'left', fontSize: 11, whiteSpace: 'nowrap',
}

function SummaryCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--ink-400)', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 700,
        color: highlight ? 'var(--blue)' : 'var(--ink-900)',
      }}>
        {value}
      </div>
    </div>
  )
}

// ─── AddMonthForm ─────────────────────────────────────────────────────────────

function AddMonthForm({
  form, onChange, existingMonthKeys, isPending, error, onSubmit, onCancel,
}: {
  form: { year: number; month: number }
  onChange: (f: { year: number; month: number }) => void
  existingMonthKeys: Set<string>
  isPending: boolean
  error?: string
  onSubmit: () => void
  onCancel: () => void
}) {
  const isDuplicate = existingMonthKeys.has(`${form.year}-${form.month}`)

  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--primary-50)',
      border: '2px dashed var(--primary-100)',
      borderRadius: 'var(--radius-card)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>เพิ่มเดือนปฏิบัติงาน</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>เดือน</label>
          <select
            value={form.month}
            onChange={(e) => onChange({ ...form, month: Number(e.target.value) })}
            className="form-input"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{MONTHS_TH[m - 1]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>ปี (ค.ศ.)</label>
          <input
            type="number"
            value={form.year}
            min={2020}
            max={2040}
            onChange={(e) => onChange({ ...form, year: Number(e.target.value) })}
            className="form-input"
            style={{ width: 96 }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-500)', paddingBottom: 1 }}>
          = {MONTHS_TH[form.month - 1]} {form.year + 543}
        </span>
      </div>

      {isDuplicate && (
        <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '4px 10px', borderRadius: 6 }}>
          เดือนนี้มีอยู่แล้ว
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '4px 10px', borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending || isDuplicate}
          className="btn btn-primary btn-sm"
        >
          {isPending ? 'กำลังเพิ่ม...' : 'เพิ่มเดือน'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

// ─── AddOccurrenceForm ────────────────────────────────────────────────────────

function AddOccurrenceForm({
  form, onChange, existingDates, isPending, error, onSubmit, onCancel,
}: {
  form: { date: string; start_time: string; end_time: string }
  onChange: (f: { date: string; start_time: string; end_time: string }) => void
  existingDates: string[]
  isPending: boolean
  error?: string
  onSubmit: () => void
  onCancel: () => void
}) {
  const isDuplicate = !!form.date && existingDates.includes(form.date)
  const timeError = validateTime(form.start_time, form.end_time)
  const canSubmit = !!form.date && !isDuplicate && !timeError

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--line-soft)',
      border: '1.5px solid var(--line)',
      borderRadius: 'var(--radius-input)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>เพิ่มวันทำงาน</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>วันที่</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
            className="form-input"
            style={isDuplicate ? { borderColor: 'var(--amber)', background: 'var(--amber-bg)' } : {}}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>เวลาเริ่ม</label>
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => onChange({ ...form, start_time: e.target.value })}
            className="form-input"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>เวลาสิ้นสุด</label>
          <input
            type="time"
            value={form.end_time}
            onChange={(e) => onChange({ ...form, end_time: e.target.value })}
            className="form-input"
          />
        </div>
        {form.date && (
          <span style={{ fontSize: 11, color: 'var(--ink-500)', paddingBottom: 2 }}>
            {formatThaiDate(form.date)}
          </span>
        )}
      </div>

      {isDuplicate && (
        <div style={{ fontSize: 12, color: 'var(--amber)' }}>วันที่นี้มีอยู่แล้วในเดือนนี้</div>
      )}
      {timeError && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>{timeError}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending || !canSubmit}
          className="btn btn-primary btn-sm"
        >
          {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

// ─── OccurrenceRows ───────────────────────────────────────────────────────────

function OccurrenceRows({
  occ, seq, isReadOnly, isEditing, isRescheduling,
  patchPending, deletePending, reschedulePending,
  patchError, rescheduleError,
  existingDates, calDates,
  onStartEdit, onCancelEdit, onSaveEdit,
  onDelete, onStartReschedule, onCancelReschedule, onReschedule,
}: {
  occ: WorkOccurrence
  seq: number
  isReadOnly: boolean
  isEditing: boolean
  isRescheduling: boolean
  patchPending: boolean
  deletePending: boolean
  reschedulePending: boolean
  patchError?: string
  rescheduleError?: string
  existingDates: string[]
  calDates: CalendarDate[]
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (data: PatchOccurrencePayload) => void
  onDelete: () => void
  onStartReschedule: () => void
  onCancelReschedule: () => void
  onReschedule: (newDate: string, newStart: string, newEnd: string, reason: string) => void
}) {
  const [editForm, setEditForm] = useState({
    date: occ.scheduled_date.slice(0, 10),
    start_time: occ.start_time,
    end_time: occ.end_time,
    status: occ.status,
    reason: occ.reason ?? '',
  })
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: '',
    new_start: occ.start_time,
    new_end: occ.end_time,
    reason: '',
  })
  const [holidayWorkReason, setHolidayWorkReason] = useState('')
  const [showHolidayWorkInput, setShowHolidayWorkInput] = useState(false)

  function handleStartEdit() {
    setEditForm({
      date: occ.scheduled_date.slice(0, 10),
      start_time: occ.start_time,
      end_time: occ.end_time,
      status: occ.status,
      reason: occ.reason ?? '',
    })
    onStartEdit()
  }

  function handleStartReschedule() {
    setRescheduleForm({ new_date: '', new_start: occ.start_time, new_end: occ.end_time, reason: '' })
    onStartReschedule()
  }

  function handleSaveEdit() {
    const patch: PatchOccurrencePayload = {}
    if (editForm.date !== occ.scheduled_date.slice(0, 10)) patch.date = editForm.date
    if (editForm.start_time !== occ.start_time) patch.start_time = editForm.start_time
    if (editForm.end_time !== occ.end_time) patch.end_time = editForm.end_time
    if (editForm.status !== occ.status) patch.status = editForm.status
    if (editForm.reason !== (occ.reason ?? '')) patch.reason = editForm.reason
    onSaveEdit(patch)
  }

  const isCancelled =
    occ.status === 'cancelled_holiday' ||
    occ.status === 'cancelled_other' ||
    occ.status === 'rescheduled'
  const isTerminal = occ.status === 'completed' || occ.status === 'absent'
  const canAct = !isReadOnly && !isTerminal

  const hasHolidayConflict = occ.calendar_date_id != null
  const holidayName = hasHolidayConflict
    ? (calDates.find((cd) => cd.id === occ.calendar_date_id)?.name ?? 'วันหยุด')
    : ''

  const editDateDuplicate = isEditing &&
    editForm.date !== occ.scheduled_date.slice(0, 10) &&
    existingDates.includes(editForm.date)
  const editTimeError = isEditing ? validateTime(editForm.start_time, editForm.end_time) : null
  const rescheduleTimeError = isRescheduling ? validateTime(rescheduleForm.new_start, rescheduleForm.new_end) : null
  const canSaveEdit = !editDateDuplicate && !editTimeError
  const canReschedule = !!rescheduleForm.new_date && !rescheduleTimeError

  const hours = computeHours(occ.start_time, occ.end_time)
  const dateStr = occ.scheduled_date.slice(0, 10)

  const rowBase: React.CSSProperties = {
    borderBottom: '1px solid var(--line)',
    fontSize: 12,
    opacity: isCancelled ? 0.65 : 1,
    background: isEditing || isRescheduling ? 'var(--primary-50)' : 'transparent',
    transition: 'background .1s',
  }

  return (
    <>
      {/* Main data row */}
      <tr style={rowBase}>
        <td style={tdStyle('var(--ink-400)')}>{seq}</td>
        <td style={{
          ...tdStyle(),
          fontWeight: 600,
          textDecoration: isCancelled ? 'line-through' : 'none',
          color: isCancelled ? 'var(--ink-400)' : 'var(--ink-900)',
          whiteSpace: 'nowrap',
        }}>
          {formatThaiDateLong(dateStr)}
        </td>
        <td style={{ ...tdStyle('var(--ink-500)'), textAlign: 'center' }}>
          {formatThaiWeekday(dateStr)}
        </td>
        <td style={{ ...tdStyle('var(--ink-600)'), fontVariantNumeric: 'tabular-nums' }}>{occ.start_time}</td>
        <td style={{ ...tdStyle('var(--ink-600)'), fontVariantNumeric: 'tabular-nums' }}>{occ.end_time}</td>
        <td style={{ ...tdStyle('var(--ink-700)'), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {hours.toFixed(1)}
        </td>
        <td style={tdStyle()}>
          <StatusBadge status={occ.status} />
          {occ.rescheduled_to_date && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--amber)' }}>
              → {occ.rescheduled_to_date.slice(0, 10)}
            </span>
          )}
        </td>
        <td style={{ ...tdStyle(), paddingRight: 8 }}>
          {canAct && !isEditing && !isRescheduling && (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleStartEdit} className="btn btn-ghost btn-xs">
                แก้ไข
              </button>
              {occ.status === 'scheduled' && (
                <button type="button" onClick={handleStartReschedule} className="btn btn-xs"
                  style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #FCD34D' }}>
                  เลื่อน
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={deletePending}
                className="btn btn-xs"
                style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', opacity: deletePending ? 0.5 : 1 }}
              >
                ลบ
              </button>
            </div>
          )}
          {isEditing && (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={patchPending || !canSaveEdit}
                className="btn btn-green btn-xs"
              >
                {patchPending ? '...' : 'บันทึก'}
              </button>
              <button type="button" onClick={onCancelEdit} className="btn btn-ghost btn-xs">
                ยกเลิก
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Holiday conflict row */}
      {hasHolidayConflict && !isEditing && !isRescheduling && (
        <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--amber-bg)' }}>
          <td colSpan={8} style={{ padding: '8px 10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--amber)' }}>
              <span style={{ fontWeight: 600 }}>🗓 วันหยุด: {holidayName}</span>
              {canAct && occ.status !== 'cancelled_holiday' && (
                <>
                  <button
                    type="button"
                    onClick={() => onSaveEdit({ status: 'cancelled_holiday' })}
                    className="btn btn-amber btn-xs"
                  >
                    ยกเลิกวันนี้
                  </button>
                  {showHolidayWorkInput ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={holidayWorkReason}
                        placeholder="ระบุเหตุผล"
                        onChange={(e) => setHolidayWorkReason(e.target.value)}
                        className="form-input"
                        style={{ width: 120 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onSaveEdit({ status: 'scheduled', reason: holidayWorkReason })
                          setShowHolidayWorkInput(false)
                          setHolidayWorkReason('')
                        }}
                        disabled={!holidayWorkReason.trim()}
                        className="btn btn-primary btn-xs"
                      >
                        ยืนยัน
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowHolidayWorkInput(false); setHolidayWorkReason('') }}
                        className="btn btn-ghost btn-xs"
                      >
                        ยกเลิก
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowHolidayWorkInput(true)}
                      className="btn btn-xs"
                      style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid #BFDBF5' }}
                    >
                      ทำงานพร้อมเหตุผล
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStartReschedule}
                    className="btn btn-xs"
                    style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #FCD34D' }}
                  >
                    เลื่อนไปวันอื่น
                  </button>
                </>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Edit form row */}
      {isEditing && (
        <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--primary-50)' }}>
          <td colSpan={8} style={{ padding: '12px 10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>วันที่</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="form-input"
                  style={editDateDuplicate ? { borderColor: 'var(--amber)', background: 'var(--amber-bg)' } : {}}
                />
              </div>
              <div>
                <label style={labelStyle}>เริ่ม</label>
                <input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label style={labelStyle}>สิ้นสุด</label>
                <input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label style={labelStyle}>สถานะ</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as OccurrenceStatus })}
                  className="form-input"
                >
                  <option value="scheduled">กำหนดการ</option>
                  <option value="cancelled_holiday">วันหยุด</option>
                  <option value="completed">เสร็จสิ้น</option>
                  <option value="absent">ขาด</option>
                  <option value="cancelled_other">ยกเลิก</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>หมายเหตุ</label>
                <input
                  type="text"
                  value={editForm.reason}
                  placeholder="ระบุเหตุผล (ถ้ามี)"
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  className="form-input"
                  style={{ width: 120 }}
                />
              </div>
              {editForm.date && (
                <span style={{ fontSize: 11, color: 'var(--ink-500)', paddingBottom: 2 }}>
                  {formatThaiDate(editForm.date)}
                </span>
              )}
            </div>
            {editDateDuplicate && <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>วันที่นี้มีอยู่แล้ว</p>}
            {editTimeError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{editTimeError}</p>}
            {patchError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{patchError}</p>}
          </td>
        </tr>
      )}

      {/* Reschedule form row */}
      {isRescheduling && (
        <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--amber-bg)' }}>
          <td colSpan={8} style={{ padding: '12px 10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>วันที่ใหม่</label>
                <input
                  type="date"
                  value={rescheduleForm.new_date}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_date: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label style={labelStyle}>เวลาเริ่ม</label>
                <input
                  type="time"
                  value={rescheduleForm.new_start}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_start: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label style={labelStyle}>เวลาสิ้นสุด</label>
                <input
                  type="time"
                  value={rescheduleForm.new_end}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_end: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label style={labelStyle}>เหตุผล</label>
                <input
                  type="text"
                  value={rescheduleForm.reason}
                  placeholder="ระบุเหตุผล"
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                  className="form-input"
                  style={{ width: 120 }}
                />
              </div>
              {rescheduleForm.new_date && (
                <span style={{ fontSize: 11, color: 'var(--ink-500)', paddingBottom: 2 }}>
                  {formatThaiDate(rescheduleForm.new_date)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onReschedule(rescheduleForm.new_date, rescheduleForm.new_start, rescheduleForm.new_end, rescheduleForm.reason)}
                disabled={reschedulePending || !canReschedule}
                className="btn btn-amber btn-sm"
              >
                {reschedulePending ? '...' : 'ยืนยันการเลื่อน'}
              </button>
              <button
                type="button"
                onClick={onCancelReschedule}
                className="btn btn-ghost btn-sm"
              >
                ยกเลิก
              </button>
            </div>
            {rescheduleTimeError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{rescheduleTimeError}</p>}
            {rescheduleError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{rescheduleError}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

const tdStyle = (color?: string): React.CSSProperties => ({
  padding: '8px 10px', color: color ?? 'var(--ink-700)', verticalAlign: 'middle',
})

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--ink-500)', marginBottom: 4,
}
