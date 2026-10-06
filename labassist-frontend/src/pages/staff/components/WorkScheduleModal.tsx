import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  StaffCaseResponse, GroupMonthPlan, CalendarDate, UpdateCasePayload,
  GroupWeekDaySlot, CourseScheduleSlot,
} from '../../../types'
import { MonthlyWorkPlanCard, MONTH_NAMES } from './MonthlyWorkPlanCard'
import { OverallScheduleSummary } from './OverallScheduleSummary'
import { formatThaiDate, toDateOnly } from '../../../utils/thaiDate'

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_TO_CODE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const WEEKDAY_LABEL_TH: Record<number, string> = {
  0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร',
  3: 'พุธ',     4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์',
}

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const SEMESTER_MONTHS: Record<string, number[]> = {
  '1': [7, 8, 9, 10],
  '2': [12, 1, 2, 3],
  'S': [6, 7],
}

const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  'S': 'ภาคฤดูร้อน',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursFromSlot(slot: CourseScheduleSlot): number {
  const [sh, sm] = slot.start_time.split(':').map(Number)
  const [eh, em] = slot.end_time.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

function thaiFmt(dateStr: string): string {
  return formatThaiDate(dateStr)
}

/** Returns the CE year for a given semester month, accounting for semester 2 / summer year wrap. */
function monthCEYear(month: number, semester: string, academicYearBE: number): number {
  const base = academicYearBE - 543
  if (semester === '2' && month <= 3) return base + 1
  if (semester === 'S') return base + 1
  return base
}

/** Generate all dates in a CE month that fall on any of the given weekdays. */
function candidateDates(ceYear: number, month: number, weekdays: number[]): string[] {
  const wdSet = new Set(weekdays)
  const daysInMonth = new Date(ceYear, month, 0).getDate()
  const result: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(ceYear, month - 1, d).getDay()
    if (wdSet.has(wd)) {
      result.push(
        `${ceYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      )
    }
  }
  return result
}

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── AddMonthWizard ───────────────────────────────────────────────────────────

interface AddMonthWizardProps {
  caseId: number
  courseScheduleSlots: CourseScheduleSlot[]
  calDates: CalendarDate[]
  usedMonthKeys: Set<string>
  rateBaht: number
  labBoyCount: number
  labBoyIds: number[]
  onDone: () => void
  onCancel: () => void
}

function AddMonthWizard({
  caseId, courseScheduleSlots, calDates, usedMonthKeys,
  rateBaht, labBoyCount, labBoyIds, onDone, onCancel,
}: AddMonthWizardProps) {
  const qc = useQueryClient()
  const now = new Date()
  const [beYear, setBeYear] = useState(now.getFullYear() + 543)
  const [month, setMonth] = useState(now.getMonth() + 1)
  // Manual override slots — only shown when course schedule is unavailable
  const [manualSlots, setManualSlots] = useState<GroupWeekDaySlot[]>([
    { day: 'MON', start_time: '13:00', end_time: '16:00' },
  ])
  const [showManual, setShowManual] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  const ceYear = beYear - 543
  const monthKey = `${ceYear}-${month}`
  const alreadyAdded = usedMonthKeys.has(monthKey)

  // Effective slots: course schedule → manual override
  const hasCourseSched = courseScheduleSlots.length > 0
  const effectiveSlots: CourseScheduleSlot[] = hasCourseSched && !showManual
    ? courseScheduleSlots
    : manualSlots.filter(s => s.day && s.start_time && s.end_time).map(s => ({
        weekday: ['SUN','MON','TUE','WED','THU','FRI','SAT'].indexOf(s.day),
        start_time: s.start_time,
        end_time: s.end_time,
      })).filter(s => s.weekday >= 0)

  const weekdays = effectiveSlots.map(s => s.weekday)
  const candidates = useMemo(
    () => candidateDates(ceYear, month, weekdays),
    [ceYear, month, JSON.stringify(weekdays)],
  )

  // Build holiday set from calDates
  const holidayDateSet = useMemo(() => {
    const s = new Set<string>()
    for (const cd of calDates) {
      if (cd.affects_work) s.add(cd.date.slice(0, 10))
    }
    return s
  }, [calDates])

  const holidayInfoMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const cd of calDates) {
      if (cd.affects_work) m.set(cd.date.slice(0, 10), cd.name)
    }
    return m
  }, [calDates])

  // Initialise selectedDates when candidates change
  useEffect(() => {
    if (candidates.length > 0) {
      setSelectedDates(new Set(candidates.filter(d => !holidayDateSet.has(d))))
    } else {
      setSelectedDates(new Set())
    }
    setInitialized(true)
  }, [candidates.join(','), holidayDateSet.size])

  // Live summary
  const totalProposed = candidates.length
  const totalSelected = selectedDates.size
  const selectedHolidays = [...selectedDates].filter(d => holidayDateSet.has(d)).length
  const payableDays = totalSelected - selectedHolidays
  const hoursPerSession = effectiveSlots.length > 0 ? hoursFromSlot(effectiveSlots[0]) : 0
  const totalHours = payableDays * hoursPerSession
  const totalPay = totalHours * rateBaht * labBoyCount

  const addMonthMut = useMutation({
    mutationFn: async () => {
      const weekDaySlots: GroupWeekDaySlot[] = effectiveSlots.map(s => ({
        day: WEEKDAY_TO_CODE[s.weekday],
        start_time: s.start_time,
        end_time: s.end_time,
      }))
      const first = weekDaySlots[0]
      const newGroup = await staffApi.addScheduleGroup(caseId, {
        week_day: first.day,
        start_time: first.start_time,
        end_time: first.end_time,
        week_day_slots: weekDaySlots,
        hours_per_session: hoursPerSession > 0 ? hoursPerSession : undefined,
      })
      // If any subsequent step fails, delete the newly created group so no
      // orphaned data is left behind and a clean retry is possible.
      try {
        await staffApi.addGroupMonth(caseId, newGroup.id, { year: ceYear, month })
        const sorted = [...selectedDates].sort()
        await staffApi.setGroupMonthDates(caseId, newGroup.id, ceYear, month, sorted)
        if (labBoyIds.length > 0) {
          await staffApi.assignGroupStudents(caseId, newGroup.id, labBoyIds)
        }
      } catch (err) {
        await staffApi.deleteScheduleGroup(caseId, newGroup.id).catch(() => {})
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-plan', caseId] })
      onDone()
    },
  })

  const canSave = !alreadyAdded && selectedDates.size > 0 && effectiveSlots.length > 0 && initialized

  function toggleDate(d: string) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  function selectAll() { setSelectedDates(new Set(candidates)) }
  function clearAll() { setSelectedDates(new Set()) }
  function selectNonHoliday() {
    setSelectedDates(new Set(candidates.filter(d => !holidayDateSet.has(d))))
  }

  return (
    <div style={{
      border: '2px dashed var(--primary-100)', borderRadius: 'var(--radius-card)',
      background: 'var(--primary-50)', overflow: 'hidden',
    }}>
      {/* Wizard header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--primary-100)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
          เพิ่มเดือนปฏิบัติงาน
        </span>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Step 1: Month + Year */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            ขั้นตอนที่ 1 — เลือกเดือน
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="form-input" style={{ width: 148 }}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>พ.ศ.</span>
              <input type="number" value={beYear}
                onChange={e => setBeYear(Number(e.target.value))}
                className="form-input" style={{ width: 88 }}
                min={2567} max={2583} />
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>(ค.ศ. {ceYear})</span>
            </div>
          </div>
          {alreadyAdded && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 5 }}>
              เดือน{MONTH_NAMES_TH[month - 1]} พ.ศ. {beYear} มีอยู่แล้วในแผน
            </div>
          )}
        </div>

        {/* Step 2: Course schedule display */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            ขั้นตอนที่ 2 — ตารางวันเรียน
          </div>
          {hasCourseSched && !showManual ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '8px 12px', background: '#fff',
              border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 2 }}>
                  ดึงจากข้อมูลรายวิชา — วันทำงานทุกสัปดาห์
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {effectiveSlots.map((s, i) => (
                    <span key={i} className="badge badge-primary">
                      {WEEKDAY_LABEL_TH[s.weekday]} {s.start_time}–{s.end_time}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button"
                onClick={() => setShowManual(true)}
                style={{ fontSize: 11, color: 'var(--ink-500)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                แก้ไขเฉพาะเดือนนี้
              </button>
            </div>
          ) : !hasCourseSched && !showManual ? (
            <div style={{
              padding: '10px 12px', background: 'var(--amber-bg)',
              border: '1px solid #FCD34D', borderRadius: 'var(--radius-input)',
              fontSize: 12, color: 'var(--amber)',
            }}>
              ไม่พบข้อมูลตารางเรียนในระบบ — กรุณากำหนดวันด้วยตนเอง
              <button type="button" onClick={() => setShowManual(true)}
                style={{ marginLeft: 8, fontWeight: 700, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                กำหนดตาราง
              </button>
            </div>
          ) : (
            /* Manual slot editor */
            <div style={{ background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)', padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-600)', marginBottom: 8, fontWeight: 600 }}>
                กำหนดวันปฏิบัติงานประจำสัปดาห์สำหรับเดือนนี้
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {manualSlots.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={s.day}
                      onChange={e => setManualSlots(manualSlots.map((sl, idx) => idx === i ? { ...sl, day: e.target.value } : sl))}
                      className="form-input" style={{ width: 132 }}>
                      <option value="">เลือกวัน</option>
                      {WEEKDAY_TO_CODE.slice(1).concat('SUN').map((d, di) => {
                        const wd = di < 6 ? di + 1 : 0
                        return <option key={d} value={d}>{WEEKDAY_LABEL_TH[wd]}</option>
                      })}
                    </select>
                    <input type="time" value={s.start_time}
                      onChange={e => setManualSlots(manualSlots.map((sl, idx) => idx === i ? { ...sl, start_time: e.target.value } : sl))}
                      className="form-input" style={{ width: 106 }} />
                    <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>–</span>
                    <input type="time" value={s.end_time}
                      onChange={e => setManualSlots(manualSlots.map((sl, idx) => idx === i ? { ...sl, end_time: e.target.value } : sl))}
                      className="form-input" style={{ width: 106 }} />
                    {manualSlots.length > 1 && (
                      <button type="button"
                        onClick={() => setManualSlots(manualSlots.filter((_, idx) => idx !== i))}
                        className="btn btn-xs"
                        style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5' }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {manualSlots.length < 4 && (
                  <button type="button"
                    onClick={() => setManualSlots([...manualSlots, { day: '', start_time: '', end_time: '' }])}
                    style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    + เพิ่มวัน
                  </button>
                )}
              </div>
              {hasCourseSched && (
                <button type="button" onClick={() => setShowManual(false)}
                  style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-400)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← กลับไปใช้ตารางรายวิชา
                </button>
              )}
            </div>
          )}
        </div>

        {/* Step 3: Date selection */}
        {candidates.length > 0 && initialized && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                ขั้นตอนที่ 3 — เลือกวันทำงาน ({totalSelected}/{totalProposed})
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={selectNonHoliday}
                  style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  เลือกอัตโนมัติ
                </button>
                <span style={{ color: 'var(--line)', fontSize: 11 }}>|</span>
                <button type="button" onClick={selectAll}
                  style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ทั้งหมด
                </button>
                <span style={{ color: 'var(--line)', fontSize: 11 }}>|</span>
                <button type="button" onClick={clearAll}
                  style={{ fontSize: 11, color: 'var(--ink-400)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ล้าง
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 5,
              background: '#fff', border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius-input)', padding: '10px 12px',
              maxHeight: 220, overflowY: 'auto',
            }}>
              {candidates.map(d => {
                const isHoliday = holidayDateSet.has(d)
                const holidayName = holidayInfoMap.get(d)
                const checked = selectedDates.has(d)
                return (
                  <label key={d} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '4px 6px', borderRadius: 6, cursor: 'pointer',
                    background: isHoliday ? 'var(--red-bg)' : checked ? 'var(--primary-50)' : 'transparent',
                    border: `1px solid ${isHoliday ? '#FCA5A5' : checked ? 'var(--primary-100)' : 'transparent'}`,
                    fontSize: 12,
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDate(d)}
                      style={{ accentColor: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ color: isHoliday ? 'var(--red)' : 'var(--ink-900)', fontWeight: isHoliday ? 600 : 400 }}>
                      {thaiFmt(d)}
                    </span>
                    {isHoliday && (
                      <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}
                        title={holidayName}>วันหยุด</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {effectiveSlots.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--amber)', padding: '8px 10px', background: 'var(--amber-bg)', borderRadius: 'var(--radius-input)' }}>
            กรุณากำหนดวันปฏิบัติงานก่อน
          </div>
        )}

        {/* Live summary */}
        {initialized && candidates.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8,
            padding: '10px 12px', background: '#fff', border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius-input)',
          }}>
            {[
              { label: 'วันที่เสนอ', value: `${totalProposed} วัน` },
              { label: 'เลือก', value: `${totalSelected} วัน`, hi: true },
              { label: 'วันหยุด (ในที่เลือก)', value: `${selectedHolidays} วัน` },
              { label: 'วันนับจ่าย', value: `${payableDays} วัน`, hi: true },
              { label: 'ชั่วโมงรวม', value: `${totalHours.toFixed(1)} ชม.` },
              { label: 'ค่าตอบแทนรวม', value: `${totalPay.toFixed(0)} บาท`, hi: true },
            ].map((row, i) => (
              <div key={i} style={{ fontSize: 11 }}>
                <div style={{ color: 'var(--ink-500)' }}>{row.label}</div>
                <div style={{ fontWeight: 700, color: row.hi ? 'var(--primary)' : 'var(--ink-900)', fontSize: 13 }}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {addMonthMut.isError && (
          <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'var(--red-bg)', borderRadius: 'var(--radius-input)' }}>
            {(addMonthMut.error as Error).message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button"
            onClick={() => addMonthMut.mutate()}
            disabled={addMonthMut.isPending || !canSave}
            className="btn btn-primary btn-sm">
            {addMonthMut.isPending
              ? 'กำลังบันทึก...'
              : `บันทึก${MONTH_NAMES_TH[month - 1]} พ.ศ. ${beYear}`}
          </button>
          <button type="button" onClick={onCancel}
            className="btn btn-ghost btn-sm">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}

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
        rate_per_hour: rateBaht > 0 ? Math.round(rateBaht * 100) : undefined,
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

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function deriveDates() {
    let earliest = '', latest = ''
    for (const gp of monthlyPlan) {
      for (const entry of gp.months) {
        for (const occ of entry.occurrences) {
          const d = toDateOnly(occ.scheduled_date) ?? ''
          if (d && (!earliest || d < earliest)) earliest = d
          if (d && (!latest || d > latest)) latest = d
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
      rate_per_hour: rateBaht > 0 ? Math.round(rateBaht * 100) : undefined,
    })
  }

  const planLocked = staffCase?.status === 'plan_locked' || staffCase?.status === 'done'

  const usedMonthKeys = new Set(
    monthlyPlan.flatMap(gp => gp.months.map(m => `${m.month.year}-${m.month.month}`)),
  )

  const batchAddMut = useMutation({
    mutationFn: async () => {
      const slots = staffCase?.course_schedule_slots ?? []
      if (slots.length === 0) throw new Error('ไม่พบข้อมูลตารางเรียน')
      const months = SEMESTER_MONTHS[semester] ?? []
      const holidaySet = new Set(
        calDates.filter(cd => cd.affects_work).map(cd => cd.date.slice(0, 10)),
      )
      const weekdays = slots.map(s => s.weekday)
      const hoursPerSession = hoursFromSlot(slots[0])
      const weekDaySlots: GroupWeekDaySlot[] = slots.map(s => ({
        day: WEEKDAY_TO_CODE[s.weekday],
        start_time: s.start_time,
        end_time: s.end_time,
      }))
      const newGroup = await staffApi.addScheduleGroup(innerCaseId!, {
        week_day: weekDaySlots[0].day,
        start_time: weekDaySlots[0].start_time,
        end_time: weekDaySlots[0].end_time,
        week_day_slots: weekDaySlots,
        hours_per_session: hoursPerSession > 0 ? hoursPerSession : undefined,
      })
      try {
        for (const m of months) {
          const ceYear = monthCEYear(m, semester, academicYear)
          if (usedMonthKeys.has(`${ceYear}-${m}`)) continue
          const dates = candidateDates(ceYear, m, weekdays).filter(d => !holidaySet.has(d))
          await staffApi.addGroupMonth(innerCaseId!, newGroup.id, { year: ceYear, month: m })
          await staffApi.setGroupMonthDates(innerCaseId!, newGroup.id, ceYear, m, dates)
        }
      } catch (err) {
        await staffApi.deleteScheduleGroup(innerCaseId!, newGroup.id).catch(() => {})
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-plan', innerCaseId] })
    },
  })

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

  // Sort cards chronologically
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
                  {cards.length === 0 && !showAddMonth && (
                    <div style={{
                      textAlign: 'center', color: 'var(--ink-400)', fontSize: 13,
                      padding: '32px 0', border: '2px dashed var(--line)',
                      borderRadius: 'var(--radius-card)',
                    }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                      <div style={{ fontWeight: 600, color: 'var(--ink-600)', marginBottom: 4 }}>
                        ยังไม่มีเดือนปฏิบัติงาน
                      </div>
                      <div>กดปุ่มด้านล่างเพื่อเพิ่มเดือนปฏิบัติงาน</div>
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

                  {!planLocked && (
                    showAddMonth ? (
                      <AddMonthWizard
                        caseId={innerCaseId}
                        courseScheduleSlots={staffCase?.course_schedule_slots ?? []}
                        calDates={calDates}
                        usedMonthKeys={usedMonthKeys}
                        rateBaht={rateBaht}
                        labBoyCount={labBoyCount}
                        labBoyIds={staffCase?.lab_boys?.map(lb => lb.student_id) ?? []}
                        onDone={() => setShowAddMonth(false)}
                        onCancel={() => setShowAddMonth(false)}
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(staffCase?.course_schedule_slots ?? []).length > 0 && (
                          <button type="button"
                            onClick={() => batchAddMut.mutate()}
                            disabled={batchAddMut.isPending}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              width: '100%', padding: 12,
                              border: '1.5px solid var(--primary-100)',
                              borderRadius: 'var(--radius-card)', background: 'var(--primary-50)',
                              color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}>
                            {batchAddMut.isPending
                              ? 'กำลังเพิ่มเดือน...'
                              : `+ เพิ่มทุกเดือน${SEMESTER_LABEL[semester] ?? 'ในเทอม'} (${(SEMESTER_MONTHS[semester] ?? []).length} เดือน) อัตโนมัติ`}
                          </button>
                        )}
                        <button type="button" onClick={() => setShowAddMonth(true)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            width: '100%', padding: 12, border: '2px dashed var(--line)',
                            borderRadius: 'var(--radius-card)', background: 'transparent',
                            color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}>
                          + เพิ่มเดือนปฏิบัติงาน
                        </button>
                        {batchAddMut.isError && (
                          <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'var(--red-bg)', borderRadius: 'var(--radius-input)' }}>
                            {(batchAddMut.error as Error).message}
                          </div>
                        )}
                      </div>
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
                  onSaveRate={() => updateCaseMut.mutate({ rate_per_hour: Math.round(rateBaht * 100) })}
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
