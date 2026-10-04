import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  StaffCaseResponse, OccurrenceStatus, WorkOccurrence,
  CalendarDateType, ScheduleGroup, LabBoyInfo, GroupMonthPlan,
} from '../../../types'
import MonthlyPlanSection from './MonthlyPlanSection'
import PlanSummaryPanel from './PlanSummaryPanel'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_OPTIONS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี',
  FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatThaiMonthYear(year: number, month: number) {
  return `${MONTHS_TH[month - 1]} ${year + 543}`
}

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function isCountedStatus(status: OccurrenceStatus) {
  return status !== 'cancelled_holiday' && status !== 'cancelled_other' && status !== 'rescheduled'
}

interface MonthGroup {
  key: string
  year: number
  month: number
  label: string
  occurrences: WorkOccurrence[]
  countedSessions: number
}

function groupByMonth(occs: WorkOccurrence[]): MonthGroup[] {
  const map = new Map<string, WorkOccurrence[]>()
  for (const o of occs) {
    const d = new Date(o.scheduled_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(o)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      const [yr, mo] = key.split('-').map(Number)
      return {
        key,
        year: yr,
        month: mo,
        label: formatThaiMonthYear(yr, mo),
        occurrences: list,
        countedSessions: list.filter((o) => isCountedStatus(o.status)).length,
      }
    })
}

interface GroupSummary {
  labBoyCount: number
  durationMins: number
  hoursPerSession: number
  totalSessions: number
  monthBreakdown: { label: string; count: number }[]
  hoursPerPerson: number
  payPerPersonBaht: number
  totalHours: number
  totalPayBaht: number
  effectiveRateBaht: number
}

function computeSummary(
  group: ScheduleGroup,
  occs: WorkOccurrence[],
  caseRateSatang: number,
): GroupSummary {
  const durationMins = timeToMins(group.end_time) - timeToMins(group.start_time)
  const hoursPerSession = group.hours_per_session > 0
    ? group.hours_per_session
    : Math.max(0, durationMins / 60)

  const effectiveRateSatang = group.rate_per_hour_satang > 0 ? group.rate_per_hour_satang : caseRateSatang
  const effectiveRateBaht = effectiveRateSatang / 100

  const counted = occs.filter((o) => isCountedStatus(o.status))
  const totalSessions = counted.length

  const totalValidMins = totalSessions * durationMins
  const payPerPersonBaht = (totalValidMins * effectiveRateSatang) / 100 / 60

  const labBoyCount = group.assigned_students?.length ?? 0
  const totalPayBaht = payPerPersonBaht * labBoyCount

  const monthGroups = groupByMonth(counted)
  const monthBreakdown = monthGroups.map((mg) => ({ label: mg.label, count: mg.countedSessions }))

  return {
    labBoyCount,
    durationMins,
    hoursPerSession,
    totalSessions,
    monthBreakdown,
    hoursPerPerson: hoursPerSession * totalSessions,
    payPerPersonBaht,
    totalHours: hoursPerSession * totalSessions * labBoyCount,
    totalPayBaht,
    effectiveRateBaht,
  }
}

