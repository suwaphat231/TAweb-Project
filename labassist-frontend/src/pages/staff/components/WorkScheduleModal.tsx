import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  StaffCaseResponse, GroupMonthPlan, CalendarDate, UpdateCasePayload, GroupWeekDaySlot,
} from '../../../types'
import { MonthlyWorkPlanCard, parseGroupSlots, MONTH_NAMES } from './MonthlyWorkPlanCard'
import { OverallScheduleSummary } from './OverallScheduleSummary'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_OPTIONS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี',
  FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}

function parseCourseScheduleToSlot(schedule: string): GroupWeekDaySlot | null {
  if (!schedule) return null
  const timeMatch = schedule.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (!timeMatch) return null
  const pad = (t: string) => t.length === 4 ? '0' + t : t
  let day = ''
  if (/พฤหัส|พฤ\.|\bTHU\b/i.test(schedule)) day = 'THU'
  else if (/\bMON\b|จันทร์/i.test(schedule)) day = 'MON'
  else if (/\bTUE\b|อังคาร/i.test(schedule)) day = 'TUE'
  else if (/\bWED\b|พุธ/i.test(schedule)) day = 'WED'
  else if (/\bFRI\b|ศุกร์/i.test(schedule)) day = 'FRI'
  else if (/\bSAT\b|เสาร์/i.test(schedule)) day = 'SAT'
  else if (/\bSUN\b|อาทิตย์/i.test(schedule)) day = 'SUN'
  if (!day) return null
  return { day, start_time: pad(timeMatch[1]), end_time: pad(timeMatch[2]) }
}