function nextGroupName(existing: ScheduleGroup[]) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return `กลุ่ม ${letters[existing.length] ?? (existing.length + 1)}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { staffCase: StaffCaseResponse }

type GroupFormState = {
  group_name: string
  week_day: string
  start_time: string
  end_time: string
  hours_per_session: string
  rate_per_hour_baht: string
  work_start_date: string
  work_end_date: string
  note: string
}

const defaultGroupForm = (name = ''): GroupFormState => ({
  group_name: name,
  week_day: 'WED',
  start_time: '09:00',
  end_time: '12:00',
  hours_per_session: '',
  rate_per_hour_baht: '',
  work_start_date: '',
  work_end_date: '',
  note: '',
})

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkPlanTab({ staffCase }: Props) {
  const qc = useQueryClient()
  const caseId = staffCase.id
  const planLocked = staffCase.status === 'plan_locked' || staffCase.status === 'done'

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [showAddGroupForm, setShowAddGroupForm] = useState(false)
  const [addForm, setAddForm] = useState<GroupFormState>(() => defaultGroupForm())
  const [editForm, setEditForm] = useState<GroupFormState | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showStudents, setShowStudents] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [showGenForm, setShowGenForm] = useState(false)
  const [genDates, setGenDates] = useState({ start_date: '', end_date: '' })
  const [showHolidayForm, setShowHolidayForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    hours_per_session: String(staffCase.hours_per_session || ''),
    rate_per_hour_baht: String(staffCase.rate_per_hour_satang ? staffCase.rate_per_hour_satang / 100 : ''),
    work_start_date: staffCase.work_start_date ? staffCase.work_start_date.slice(0, 10) : '',
    work_end_date: staffCase.work_end_date ? staffCase.work_end_date.slice(0, 10) : '',
  })
  const [holidayForm, setHolidayForm] = useState({
    date: '', name: '', date_type: 'public_holiday' as CalendarDateType,
    scope: 'global' as 'global' | 'semester' | 'case', affects_work: true,
  })

  const { data: scheduleGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['staff-schedule-groups', caseId],
    queryFn: () => staffApi.getCaseScheduleGroups(caseId),
  })
  const selectedGroup = scheduleGroups.find((g) => g.id === selectedGroupId) ?? null

  const { data: groupOccs = [] } = useQuery({
    queryKey: ['staff-group-occurrences', selectedGroupId],
    queryFn: () => staffApi.listGroupOccurrences(caseId, selectedGroupId!),
    enabled: !!selectedGroupId,
  })

  const { data: calDates = [] } = useQuery({
    queryKey: ['staff-calendar-dates', caseId],
    queryFn: () => staffApi.listCalendarDates(caseId),
  })

  const { data: monthlyPlanData = [], isLoading: monthlyPlanLoading } = useQuery<GroupMonthPlan[]>({
    queryKey: ['monthly-plan', caseId],
    queryFn: () => staffApi.getMonthlyPlan(caseId),
  })

  const summary = useMemo(
    () => selectedGroup ? computeSummary(selectedGroup, groupOccs, staffCase.rate_per_hour_satang) : null,
    [selectedGroup, groupOccs, staffCase.rate_per_hour_satang],
  )

  const monthlyPlanEntries = useMemo(
    () => monthlyPlanData.find((p) => p.group.id === selectedGroupId)?.months ?? [],
    [monthlyPlanData, selectedGroupId],
  )

  const validationErrors = useMemo((): string[] => {
    if (!selectedGroup) return []
    if (selectedGroup.locked_at) return []
    const errs: string[] = []
    if (!staffCase.instructor_confirmed) errs.push('อาจารย์ยังไม่ได้ยืนยันรายชื่อ Lab Boy')
    if (!selectedGroup.assigned_students?.length) errs.push('ยังไม่มี Lab Boy ในกลุ่มนี้')
    if (!selectedGroup.week_day) errs.push('ยังไม่ได้กำหนดวันประจำสัปดาห์')
    if (selectedGroup.start_time >= selectedGroup.end_time) errs.push('เวลาเริ่มต้องก่อนเวลาสิ้นสุด')
    const rateSatang = selectedGroup.rate_per_hour_satang || staffCase.rate_per_hour_satang
    if (rateSatang === 0) errs.push('ยังไม่กำหนดอัตราค่าตอบแทน')
    const countedOccs = groupOccs.filter((o) => isCountedStatus(o.status))
    if (countedOccs.length === 0) errs.push('ไม่มีวันทำงานที่นับได้ กรุณาสร้างรายการวันทำงานก่อน')
    return errs
  }, [selectedGroup, groupOccs, staffCase])

  const addGroupMut = useMutation({
    mutationFn: () => {
      const hours = parseFloat(addForm.hours_per_session)
      const rateBaht = parseFloat(addForm.rate_per_hour_baht)
      return staffApi.addScheduleGroup(caseId, {
        group_name: addForm.group_name || undefined,
        week_day: addForm.week_day,
        start_time: addForm.start_time,
        end_time: addForm.end_time,
        hours_per_session: isNaN(hours) ? undefined : hours,
        rate_per_hour_satang: isNaN(rateBaht) || rateBaht === 0 ? undefined : Math.round(rateBaht * 100),
        work_start_date: addForm.work_start_date || undefined,
        work_end_date: addForm.work_end_date || undefined,
        note: addForm.note || undefined,
      })
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['staff-schedule-groups', caseId] })
      setShowAddGroupForm(false)
      setAddForm(defaultGroupForm())
      setSelectedGroupId(created.id)
    },
  })

  const updateGroupMut = useMutation({
    mutationFn: () => {
      if (!selectedGroup || !editForm) throw new Error('no group')
      const hours = parseFloat(editForm.hours_per_session)
      const rateBaht = parseFloat(editForm.rate_per_hour_baht)
      return staffApi.updateScheduleGroup(caseId, selectedGroup.id, {
        group_name: editForm.group_name || undefined,
        week_day: editForm.week_day,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        hours_per_session: isNaN(hours) ? undefined : hours,
        rate_per_hour_satang: isNaN(rateBaht) || rateBaht === 0 ? undefined : Math.round(rateBaht * 100),
        work_start_date: editForm.work_start_date || '',
        work_end_date: editForm.work_end_date || '',
        note: editForm.note || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-schedule-groups', caseId] })
      setIsEditing(false)
      setEditForm(null)
    },
  })

  const deleteGroupMut = useMutation({
    mutationFn: (groupId: number) => staffApi.deleteScheduleGroup(caseId, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-schedule-groups', caseId] })
      setSelectedGroupId(null)
    },
  })

  const lockGroupMut = useMutation({
    mutationFn: () => staffApi.lockScheduleGroup(caseId, selectedGroupId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-schedule-groups', caseId] }),
  })

  const lockPlanMut = useMutation({
    mutationFn: () => staffApi.lockPlan(caseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-cases'] }),
  })

  const assignMut = useMutation({
    mutationFn: () => staffApi.assignGroupStudents(caseId, selectedGroupId!, selectedStudentIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-schedule-groups', caseId] })
      setShowStudents(false)
    },
  })

  const genOccsMut = useMutation({
    mutationFn: () => staffApi.generateGroupOccurrences(caseId, selectedGroupId!, genDates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-group-occurrences', selectedGroupId] })
      qc.invalidateQueries({ queryKey: ['monthly-plan', caseId] })
      setShowGenForm(false)
    },
  })

  const addHolidayMut = useMutation({
    mutationFn: () => staffApi.createCalendarDate({
      ...holidayForm,
      staff_case_id: holidayForm.scope === 'case' ? caseId : undefined,
      semester: staffCase.semester,
      academic_year: staffCase.academic_year,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-calendar-dates', caseId] })
      setShowHolidayForm(false)
      setHolidayForm({ date: '', name: '', date_type: 'public_holiday', scope: 'global', affects_work: true })
    },
  })

  const deleteHolidayMut = useMutation({
    mutationFn: (id: number) => staffApi.deleteCalendarDate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-calendar-dates', caseId] }),
  })

  const saveSettingsMut = useMutation({
    mutationFn: () => {
      const hours = parseFloat(settingsForm.hours_per_session)
      const rateBaht = parseFloat(settingsForm.rate_per_hour_baht)
      return staffApi.updateCase(caseId, {
        hours_per_session: isNaN(hours) ? undefined : hours,
        rate_per_hour: isNaN(rateBaht) ? undefined : Math.round(rateBaht * 100),
        work_start_date: settingsForm.work_start_date || undefined,
        work_end_date: settingsForm.work_end_date || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-cases'] })
      setShowSettings(false)
    },
  })

  function startEditing(group: ScheduleGroup) {
    setEditForm({
      group_name: group.group_name || '',
      week_day: group.week_day,
      start_time: group.start_time,
      end_time: group.end_time,
      hours_per_session: group.hours_per_session > 0 ? String(group.hours_per_session) : '',
      rate_per_hour_baht: group.rate_per_hour_satang > 0 ? String(group.rate_per_hour_satang / 100) : '',
      work_start_date: group.work_start_date ? group.work_start_date.slice(0, 10) : '',
      work_end_date: group.work_end_date ? group.work_end_date.slice(0, 10) : '',
      note: group.note || '',
    })
    setIsEditing(true)
  }

  function selectGroup(g: ScheduleGroup) {
    if (selectedGroupId === g.id) return
    setSelectedGroupId(g.id)
    setIsEditing(false)
    setEditForm(null)
    setShowStudents(false)
    setShowGenForm(false)
    setGenDates({
      start_date: g.work_start_date ? g.work_start_date.slice(0, 10) : '',
      end_date: g.work_end_date ? g.work_end_date.slice(0, 10) : '',
    })
    setSelectedStudentIds(g.assigned_students?.map((s) => s.student_id) ?? [])
  }

  const rateDisplay = staffCase.rate_per_hour_satang
    ? `${(staffCase.rate_per_hour_satang / 100).toFixed(2)} บาท/ชม.`
    : 'ยังไม่กำหนด'

  // ─── Render ───────────────────────────────────────────────────────────────

  const steps = [
    { n: 1, label: 'ตั้งค่าอัตราค่าตอบแทน', done: staffCase.rate_per_hour_satang > 0 },
    { n: 2, label: 'สร้างกลุ่มตาราง', done: scheduleGroups.length > 0 },
    { n: 3, label: 'กำหนด Lab Boy', done: scheduleGroups.some(g => (g.assigned_students?.length ?? 0) > 0) },
    { n: 4, label: 'กรอกวันปฏิบัติงาน', done: monthlyPlanData.some(p => p.months.some(m => m.occurrences.length > 0)) },
    { n: 5, label: 'ล็อกแผน', done: planLocked },
  ]

  return (
    <div className="space-y-5">

      {/* ━━━ Step Progress Indicator ━━━ */}
      {!planLocked ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--primary-50)', border: '1.5px solid var(--primary-100)' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
            ขั้นตอนการตั้งค่าแผนปฏิบัติงาน
          </p>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((step, idx, arr) => (
              <div key={step.n} className="flex items-center gap-1.5">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  step.done
                    ? 'bg-green-100 text-green-800'
                    : 'bg-white text-gray-600'
                }`} style={{ border: step.done ? '1px solid #86EFAC' : '1px solid var(--line)' }}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    step.done ? 'bg-green-500 text-white' : ''
                  }`} style={!step.done ? { background: 'var(--line)', color: 'var(--ink-600)' } : {}}>
                    {step.done ? '✓' : step.n}
                  </span>
                  {step.label}
                </div>
                {idx < arr.length - 1 && (
                  <span style={{ color: 'var(--line)', fontSize: 16, lineHeight: 1 }}>›</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--green-bg)', border: '1.5px solid #86EFAC' }}>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center text-base font-bold flex-shrink-0">✓</span>
            <div>
              <p className="font-bold text-sm text-green-800">แผนการทำงานถูกล็อกแล้ว</p>
              <p className="text-xs text-green-700">ทุกกลุ่มถูกยืนยัน — พร้อมสร้างเอกสาร</p>
            </div>
          </div>
          <button onClick={() => setShowPreviewModal(true)} className="btn btn-sm btn-outline"
            style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
            ดูตัวอย่างเอกสาร
          </button>
        </div>
      )}

      {/* ━━━ Settings Bar ━━━ */}
      <div className="rounded-xl flex items-center justify-between flex-wrap gap-3 px-4 py-3"
        style={{ background: 'var(--line-soft)', border: '1.5px solid var(--line)' }}>
        <div className="flex gap-5 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--ink-500)' }}>อัตราค่าตอบแทน</span>
            <span className="font-bold text-sm" style={{ color: staffCase.rate_per_hour_satang > 0 ? 'var(--primary)' : 'var(--amber)' }}>
              {rateDisplay}
            </span>
            {staffCase.rate_per_hour_satang === 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #FCD34D' }}>
                ⚠ ยังไม่ได้ตั้งค่า
              </span>
            )}
          </div>
          {staffCase.hours_per_session > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--ink-500)' }}>ชั่วโมง/ครั้ง</span>
              <span className="font-bold text-sm" style={{ color: 'var(--ink-700)' }}>{staffCase.hours_per_session} ชม.</span>
            </div>
          )}
        </div>
        {!planLocked && (
          <button onClick={() => setShowSettings(!showSettings)} className="btn btn-ghost btn-xs">
            ⚙ ตั้งค่า {showSettings ? '▲' : '▼'}
          </button>
        )}
      </div>

      {showSettings && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: '#fff', border: '1.5px solid var(--line)' }}>
          <h4 className="font-bold text-sm" style={{ color: 'var(--ink-900)' }}>ตั้งค่า Staff Case (ค่าเริ่มต้น)</h4>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>ชั่วโมง/ครั้ง</label>
              <input type="number" step="0.5" min="0" value={settingsForm.hours_per_session}
                onChange={(e) => setSettingsForm({ ...settingsForm, hours_per_session: e.target.value })}
                className="form-input w-full" placeholder="2.0" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>อัตรา (บาท/ชม.)</label>
              <input type="number" step="0.01" min="0" value={settingsForm.rate_per_hour_baht}
                onChange={(e) => setSettingsForm({ ...settingsForm, rate_per_hour_baht: e.target.value })}
                className="form-input w-full" placeholder="50.00" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>วันที่เริ่ม</label>
              <input type="date" value={settingsForm.work_start_date}
                onChange={(e) => setSettingsForm({ ...settingsForm, work_start_date: e.target.value })}
                className="form-input w-full" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>วันที่สิ้นสุด</label>
              <input type="date" value={settingsForm.work_end_date}
                onChange={(e) => setSettingsForm({ ...settingsForm, work_end_date: e.target.value })}
                className="form-input w-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending} className="btn btn-primary btn-sm">
              {saveSettingsMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => setShowSettings(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
          </div>
          {saveSettingsMut.isError && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{String((saveSettingsMut.error as Error).message)}</p>
          )}
        </div>
      )}

      {/* ━━━ Main Two-Column Layout ━━━ */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── Left Column ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ─ Section: กลุ่มตารางทำงาน ─ */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--line)' }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ background: 'var(--line-soft)', borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: 'var(--primary)' }}>2</span>
                <span className="font-bold text-sm" style={{ color: 'var(--ink-900)' }}>กลุ่มตารางทำงาน</span>
                {scheduleGroups.length > 0 && (
                  <span className="badge badge-primary">{scheduleGroups.length} กลุ่ม</span>
                )}
              </div>
              {!planLocked && (
                <button
                  onClick={() => { setAddForm(defaultGroupForm(nextGroupName(scheduleGroups))); setShowAddGroupForm(true) }}
                  className="btn btn-primary btn-xs">
                  + เพิ่มกลุ่ม
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {showAddGroupForm && (
                <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--primary-50)', border: '1.5px solid var(--primary-100)' }}>
                  <h4 className="font-bold text-sm" style={{ color: 'var(--primary)' }}>สร้างกลุ่มตารางใหม่</h4>
                  <GroupFormFields form={addForm} onChange={setAddForm} caseRateSatang={staffCase.rate_per_hour_satang} />
                  <div className="flex gap-2">
                    <button onClick={() => addGroupMut.mutate()} disabled={addGroupMut.isPending || !addForm.week_day}
                      className="btn btn-primary btn-sm">
                      {addGroupMut.isPending ? 'กำลังสร้าง...' : 'สร้างกลุ่ม'}
                    </button>
                    <button onClick={() => setShowAddGroupForm(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
                  </div>
                  {addGroupMut.isError && (
                    <p className="text-xs" style={{ color: 'var(--red)' }}>{String((addGroupMut.error as Error).message)}</p>
                  )}
                </div>
              )}

              {groupsLoading ? (
                <div className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--line-soft)' }} />
              ) : scheduleGroups.length === 0 ? (
                <div className="py-10 text-center rounded-xl" style={{ border: '2px dashed var(--line)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink-700)' }}>ยังไม่มีกลุ่มตาราง</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-400)' }}>กดปุ่ม "+ เพิ่มกลุ่ม" ด้านบนเพื่อเริ่ม</p>
                </div>
              ) : (
                <div className="flex gap-2.5 flex-wrap">
                  {scheduleGroups.map((sg) => (
                    <button key={sg.id} onClick={() => selectGroup(sg)}
                      className="text-left rounded-xl transition-all"
                      style={{
                        padding: '10px 14px', minWidth: 140,
                        border: selectedGroupId === sg.id ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                        background: selectedGroupId === sg.id ? 'var(--primary-50)' : '#fff',
                        boxShadow: selectedGroupId === sg.id ? '0 2px 10px rgba(56,65,157,0.14)' : 'none',
                      }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-bold text-sm" style={{ color: selectedGroupId === sg.id ? 'var(--primary)' : 'var(--ink-900)' }}>
                          {sg.group_name || `กลุ่ม ${sg.id}`}
                        </span>
                        {sg.locked_at
                          ? <span className="badge badge-green">ล็อก</span>
                          : <span className="badge badge-amber">draft</span>}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ink-500)' }}>
                        {DAY_LABELS[sg.week_day]} {sg.start_time}–{sg.end_time}
                      </div>
                      <div className="text-xs mt-0.5 font-medium" style={{ color: 'var(--primary)' }}>
                        Lab Boy {sg.assigned_students?.length ?? 0} คน
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─ Selected Group Detail ─ */}
          {selectedGroup ? (
            <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--line)' }}>

              {/* Group Header */}
              <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2"
                style={{ background: 'var(--primary)', borderBottom: '1px solid var(--primary-700)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-white">{selectedGroup.group_name || `กลุ่ม ${selectedGroup.id}`}</span>
                  <span className="text-white/70 text-xs">{DAY_LABELS[selectedGroup.week_day]} {selectedGroup.start_time}–{selectedGroup.end_time}</span>
                  {selectedGroup.locked_at && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(22,163,74,0.3)', color: '#86EFAC' }}>✓ ล็อกแล้ว</span>
                  )}
                </div>
                {!planLocked && !selectedGroup.locked_at && (
                  <div className="flex gap-2">
                    {!isEditing && (
                      <button onClick={() => startEditing(selectedGroup)} className="btn btn-white-outline btn-xs">แก้ไข</button>
                    )}
                    <button onClick={() => deleteGroupMut.mutate(selectedGroup.id)} disabled={deleteGroupMut.isPending}
                      className="btn btn-xs" style={{ color: '#FCA5A5', borderColor: 'rgba(252,165,165,0.35)', background: 'transparent' }}>
                      ลบกลุ่ม
                    </button>
                  </div>
                )}
              </div>

              <div style={{ borderTop: 'none' }}>

                {/* Sub-section: ข้อมูลตาราง */}
                <div className="p-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">📅</span>
                    <span className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-500)' }}>ข้อมูลตารางทำงาน</span>
                  </div>
                  {isEditing && editForm ? (
                    <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--primary-50)', border: '1.5px solid var(--primary-100)' }}>
                      <GroupFormFields form={editForm} onChange={setEditForm} caseRateSatang={staffCase.rate_per_hour_satang} />
                      <div className="flex gap-2">
                        <button onClick={() => updateGroupMut.mutate()} disabled={updateGroupMut.isPending} className="btn btn-primary btn-sm">
                          {updateGroupMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                        <button onClick={() => { setIsEditing(false); setEditForm(null) }} className="btn btn-ghost btn-sm">ยกเลิก</button>
                      </div>
                      {updateGroupMut.isError && (
                        <p className="text-xs" style={{ color: 'var(--red)' }}>{String((updateGroupMut.error as Error).message)}</p>
                      )}
                    </div>
                  ) : (
                    <GroupInfoDisplay group={selectedGroup} caseRateSatang={staffCase.rate_per_hour_satang} />
                  )}
                </div>

                {/* Sub-section: Lab Boy */}
                {!planLocked && (
                  <div className="p-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">👥</span>
                        <span className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-500)' }}>Lab Boy ในกลุ่มนี้</span>
                        {(selectedGroup.assigned_students?.length ?? 0) > 0
                          ? <span className="badge badge-primary">{selectedGroup.assigned_students?.length} คน</span>
                          : <span className="badge badge-amber">ยังไม่กำหนด</span>}
                      </div>
                      {!selectedGroup.locked_at && (
                        <button
                          onClick={() => {
                            setSelectedStudentIds(selectedGroup.assigned_students?.map(s => s.student_id) ?? [])
                            setShowStudents(!showStudents)
                          }}
                          className="btn btn-outline btn-xs">
                          {showStudents ? 'ซ่อน' : 'กำหนด Lab Boy'}
                        </button>
                      )}
                    </div>
                    {selectedGroup.assigned_students?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedGroup.assigned_students.map((s) => (
                          <span key={s.student_id} className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }}>
                            {s.student_name}
                          </span>
                        ))}
                      </div>
                    )}
                    {showStudents && !selectedGroup.locked_at && (
                      <LabBoySelector
                        allLabBoys={staffCase.lab_boys ?? []}
                        selected={selectedStudentIds}
                        onChange={setSelectedStudentIds}
                        onSave={() => assignMut.mutate()}
                        onCancel={() => setShowStudents(false)}
                        isSaving={assignMut.isPending}
                        error={assignMut.isError ? String((assignMut.error as Error).message) : undefined}
                        existingGroups={scheduleGroups}
                        currentGroupId={selectedGroup.id}
                      />
                    )}
                  </div>
                )}

                {/* Sub-section: สร้างวันทำงานอัตโนมัติ */}
                {!planLocked && !selectedGroup.locked_at && (
                  <div className="p-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <span className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-500)' }}>
                          สร้างรายการวันทำงานอัตโนมัติ
                        </span>
                      </div>
                      <button onClick={() => setShowGenForm(!showGenForm)} className="btn btn-ghost btn-xs">
                        {showGenForm ? 'ซ่อน ▲' : 'แสดง ▼'}
                      </button>
                    </div>
                    {showGenForm && (
                      <div className="mt-2 p-3 rounded-xl" style={{ background: 'var(--green-bg)', border: '1px solid #86EFAC' }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#166534' }}>
                          สร้างวันทำงานทุกวัน{DAY_LABELS[selectedGroup.week_day]} เวลา {selectedGroup.start_time}–{selectedGroup.end_time} ในช่วงที่กำหนด
                        </p>
                        <div className="flex gap-3 flex-wrap items-end">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--ink-600)' }}>วันที่เริ่ม</label>
                            <input type="date" value={genDates.start_date}
                              onChange={(e) => setGenDates({ ...genDates, start_date: e.target.value })}
                              className="form-input" />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--ink-600)' }}>วันที่สิ้นสุด</label>
                            <input type="date" value={genDates.end_date}
                              onChange={(e) => setGenDates({ ...genDates, end_date: e.target.value })}
                              className="form-input" />
                          </div>
                          <button onClick={() => genOccsMut.mutate()}
                            disabled={genOccsMut.isPending || !genDates.start_date || !genDates.end_date}
                            className="btn btn-green btn-sm">
                            {genOccsMut.isPending ? 'กำลังสร้าง...' : '⚡ สร้างวันปฏิบัติงาน'}
                          </button>
                        </div>
                        {genOccsMut.isError && (
                          <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{String((genOccsMut.error as Error).message)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-section: แผนปฏิบัติงานรายเดือน ← หัวใจหลัก */}
                <div className="p-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'var(--primary)' }}>4</span>
                    <div>
                      <span className="font-bold text-sm" style={{ color: 'var(--ink-900)' }}>แผนปฏิบัติงานรายเดือน</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-400)' }}>กรอกวันที่ Lab Boy ต้องมาปฏิบัติงานในแต่ละเดือน</span>
                    </div>
                  </div>
                  <MonthlyPlanSection
                    caseId={caseId}
                    group={selectedGroup}
                    planLocked={planLocked}
                    entries={monthlyPlanEntries}
                    isLoading={monthlyPlanLoading}
                    calDates={calDates}
                  />
                </div>

                {/* Sub-section: Lock Group */}
                {!planLocked && !selectedGroup.locked_at && (
                  <div className="p-4" style={{ background: 'var(--line-soft)' }}>
                    {validationErrors.length > 0 && (
                      <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--amber-bg)', border: '1px solid #FCD34D' }}>
                        <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--amber)' }}>⚠ ยังดำเนินการไม่ครบ</p>
                        <ul className="space-y-0.5">
                          {validationErrors.map((err, i) => (
                            <li key={i} className="text-xs" style={{ color: '#92400E' }}>• {err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => lockGroupMut.mutate()}
                      disabled={lockGroupMut.isPending || validationErrors.length > 0}
                      title={validationErrors.length > 0 ? validationErrors.join('\n') : undefined}
                      className="btn btn-green"
                      style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
                      {lockGroupMut.isPending ? 'กำลังล็อก...' : '✓ ตรวจสอบและล็อกแผนกลุ่มนี้'}
                    </button>
                    {lockGroupMut.isError && (
                      <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{String((lockGroupMut.error as Error).message)}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : scheduleGroups.length > 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: '2px dashed var(--line)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink-700)' }}>เลือกกลุ่มตารางด้านบน</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-400)' }}>เพื่อจัดการวันปฏิบัติงาน</p>
            </div>
          ) : null}

        </div>

        {/* ── Right Column: Summary ── */}
        <div className="lg:w-72 shrink-0">
          <WorkPlanSummary
            group={selectedGroup}
            summary={summary}
            planLocked={planLocked}
            caseRateSatang={staffCase.rate_per_hour_satang}
          />
        </div>
      </div>

      {/* ━━━ Holidays Section ━━━ */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid #FCD34D' }}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--amber-bg)', borderBottom: '1px solid #FCD34D' }}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm" style={{ color: '#92400E' }}>📅 วันหยุด / วันงด</span>
            {calDates.length > 0 && <span className="badge badge-amber">{calDates.length} รายการ</span>}
          </div>
          {!planLocked && (
            <button onClick={() => setShowHolidayForm(!showHolidayForm)} className="btn btn-amber btn-xs">
              + เพิ่มวันหยุด
            </button>
          )}
        </div>
        <div className="p-4 space-y-2">
          {calDates.length === 0 && !showHolidayForm && (
            <p className="text-xs text-center py-3" style={{ color: 'var(--ink-400)' }}>ยังไม่มีวันหยุด/วันงดที่บันทึกไว้</p>
          )}
          {calDates.map((cd) => (
            <div key={cd.id} className="flex items-center justify-between rounded-xl px-3 py-2"
              style={{ background: 'var(--amber-bg)', border: '1px solid #FCD34D' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs font-bold" style={{ color: '#92400E' }}>{cd.date.slice(0, 10)}</span>
                <span className="text-sm" style={{ color: 'var(--ink-700)' }}>{cd.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.5)', color: 'var(--ink-500)' }}>{cd.scope}</span>
              </div>
              {!planLocked && (
                <button onClick={() => deleteHolidayMut.mutate(cd.id)} className="btn btn-xs btn-danger">ลบ</button>
              )}
            </div>
          ))}
          {showHolidayForm && !planLocked && (
            <div className="rounded-xl p-3 space-y-2 mt-2" style={{ background: '#fff', border: '1.5px solid #FCD34D' }}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: 'var(--ink-600)' }}>วันที่</label>
                  <input type="date" value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    className="form-input w-full" />
                </div>
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: 'var(--ink-600)' }}>ชื่อ/เหตุผล</label>
                  <input type="text" value={holidayForm.name} placeholder="เช่น วันชาติ"
                    onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                    className="form-input w-full" />
                </div>
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: 'var(--ink-600)' }}>ประเภท</label>
                  <select value={holidayForm.date_type}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date_type: e.target.value as CalendarDateType })}
                    className="form-input w-full">
                    <option value="public_holiday">วันหยุดราชการ</option>
                    <option value="university_holiday">วันหยุดมหาวิทยาลัย</option>
                    <option value="no_class">งดการเรียนการสอน</option>
                    <option value="case_exception">ข้อยกเว้นเฉพาะ case</option>
                    <option value="makeup">วันชดเชย</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-0.5" style={{ color: 'var(--ink-600)' }}>ขอบเขต</label>
                  <select value={holidayForm.scope}
                    onChange={(e) => setHolidayForm({ ...holidayForm, scope: e.target.value as 'global' | 'semester' | 'case' })}
                    className="form-input w-full">
                    <option value="global">ทุกรายวิชา</option>
                    <option value="semester">ภาคการศึกษานี้</option>
                    <option value="case">เฉพาะ case นี้</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-700)' }}>
                <input type="checkbox" checked={holidayForm.affects_work}
                  onChange={(e) => setHolidayForm({ ...holidayForm, affects_work: e.target.checked })} />
                ยกเลิกวันทำงานในวันนี้
              </label>
              <div className="flex gap-2">
                <button onClick={() => addHolidayMut.mutate()}
                  disabled={addHolidayMut.isPending || !holidayForm.date || !holidayForm.name}
                  className="btn btn-amber btn-sm">
                  {addHolidayMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button onClick={() => setShowHolidayForm(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ Cross-Group Plan Summary ━━━ */}
      {monthlyPlanData.length > 0 && <PlanSummaryPanel data={monthlyPlanData} />}

      {/* ━━━ Case-Level Lock ━━━ */}
      {!planLocked && scheduleGroups.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: '#fff', border: '1.5px solid var(--line)' }}>
          {scheduleGroups.some((g) => !g.locked_at) ? (
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'var(--line-soft)', color: 'var(--ink-400)' }}>5</span>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--ink-700)' }}>ล็อกแผนงานทั้งหมด</p>
                <p className="text-xs" style={{ color: 'var(--ink-400)' }}>
                  ต้องล็อกทุกกลุ่มก่อน ({scheduleGroups.filter(g => g.locked_at).length}/{scheduleGroups.length} กลุ่มถูกล็อกแล้ว)
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">5</span>
                <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>✓ ทุกกลุ่มถูกล็อกแล้ว — พร้อมล็อกแผนงาน</p>
              </div>
              <button onClick={() => lockPlanMut.mutate()} disabled={lockPlanMut.isPending}
                className="btn btn-green"
                style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
                {lockPlanMut.isPending ? 'กำลังล็อก...' : '🔒 ล็อกแผนงานทั้งหมด'}
              </button>
              {lockPlanMut.isError && (
                <p className="text-xs" style={{ color: 'var(--red)' }}>{String((lockPlanMut.error as Error).message)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {showPreviewModal && (
        <HiringPreviewModal
          staffCase={staffCase}
          scheduleGroups={scheduleGroups}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GroupFormFields({
  form, onChange, caseRateSatang,
}: {
  form: GroupFormState
  onChange: (f: GroupFormState) => void
  caseRateSatang: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>ชื่อกลุ่ม</label>
        <input type="text" value={form.group_name} placeholder="เช่น กลุ่ม A"
          onChange={(e) => onChange({ ...form, group_name: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>วันประจำสัปดาห์</label>
        <select value={form.week_day} onChange={(e) => onChange({ ...form, week_day: e.target.value })}
          className="form-input w-full">
          {DAY_OPTIONS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>เวลาเริ่ม</label>
        <input type="time" value={form.start_time}
          onChange={(e) => onChange({ ...form, start_time: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>เวลาสิ้นสุด</label>
        <input type="time" value={form.end_time}
          onChange={(e) => onChange({ ...form, end_time: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>วันที่เริ่ม</label>
        <input type="date" value={form.work_start_date}
          onChange={(e) => onChange({ ...form, work_start_date: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>วันที่สิ้นสุด</label>
        <input type="date" value={form.work_end_date}
          onChange={(e) => onChange({ ...form, work_end_date: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>
          อัตรา (บาท/ชม.)
          {caseRateSatang > 0 && (
            <span className="ml-1" style={{ color: 'var(--ink-400)' }}>ค่าเริ่มต้น {(caseRateSatang / 100).toFixed(2)}</span>
          )}
        </label>
        <input type="number" step="0.01" min="0" value={form.rate_per_hour_baht}
          placeholder={caseRateSatang > 0 ? String(caseRateSatang / 100) : '50.00'}
          onChange={(e) => onChange({ ...form, rate_per_hour_baht: e.target.value })}
          className="form-input w-full" />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>ชม./ครั้ง (ถ้าต่างจากช่วงเวลา)</label>
        <input type="number" step="0.5" min="0" value={form.hours_per_session}
          onChange={(e) => onChange({ ...form, hours_per_session: e.target.value })}
          className="form-input w-full" placeholder="ว่าง = คำนวณจากเวลา" />
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs mb-1" style={{ color: 'var(--ink-500)' }}>หมายเหตุ</label>
        <input type="text" value={form.note}
          onChange={(e) => onChange({ ...form, note: e.target.value })}
          className="form-input w-full" />
      </div>
    </div>
  )
}

function GroupInfoDisplay({ group, caseRateSatang }: { group: ScheduleGroup; caseRateSatang: number }) {
  const effectiveRate = group.rate_per_hour_satang > 0 ? group.rate_per_hour_satang : caseRateSatang
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
      <div>
        <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>วัน</span>
        <span className="font-semibold" style={{ color: 'var(--ink-900)' }}>{DAY_LABELS[group.week_day]}</span>
      </div>
      <div>
        <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>เวลา</span>
        <span className="font-semibold" style={{ color: 'var(--ink-900)' }}>{group.start_time}–{group.end_time}</span>
      </div>
      <div>
        <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>อัตราค่าตอบแทน</span>
        <span className="font-bold" style={{ color: 'var(--primary)' }}>{(effectiveRate / 100).toFixed(2)} บาท/ชม.</span>
        {group.rate_per_hour_satang > 0 && (
          <span className="text-xs ml-1" style={{ color: 'var(--primary)' }}>(เฉพาะกลุ่ม)</span>
        )}
      </div>
      {group.hours_per_session > 0 && (
        <div>
          <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>ชม./ครั้ง</span>
          <span className="font-semibold" style={{ color: 'var(--ink-900)' }}>{group.hours_per_session}</span>
        </div>
      )}
      {group.work_start_date && (
        <div className="col-span-2">
          <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>ช่วงเวลา</span>
          <span className="font-semibold" style={{ color: 'var(--ink-900)' }}>
            {group.work_start_date.slice(0, 10)} ถึง {group.work_end_date?.slice(0, 10) ?? '?'}
          </span>
        </div>
      )}
      {group.note && (
        <div className="col-span-2">
          <span className="block text-xs mb-0.5" style={{ color: 'var(--ink-400)' }}>หมายเหตุ</span>
          <span style={{ color: 'var(--ink-700)' }}>{group.note}</span>
        </div>
      )}
    </div>
  )
}

function LabBoySelector({
  allLabBoys, selected, onChange, onSave, onCancel, isSaving, error, existingGroups, currentGroupId,
}: {
  allLabBoys: LabBoyInfo[]
  selected: number[]
  onChange: (ids: number[]) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  error?: string
  existingGroups: ScheduleGroup[]
  currentGroupId: number
}) {
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }
  function groupOfStudent(studentId: number): string | null {
    for (const g of existingGroups) {
      if (g.id === currentGroupId) continue
      if (g.assigned_students?.some((s) => s.student_id === studentId)) {
        return g.group_name || `กลุ่ม ${g.id}`
      }
    }
    return null
  }
  return (
    <div className="rounded-xl p-3 space-y-2 mt-2"
      style={{ background: '#EEF2FF', border: '1.5px solid #C7D2FE' }}>
      {allLabBoys.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-500)' }}>ยังไม่มี Lab Boy ที่ได้รับเลือก</p>
      ) : (
        <div className="space-y-1.5">
          {allLabBoys.map((lb) => {
            const otherGroup = groupOfStudent(lb.student_id)
            return (
              <label key={lb.student_id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={selected.includes(lb.student_id)}
                  onChange={() => toggle(lb.student_id)} />
                <span className="font-medium" style={{ color: 'var(--ink-800)' }}>{lb.student_name}</span>
                <span className="font-mono" style={{ color: 'var(--ink-400)' }}>{lb.student_code}</span>
                {otherGroup && (
                  <span className="text-xs" style={{ color: 'var(--amber)' }}>(อยู่ใน{otherGroup})</span>
                )}
              </label>
            )
          })}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={isSaving} className="btn btn-primary btn-xs">
          {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button onClick={onCancel} className="btn btn-ghost btn-xs">ยกเลิก</button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

function WorkPlanSummary({
  group, summary, planLocked, caseRateSatang,
}: {
  group: ScheduleGroup | null
  summary: ReturnType<typeof computeSummary> | null
  planLocked: boolean
  caseRateSatang: number
}) {
  if (!group) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ border: '2px dashed var(--line)', background: 'var(--line-soft)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-600)' }}>สรุปค่าตอบแทน</p>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-400)' }}>เลือกกลุ่มตารางเพื่อดูสรุป</p>
      </div>
    )
  }

  const effectiveRate = group.rate_per_hour_satang > 0 ? group.rate_per_hour_satang : caseRateSatang
  const durationMins = summary ? summary.durationMins : 0
  const durationHrs = durationMins / 60

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--line)', position: 'sticky', top: 16 }}>
      <div className="px-4 py-3" style={{ background: 'var(--primary)', borderBottom: '1px solid var(--primary-700)' }}>
        <p className="font-bold text-sm text-white">สรุปค่าตอบแทน</p>
        <p className="text-xs text-white/70">{group.group_name || `กลุ่ม ${group.id}`}</p>
      </div>
      <div className="p-4 space-y-4" style={{ background: '#fff' }}>
        {summary ? (
          <>
            <div className="space-y-2">
              <SummaryRow label="จำนวน Lab Boy" value={`${summary.labBoyCount} คน`} />
              <SummaryRow label="ชั่วโมงต่อครั้ง" value={`${durationHrs.toFixed(2)} ชม.`} />
              <SummaryRow label="จำนวนครั้งทั้งหมด" value={`${summary.totalSessions} ครั้ง`} highlight />
              {summary.monthBreakdown.length > 1 && (
                <div style={{ paddingLeft: 12 }}>
                  {summary.monthBreakdown.map((mb) => (
                    <div key={mb.label} className="flex justify-between text-xs" style={{ color: 'var(--ink-500)' }}>
                      <span>{mb.label}</span>
                      <span>{mb.count} ครั้ง</span>
                    </div>
                  ))}
                </div>
              )}
              <SummaryRow label="อัตราค่าตอบแทน" value={`${(effectiveRate / 100).toFixed(2)} บ./ชม.`} />
            </div>

            <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--line-soft)' }}>
              <div className="text-xs font-mono px-2 py-1.5 rounded-lg" style={{ background: 'var(--line-soft)', color: 'var(--ink-600)' }}>
                {summary.labBoyCount} คน × {summary.totalSessions} ครั้ง × {durationHrs.toFixed(2)} ชม. × {(effectiveRate / 100).toFixed(0)} บ.
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--ink-500)' }}>ต่อคน</span>
                <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>
                  {summary.payPerPersonBaht.toFixed(2)} บาท
                </span>
              </div>
              <div className="flex justify-between items-center px-3 py-2 rounded-xl"
                style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink-700)' }}>รวมกลุ่ม</span>
                <span className="font-bold text-lg" style={{ color: 'var(--primary)' }}>
                  {summary.totalPayBaht.toFixed(2)} บ.
                </span>
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-400)' }}>
              * ค่าแสดงเป็น preview จาก Backend
            </p>
          </>
        ) : (
          <p className="text-xs text-center py-4" style={{ color: 'var(--ink-400)' }}>
            สร้างรายการวันทำงานเพื่อดูสรุป
          </p>
        )}

        {planLocked && (
          <div className="pt-2" style={{ borderTop: '1px solid var(--line-soft)' }}>
            <span className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>✓ แผนถูกล็อกแล้ว</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: 'var(--ink-500)' }}>{label}</span>
      <span className={highlight ? 'font-bold text-sm' : 'text-sm'}
        style={{ color: highlight ? 'var(--primary)' : 'var(--ink-800)', fontWeight: highlight ? 700 : 400 }}>
        {value}
      </span>
    </div>
  )
}

function HiringPreviewModal({
  staffCase, scheduleGroups, onClose,
}: {
  staffCase: StaffCaseResponse
  scheduleGroups: ScheduleGroup[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog" aria-modal aria-label="ตัวอย่างข้อมูลเอกสารต้นภาคเรียน" tabIndex={-1}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="font-bold" style={{ color: 'var(--ink-900)' }}>ตัวอย่างข้อมูลสำหรับเอกสาร</h2>
          <button onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-xs">✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <PreviewRow label="รหัสวิชา" value={staffCase.course_code} />
            <PreviewRow label="กลุ่มเรียน" value={String(staffCase.section)} />
            <PreviewRow label="ชื่อวิชา" value={staffCase.course_title} />
            <PreviewRow label="อาจารย์" value={staffCase.instructor_name} />
            <PreviewRow label="ภาคเรียน" value={`${staffCase.semester} / ${staffCase.academic_year}`} />
            <PreviewRow label="Lab Boy" value={`${staffCase.lab_boys?.length ?? 0} คน`} />
          </div>
          {scheduleGroups.map((g) => (
            <div key={g.id} className="rounded-xl p-3 space-y-1" style={{ border: '1.5px solid var(--line)' }}>
              <div className="font-bold" style={{ color: 'var(--ink-900)' }}>{g.group_name || `กลุ่ม ${g.id}`}</div>
              <div className="text-xs" style={{ color: 'var(--ink-600)' }}>{DAY_LABELS[g.week_day]} {g.start_time}–{g.end_time}</div>
              <div className="text-xs" style={{ color: 'var(--ink-600)' }}>
                {g.assigned_students?.map((s) => s.student_name).join(', ') || '(ยังไม่กำหนด Lab Boy)'}
              </div>
              <div className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                อัตรา {((g.rate_per_hour_satang || staffCase.rate_per_hour_satang) / 100).toFixed(2)} บาท/ชม.
              </div>
            </div>
          ))}
          <div className="rounded-xl p-2 text-xs" style={{ background: 'var(--amber-bg)', color: '#92400E' }}>
            เอกสารจะถูกสร้างจากข้อมูล snapshot ณ เวลาล็อกแผน
          </div>
        </div>
        <div className="p-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm">ปิด</button>
          <button disabled title="ระบบ generate เอกสารต้นภาคเรียนกำลังพัฒนา"
            className="btn btn-primary btn-sm" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
            สร้างเอกสาร (ยังไม่พร้อม)
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--ink-400)' }}>{label}</div>
      <div className="font-semibold" style={{ color: 'var(--ink-900)' }}>{value || '—'}</div>
    </div>
  )
}