function computeHours(s: string, e: string): number | null {
  if (!s || !e) return null
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  const m = (eh * 60 + em) - (sh * 60 + sm)
  return m > 0 ? m / 60 : null
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkScheduleModalProps {
  caseId?: number
  courseId: number
  courseCode: string
  courseTitle: string
  sectionNo: number
  semester: string
  academicYear: number
  labBoyCount: number
  courseSchedule?: string
  onClose: () => void
  onSaved: () => void
}

type TabKey = 'plan' | 'summary'

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkScheduleModal({
  caseId, courseId, courseCode, courseTitle, sectionNo,
  semester, academicYear, labBoyCount, courseSchedule,
  onClose, onSaved,
}: WorkScheduleModalProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('plan')
  const [innerCaseId, setInnerCaseId] = useState<number | undefined>(caseId)
  const [rateBaht, setRateBaht] = useState(50)
  const [rateInit, setRateInit] = useState(false)
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [addYear, setAddYear] = useState(new Date().getFullYear())
  const [addMonth, setAddMonth] = useState(new Date().getMonth() + 1)
  const [addSlots, setAddSlots] = useState<GroupWeekDaySlot[]>([{ day: 'MON', start_time: '13:00', end_time: '16:00' }])

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: staffCase } = useQuery<StaffCaseResponse>({
    queryKey: ['staff-case', innerCaseId],
    queryFn: () => staffApi.getCase(innerCaseId!),
    enabled: !!innerCaseId,
  })
  const { data: monthlyPlan = [] } = useQuery<GroupMonthPlan[]>({
    queryKey: ['monthly-plan', innerCaseId],
    queryFn: () => staffApi.getMonthlyPlan(innerCaseId!),
    enabled: !!innerCaseId,
  })
  const { data: calDates = [] } = useQuery<CalendarDate[]>({
    queryKey: ['calendar-dates', innerCaseId],
    queryFn: () => staffApi.listCalendarDates(innerCaseId!),
    enabled: !!innerCaseId,
  })

  // Pre-fill rate from loaded case (once)
  useEffect(() => {
    if (staffCase && !rateInit) {
      setRateBaht(staffCase.rate_per_hour_satang > 0 ? staffCase.rate_per_hour_satang / 100 : 50)
      setRateInit(true)
    }
  }, [staffCase, rateInit])

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const initCaseMut = useMutation({
    mutationFn: () => staffApi.initCase(courseId),
    onSuccess: (res) => {
      setInnerCaseId(res.id)
      qc.invalidateQueries({ queryKey: ['staff-cases'] })
    },
  })

  const updateCaseMut = useMutation({
    mutationFn: (data: UpdateCasePayload) => staffApi.updateCase(innerCaseId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-case', innerCaseId] })
      qc.invalidateQueries({ queryKey: ['staff-cases'] })
      onSaved()
    },
  })

  const confirmMut = useMutation({
    mutationFn: async () => {
      const { earliest, latest } = deriveDates()
      await staffApi.updateCase(innerCaseId!, {
        work_start_date: earliest || undefined,
        work_end_date: latest || undefined,
        rate_per_hour: rateBaht > 0 ? rateBaht : undefined,
      })
      await staffApi.lockPlan(innerCaseId!)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-case', innerCaseId] })
      qc.invalidateQueries({ queryKey: ['staff-cases'] })
      onSaved()
      onClose()
    },
  })

  const addMonthMut = useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const validSlots = addSlots.filter(s => s.day && s.start_time && s.end_time)
      const first = validSlots[0] ?? { day: 'MON', start_time: '13:00', end_time: '16:00' }
      const newGroup = await staffApi.addScheduleGroup(innerCaseId!, {
        week_day: first.day,
        start_time: first.start_time,
        end_time: first.end_time,
        week_day_slots: validSlots.length > 0 ? validSlots : undefined,
      })
      await staffApi.addGroupMonth(innerCaseId!, newGroup.id, { year, month })
      await staffApi.generateMonthOccurrences(innerCaseId!, newGroup.id, year, month)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-plan', innerCaseId] })
      setShowAddMonth(false)
    },
  })

  function openAddMonth() {
    let slots: GroupWeekDaySlot[] = []
    // 1. Try to parse from course schedule string
    if (courseSchedule) {
      const parsed = parseCourseScheduleToSlot(courseSchedule)
      if (parsed) slots = [parsed]
    }
    // 2. Fall back to last month's group schedule
    if (slots.length === 0 && monthlyPlan.length > 0) {
      const last = monthlyPlan[monthlyPlan.length - 1]?.group
      if (last) slots = parseGroupSlots(last)
    }
    // 3. Default
    if (slots.length === 0) slots = [{ day: 'MON', start_time: '13:00', end_time: '16:00' }]
    setAddSlots(slots)
    setShowAddMonth(true)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function deriveDates() {
    let earliest = '', latest = ''
    for (const gp of monthlyPlan) {
      for (const entry of gp.months) {
        for (const occ of entry.occurrences) {
          if (!earliest || occ.scheduled_date < earliest) earliest = occ.scheduled_date
          if (!latest || occ.scheduled_date > latest) latest = occ.scheduled_date
        }
      }
    }
    return { earliest, latest }
  }

  function handleSaveDraft() {
    const { earliest, latest } = deriveDates()
    updateCaseMut.mutate({
      work_start_date: earliest || undefined,
      work_end_date: latest || undefined,
      rate_per_hour: rateBaht > 0 ? rateBaht : undefined,
    })
  }

  const planLocked = staffCase?.status === 'plan_locked' || staffCase?.status === 'done'

  const usedMonthKeys = new Set(
    monthlyPlan.flatMap(gp => gp.months.map(m => `${m.month.year}-${m.month.month}`)),
  )

  function getConfirmErrors(): string[] {
    const errs: string[] = []
    if (labBoyCount === 0) errs.push('ยังไม่มี Lab Boy ที่ได้รับเลือก')
    if (monthlyPlan.length === 0) errs.push('ยังไม่มีเดือนปฏิบัติงาน')
    const totalValid = monthlyPlan.reduce((acc, gp) =>
      acc + gp.months.reduce((s, m) => s + m.summary.valid, 0), 0)
    if (totalValid === 0) errs.push('ยังไม่มีวันทำงาน — เพิ่มวันในแต่ละเดือน')
    if (rateBaht <= 0) errs.push('กรุณากำหนดอัตราค่าตอบแทน')
    return errs
  }

  const confirmErrors = getConfirmErrors()

  // Flatten and sort cards chronologically
  const cards = monthlyPlan
    .flatMap(gp => gp.months.map(entry => ({
      group: gp.group,
      entry,
      key: `${gp.group.id}-${entry.month.year}-${entry.month.month}`,
    })))
    .sort((a, b) =>
      a.entry.month.year !== b.entry.month.year
        ? a.entry.month.year - b.entry.month.year
        : a.entry.month.month - b.entry.month.month,
    )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '24px 12px',
      }}
      role="dialog" aria-modal="true" aria-label="กำหนดตารางปฏิบัติงาน"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-card)',
        width: '100%', maxWidth: 900,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 48px)',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 22px 14px', borderBottom: '1.5px solid var(--line)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>
                  กำหนดตารางปฏิบัติงาน Lab Boy
                </span>
                {planLocked
                  ? <span className="badge badge-green">กำหนดแล้ว</span>
                  : innerCaseId ? <span className="badge badge-amber">ฉบับร่าง</span>
                  : null}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>
                {courseCode} · {courseTitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                กลุ่ม {sectionNo} · ภาคเรียน {semester}/{academicYear}
                {' · Lab Boy '}
                <strong style={{ color: labBoyCount > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {labBoyCount} คน
                </strong>
                {courseSchedule && <> · {courseSchedule}</>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด"
              style={{
                width: 32, height: 32, border: 'none', background: 'var(--line-soft)',
                color: 'var(--ink-600)', borderRadius: 6, cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
              ✕
            </button>
          </div>
        </div>

        {/* ── No case yet ── */}
        {!innerCaseId ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>
              ยังไม่มีข้อมูลตารางงานสำหรับวิชานี้
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 24 }}>
              สร้างระบบตารางงาน Lab Boy เพื่อเริ่มกำหนดวันปฏิบัติงาน
            </p>
            {initCaseMut.isError && (
              <div style={{
                padding: '8px 12px', background: 'var(--red-bg)',
                border: '1px solid #FCA5A5', borderRadius: 'var(--radius-input)',
                fontSize: 12, color: 'var(--red)', maxWidth: 360, margin: '0 auto 16px',
              }}>
                {(initCaseMut.error as Error).message}
              </div>
            )}
            <button type="button" onClick={() => initCaseMut.mutate()}
              disabled={initCaseMut.isPending} className="btn btn-primary">
              {initCaseMut.isPending ? 'กำลังสร้าง...' : 'เริ่มต้นระบบตารางงาน'}
            </button>
          </div>
        ) : (
          <>
            {/* ── Tabs ── */}
            <div style={{ display: 'flex', borderBottom: '1.5px solid var(--line)', flexShrink: 0 }}>
              {([
                { key: 'plan', label: 'แผนปฏิบัติงานรายเดือน' },
                { key: 'summary', label: 'ตรวจสอบและยืนยัน' },
              ] as { key: TabKey; label: string }[]).map(t => (
                <button key={t.key} type="button"
                  onClick={() => setActiveTab(t.key)}
                  aria-selected={activeTab === t.key}
                  className={`tab-btn${activeTab === t.key ? ' active' : ''}`}>
                  {t.label}
                  {t.key === 'summary' && confirmErrors.length > 0 && !planLocked && (
                    <span style={{
                      marginLeft: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                      background: 'var(--amber)', color: '#fff',
                    }}>
                      {confirmErrors.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab body ── */}
            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

              {activeTab === 'plan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {cards.length === 0 && (
                    <div style={{
                      textAlign: 'center', color: 'var(--ink-400)', fontSize: 13,
                      padding: '32px 0', border: '2px dashed var(--line)',
                      borderRadius: 'var(--radius-card)',
                    }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                      <div style={{ fontWeight: 600, color: 'var(--ink-600)', marginBottom: 4 }}>
                        ยังไม่มีเดือนปฏิบัติงาน
                      </div>
                      <div>กด "เพิ่มเดือนปฏิบัติงาน" ด้านล่างเพื่อเริ่มต้น</div>
                    </div>
                  )}

                  {cards.map(({ group, entry, key }) => (
                    <MonthlyWorkPlanCard
                      key={key}
                      caseId={innerCaseId}
                      group={group}
                      entry={entry}
                      calDates={calDates}
                      isReadOnly={planLocked}
                    />
                  ))}

                  {/* Add month */}
                  {!planLocked && (
                    showAddMonth ? (
                      <div style={{
                        padding: '16px 18px', border: '2px dashed var(--primary-100)',
                        borderRadius: 'var(--radius-card)', background: 'var(--primary-50)',
                        display: 'flex', flexDirection: 'column', gap: 14,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                          เพิ่มเดือนปฏิบัติงาน
                        </div>

                        {/* Month / year picker */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                            เดือนที่ต้องการเพิ่ม
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={addMonth} onChange={e => setAddMonth(Number(e.target.value))}
                              className="form-input" style={{ width: 148 }}>
                              {MONTH_NAMES.map((name, i) => (
                                <option key={i + 1} value={i + 1}>{name}</option>
                              ))}
                            </select>
                            <input type="number" value={addYear} onChange={e => setAddYear(Number(e.target.value))}
                              className="form-input" style={{ width: 88 }} min={2024} max={2040} />
                            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>ค.ศ. (พ.ศ. {addYear + 543})</span>
                          </div>
                          {usedMonthKeys.has(`${addYear}-${addMonth}`) && (
                            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 5 }}>
                              เดือน{MONTH_NAMES[addMonth - 1]} {addYear + 543} มีอยู่แล้ว
                            </div>
                          )}
                        </div>

                        {/* Weekly schedule editor */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                            ตารางปฏิบัติงานประจำสัปดาห์
                          </div>
                          {courseSchedule && (
                            <div style={{ fontSize: 12, color: 'var(--ink-500)', background: 'var(--line-soft)', padding: '5px 10px', borderRadius: 'var(--radius-input)', marginBottom: 8 }}>
                              ตารางรายวิชา: <strong>{courseSchedule}</strong>
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {addSlots.map((s, i) => {
                              const hrs = computeHours(s.start_time, s.end_time)
                              return (
                                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <select value={s.day}
                                    onChange={e => setAddSlots(addSlots.map((sl, idx) => idx === i ? { ...sl, day: e.target.value } : sl))}
                                    className="form-input" style={{ width: 132 }}>
                                    <option value="">เลือกวัน</option>
                                    {DAY_OPTIONS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                                  </select>
                                  <input type="time" value={s.start_time}
                                    onChange={e => setAddSlots(addSlots.map((sl, idx) => idx === i ? { ...sl, start_time: e.target.value } : sl))}
                                    className="form-input" style={{ width: 106 }} />
                                  <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>–</span>
                                  <input type="time" value={s.end_time}
                                    onChange={e => setAddSlots(addSlots.map((sl, idx) => idx === i ? { ...sl, end_time: e.target.value } : sl))}
                                    className="form-input" style={{ width: 106 }} />
                                  {hrs !== null && (
                                    <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{hrs.toFixed(1)} ชม.</span>
                                  )}
                                  {addSlots.length > 1 && (
                                    <button type="button"
                                      onClick={() => setAddSlots(addSlots.filter((_, idx) => idx !== i))}
                                      className="btn btn-xs"
                                      style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5' }}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            {addSlots.length < 4 && (
                              <button type="button"
                                onClick={() => setAddSlots([...addSlots, { day: '', start_time: '', end_time: '' }])}
                                style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                                + เพิ่มวัน
                              </button>
                            )}
                          </div>
                        </div>

                        {addMonthMut.isError && (
                          <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'var(--red-bg)', borderRadius: 'var(--radius-input)' }}>
                            {(addMonthMut.error as Error).message}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button"
                            onClick={() => addMonthMut.mutate({ year: addYear, month: addMonth })}
                            disabled={addMonthMut.isPending || usedMonthKeys.has(`${addYear}-${addMonth}`) || !addSlots.some(s => s.day && s.start_time && s.end_time)}
                            className="btn btn-primary btn-sm">
                            {addMonthMut.isPending ? 'กำลังสร้าง...' : `เพิ่ม${MONTH_NAMES[addMonth - 1]} + สร้างวันอัตโนมัติ`}
                          </button>
                          <button type="button" onClick={() => setShowAddMonth(false)}
                            className="btn btn-ghost btn-sm">
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={openAddMonth}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          width: '100%', padding: 12, border: '2px dashed var(--line)',
                          borderRadius: 'var(--radius-card)', background: 'transparent',
                          color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                        + เพิ่มเดือนปฏิบัติงาน
                      </button>
                    )
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <OverallScheduleSummary
                  monthlyPlan={monthlyPlan}
                  labBoyCount={labBoyCount}
                  rateBaht={rateBaht}
                  onRateChange={setRateBaht}
                  onSaveRate={() => updateCaseMut.mutate({ rate_per_hour: rateBaht })}
                  isSavingRate={updateCaseMut.isPending}
                  confirmErrors={confirmErrors}
                  planLocked={planLocked}
                />
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{
              padding: '12px 22px', borderTop: '1.5px solid var(--line)',
              display: 'flex', gap: 8, justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {planLocked ? (
                  <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                    ✓ ยืนยันตารางแล้ว
                  </span>
                ) : confirmErrors.length > 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                    {confirmErrors[0]}{confirmErrors.length > 1 ? ` (+${confirmErrors.length - 1})` : ''}
                  </span>
                ) : null}
                {confirmMut.isError && (
                  <span style={{ fontSize: 12, color: 'var(--red)', display: 'block' }}>
                    {(confirmMut.error as Error).message}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={onClose} className="btn btn-ghost">
                  ยกเลิก
                </button>
                {!planLocked && (
                  <button type="button" onClick={handleSaveDraft}
                    disabled={updateCaseMut.isPending}
                    className="btn btn-outline">
                    {updateCaseMut.isPending ? 'กำลังบันทึก...' : 'บันทึกฉบับร่าง'}
                  </button>
                )}
                {!planLocked && (
                  <button type="button"
                    onClick={() => confirmMut.mutate()}
                    disabled={confirmMut.isPending || confirmErrors.length > 0}
                    className="btn btn-green"
                    title={confirmErrors.length > 0 ? confirmErrors.join(' | ') : undefined}>
                    {confirmMut.isPending ? 'กำลังยืนยัน...' : 'ยืนยันตารางปฏิบัติงาน'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
