import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type {
  StaffCaseResponse, OccurrenceStatus, WorkOccurrence,
  CalendarDateType, ScheduleGroup, LabBoyInfo,
} from '../../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_OPTIONS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี',
  FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
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
const STATUS_COLORS: Record<OccurrenceStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  cancelled_holiday: 'bg-gray-100 text-gray-500 line-through',
  rescheduled: 'bg-yellow-100 text-yellow-800 line-through',
  completed: 'bg-green-100 text-green-800',
  absent: 'bg-red-100 text-red-800',
  cancelled_other: 'bg-gray-100 text-gray-500',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatThaiDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`
}

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

  // totalValidMinutes × rate / 60
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

  // --- UI State ---
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [showAddGroupForm, setShowAddGroupForm] = useState(false)
  const [addForm, setAddForm] = useState<GroupFormState>(() => defaultGroupForm())
  const [editForm, setEditForm] = useState<GroupFormState | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showStudents, setShowStudents] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([])
  const [showGenForm, setShowGenForm] = useState(false)
  const [genDates, setGenDates] = useState({ start_date: '', end_date: '' })
  const [reschedulingId, setReschedulingId] = useState<number | null>(null)
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

  // --- Queries ---
  const { data: scheduleGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['staff-schedule-groups', caseId],
    queryFn: () => staffApi.getCaseScheduleGroups(caseId),
  })
  const selectedGroup = scheduleGroups.find((g) => g.id === selectedGroupId) ?? null

  const { data: groupOccs = [], isLoading: occsLoading } = useQuery({
    queryKey: ['staff-group-occurrences', selectedGroupId],
    queryFn: () => staffApi.listGroupOccurrences(caseId, selectedGroupId!),
    enabled: !!selectedGroupId,
  })

  const { data: calDates = [] } = useQuery({
    queryKey: ['staff-calendar-dates', caseId],
    queryFn: () => staffApi.listCalendarDates(caseId),
  })

  // --- Derived ---
  const monthGroups = useMemo(() => groupByMonth(groupOccs), [groupOccs])
  const summary = useMemo(
    () => selectedGroup ? computeSummary(selectedGroup, groupOccs, staffCase.rate_per_hour_satang) : null,
    [selectedGroup, groupOccs, staffCase.rate_per_hour_satang],
  )

  const validationErrors = useMemo((): string[] => {
    if (!selectedGroup) return []
    if (selectedGroup.locked_at) return []
    const errs: string[] = []
    if (!staffCase.instructor_confirmed) {
      errs.push('อาจารย์ยังไม่ได้ยืนยันรายชื่อ Lab Boy')
    }
    if (!selectedGroup.assigned_students?.length) {
      errs.push('ยังไม่มี Lab Boy ในกลุ่มนี้')
    }
    if (!selectedGroup.week_day) {
      errs.push('ยังไม่ได้กำหนดวันประจำสัปดาห์')
    }
    if (selectedGroup.start_time >= selectedGroup.end_time) {
      errs.push('เวลาเริ่มต้องก่อนเวลาสิ้นสุด')
    }
    const rateSatang = selectedGroup.rate_per_hour_satang || staffCase.rate_per_hour_satang
    if (rateSatang === 0) {
      errs.push('ยังไม่กำหนดอัตราค่าตอบแทน')
    }
    const countedOccs = groupOccs.filter((o) => isCountedStatus(o.status))
    if (countedOccs.length === 0) {
      errs.push('ไม่มีวันทำงานที่นับได้ กรุณาสร้างรายการวันทำงานก่อน')
    }
    return errs
  }, [selectedGroup, groupOccs, staffCase])

  // --- Mutations ---
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
      setShowGenForm(false)
    },
  })

  const updateOccMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      staffApi.updateOccurrence(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-group-occurrences', selectedGroupId] }),
  })

  const rescheduleMut = useMutation({
    mutationFn: ({ id, newDate, newStart, newEnd, reason }: {
      id: number; newDate: string; newStart: string; newEnd: string; reason: string
    }) => staffApi.rescheduleOccurrence(id, newDate, newStart, newEnd, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-group-occurrences', selectedGroupId] })
      setReschedulingId(null)
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

  // ─── Helpers for handlers ────

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

  return (
    <div className="space-y-5">
      {/* ── Settings bar ── */}
      <div className="border rounded-lg p-3 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-5 text-sm flex-wrap">
          <span>
            <span className="text-gray-500">อัตราค่าตอบแทน:</span>{' '}
            <strong className="text-blue-700">{rateDisplay}</strong>
            <span className="ml-1 text-xs text-gray-400">(ค่าเริ่มต้นของ Case)</span>
          </span>
          {staffCase.hours_per_session > 0 && (
            <span>
              <span className="text-gray-500">ชั่วโมง/ครั้ง:</span>{' '}
              <strong>{staffCase.hours_per_session} ชม.</strong>
            </span>
          )}
        </div>
        {!planLocked && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-white"
          >
            ตั้งค่า Case
          </button>
        )}
      </div>

      {/* Settings form */}
      {showSettings && (
        <div className="border rounded-lg p-4 bg-white space-y-3">
          <h4 className="font-medium text-sm text-gray-800">ตั้งค่า Staff Case (ค่าเริ่มต้น)</h4>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">ชั่วโมง/ครั้ง</label>
              <input type="number" step="0.5" min="0" value={settingsForm.hours_per_session}
                onChange={(e) => setSettingsForm({ ...settingsForm, hours_per_session: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" placeholder="2.0" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">อัตรา (บาท/ชม.)</label>
              <input type="number" step="0.01" min="0" value={settingsForm.rate_per_hour_baht}
                onChange={(e) => setSettingsForm({ ...settingsForm, rate_per_hour_baht: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" placeholder="50.00" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">วันที่เริ่ม</label>
              <input type="date" value={settingsForm.work_start_date}
                onChange={(e) => setSettingsForm({ ...settingsForm, work_start_date: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">วันที่สิ้นสุด</label>
              <input type="date" value={settingsForm.work_end_date}
                onChange={(e) => setSettingsForm({ ...settingsForm, work_end_date: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {saveSettingsMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => setShowSettings(false)} className="px-4 py-1.5 border rounded text-sm">ยกเลิก</button>
          </div>
          {saveSettingsMut.isError && (
            <p className="text-red-600 text-xs">{String((saveSettingsMut.error as Error).message)}</p>
          )}
        </div>
      )}

      {/* ── Two-column main layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Left column ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Group selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800 text-sm">กลุ่มตารางทำงาน</h3>
              {!planLocked && (
                <button
                  onClick={() => {
                    setAddForm(defaultGroupForm(nextGroupName(scheduleGroups)))
                    setShowAddGroupForm(true)
                  }}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  + เพิ่มกลุ่ม
                </button>
              )}
            </div>

            {groupsLoading ? (
              <div className="h-12 bg-gray-100 rounded animate-pulse" />
            ) : scheduleGroups.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
                ยังไม่มีกลุ่มตาราง กดปุ่ม &quot;เพิ่มกลุ่ม&quot; เพื่อเริ่ม
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {scheduleGroups.map((sg) => (
                  <button
                    key={sg.id}
                    onClick={() => selectGroup(sg)}
                    className={[
                      'px-3 py-2 rounded-lg border text-left text-sm transition-all',
                      selectedGroupId === sg.id
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-blue-300',
                    ].join(' ')}
                  >
                    <div className="font-semibold text-gray-800 text-xs">
                      {sg.group_name || `กลุ่ม ${sg.id}`}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {DAY_LABELS[sg.week_day]} {sg.start_time}–{sg.end_time}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-indigo-600">
                        {sg.assigned_students?.length ?? 0} คน
                      </span>
                      {sg.locked_at ? (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">ล็อก</span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">draft</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add group form */}
          {showAddGroupForm && (
            <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
              <h4 className="font-medium text-sm text-blue-900">สร้างกลุ่มตารางใหม่</h4>
              <GroupFormFields form={addForm} onChange={setAddForm} caseRateSatang={staffCase.rate_per_hour_satang} />
              <div className="flex gap-2">
                <button onClick={() => addGroupMut.mutate()} disabled={addGroupMut.isPending || !addForm.week_day}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {addGroupMut.isPending ? 'กำลังสร้าง...' : 'สร้างกลุ่ม'}
                </button>
                <button onClick={() => setShowAddGroupForm(false)} className="px-4 py-1.5 border rounded text-sm">ยกเลิก</button>
              </div>
              {addGroupMut.isError && (
                <p className="text-red-600 text-xs">{String((addGroupMut.error as Error).message)}</p>
              )}
            </div>
          )}

          {/* Selected group detail */}
          {selectedGroup ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-800 text-sm">
                    {selectedGroup.group_name || `กลุ่ม ${selectedGroup.id}`}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {DAY_LABELS[selectedGroup.week_day]} {selectedGroup.start_time}–{selectedGroup.end_time}
                  </span>
                  {selectedGroup.locked_at && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      ล็อกแล้ว
                    </span>
                  )}
                </div>
                {!planLocked && !selectedGroup.locked_at && (
                  <div className="flex gap-2">
                    {!isEditing && (
                      <button onClick={() => startEditing(selectedGroup)}
                        className="text-xs text-blue-600 hover:underline">แก้ไข</button>
                    )}
                    <button onClick={() => deleteGroupMut.mutate(selectedGroup.id)}
                      disabled={deleteGroupMut.isPending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50">ลบ</button>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Edit form */}
                {isEditing && editForm ? (
                  <div className="space-y-3 bg-blue-50 rounded-lg p-3">
                    <GroupFormFields form={editForm} onChange={setEditForm} caseRateSatang={staffCase.rate_per_hour_satang} />
                    <div className="flex gap-2">
                      <button onClick={() => updateGroupMut.mutate()} disabled={updateGroupMut.isPending}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                        {updateGroupMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                      <button onClick={() => { setIsEditing(false); setEditForm(null) }}
                        className="px-4 py-1.5 border rounded text-sm">ยกเลิก</button>
                    </div>
                    {updateGroupMut.isError && (
                      <p className="text-red-600 text-xs">{String((updateGroupMut.error as Error).message)}</p>
                    )}
                  </div>
                ) : (
                  /* Read-only group info */
                  <GroupInfoDisplay group={selectedGroup} caseRateSatang={staffCase.rate_per_hour_satang} />
                )}

                {/* Lab Boy assignment */}
                {!planLocked && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        Lab Boy ในกลุ่มนี้ ({selectedGroup.assigned_students?.length ?? 0} คน)
                      </span>
                      {!selectedGroup.locked_at && (
                        <button
                          onClick={() => {
                            setSelectedStudentIds(selectedGroup.assigned_students?.map((s) => s.student_id) ?? [])
                            setShowStudents(!showStudents)
                          }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          {showStudents ? 'ซ่อน' : 'กำหนด Lab Boy'}
                        </button>
                      )}
                    </div>
                    {selectedGroup.assigned_students?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {selectedGroup.assigned_students.map((s) => (
                          <span key={s.student_id}
                            className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
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

                {/* Generate occurrences */}
                {!planLocked && !selectedGroup.locked_at && (
                  <div>
                    <button
                      onClick={() => setShowGenForm(!showGenForm)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      {showGenForm ? '▲ ซ่อน' : '▼ สร้างรายการวันทำงาน'}
                    </button>
                    {showGenForm && (
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg space-y-2">
                        <p className="text-xs text-blue-800 font-medium">
                          สร้างวันทำงานสำหรับ {DAY_LABELS[selectedGroup.week_day]} {selectedGroup.start_time}–{selectedGroup.end_time}
                        </p>
                        <div className="flex gap-3 flex-wrap items-end">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">วันที่เริ่ม</label>
                            <input type="date" value={genDates.start_date}
                              onChange={(e) => setGenDates({ ...genDates, start_date: e.target.value })}
                              className="border rounded px-2 py-1 text-xs" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">วันที่สิ้นสุด</label>
                            <input type="date" value={genDates.end_date}
                              onChange={(e) => setGenDates({ ...genDates, end_date: e.target.value })}
                              className="border rounded px-2 py-1 text-xs" />
                          </div>
                          <button
                            onClick={() => genOccsMut.mutate()}
                            disabled={genOccsMut.isPending || !genDates.start_date || !genDates.end_date}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                          >
                            {genOccsMut.isPending ? 'กำลังสร้าง...' : 'สร้างวันที่ปฏิบัติงาน'}
                          </button>
                        </div>
                        {genOccsMut.isError && (
                          <p className="text-red-600 text-xs">{String((genOccsMut.error as Error).message)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Monthly occurrence list */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    รายการวันทำงาน ({groupOccs.length} รายการ)
                  </h4>
                  {occsLoading ? (
                    <div className="h-16 bg-gray-100 rounded animate-pulse" />
                  ) : groupOccs.length === 0 ? (
                    <p className="text-gray-400 text-xs py-4 text-center">
                      ยังไม่มีวันทำงาน กดสร้างรายการวันทำงานด้านบน
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {monthGroups.map((mg) => (
                        <div key={mg.key}>
                          <div className="flex items-center justify-between mb-1 sticky top-0 bg-white py-1">
                            <span className="text-xs font-bold text-gray-700">{mg.label}</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {mg.countedSessions} ครั้ง
                            </span>
                          </div>
                          <div className="space-y-1">
                            {mg.occurrences.map((occ) => (
                              <OccurrenceRow
                                key={occ.id}
                                occ={occ}
                                planLocked={planLocked}
                                groupLocked={!!selectedGroup.locked_at}
                                isRescheduling={reschedulingId === occ.id}
                                onUpdate={(status) => updateOccMut.mutate({ id: occ.id, status })}
                                onStartReschedule={() => setReschedulingId(occ.id)}
                                onCancelReschedule={() => setReschedulingId(null)}
                                onReschedule={(nd, ns, ne, r) =>
                                  rescheduleMut.mutate({ id: occ.id, newDate: nd, newStart: ns, newEnd: ne, reason: r })
                                }
                                reschedulePending={rescheduleMut.isPending && reschedulingId === occ.id}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Validation errors + Lock button for group */}
                {!planLocked && !selectedGroup.locked_at && (
                  <div className="pt-2 border-t space-y-2">
                    {validationErrors.length > 0 && (
                      <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                        {validationErrors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => lockGroupMut.mutate()}
                      disabled={lockGroupMut.isPending || validationErrors.length > 0}
                      title={validationErrors.length > 0 ? validationErrors.join('\n') : undefined}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 font-medium"
                    >
                      {lockGroupMut.isPending ? 'กำลังล็อก...' : 'ตรวจสอบและล็อกแผนกลุ่มนี้'}
                    </button>
                    {lockGroupMut.isError && (
                      <p className="text-red-600 text-xs">{String((lockGroupMut.error as Error).message)}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : scheduleGroups.length > 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
              เลือกกลุ่มตารางด้านบนเพื่อดูรายละเอียด
            </div>
          ) : null}

        </div>{/* end left column */}

        {/* ── Right column: Summary panel ── */}
        <div className="lg:w-72 shrink-0">
          <WorkPlanSummary
            group={selectedGroup}
            summary={summary}
            planLocked={planLocked}
            caseRateSatang={staffCase.rate_per_hour_satang}
          />
        </div>
      </div>

      {/* ── Holiday section ── */}
      <div>
        {calDates.length > 0 && (
          <div className="mb-2">
            <h4 className="text-xs font-semibold text-gray-600 mb-1">วันหยุด/วันงดที่บันทึกไว้</h4>
            <div className="space-y-1">
              {calDates.map((cd) => (
                <div key={cd.id}
                  className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-1.5 text-xs">
                  <span className="font-medium">{cd.date.slice(0, 10)}</span>
                  <span className="text-gray-700 flex-1 px-2">{cd.name}</span>
                  <span className="text-gray-400 mr-2">{cd.scope}</span>
                  {!planLocked && (
                    <button onClick={() => deleteHolidayMut.mutate(cd.id)}
                      className="text-red-500 hover:text-red-700">ลบ</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {!planLocked && (
          <button
            onClick={() => setShowHolidayForm(!showHolidayForm)}
            className="text-xs text-amber-600 hover:underline"
          >
            + เพิ่มวันหยุด/วันงด
          </button>
        )}
        {showHolidayForm && !planLocked && (
          <div className="mt-2 border rounded-lg p-3 bg-amber-50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">วันที่</label>
                <input type="date" value={holidayForm.date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">ชื่อ/เหตุผล</label>
                <input type="text" value={holidayForm.name} placeholder="เช่น วันชาติ"
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">ประเภท</label>
                <select value={holidayForm.date_type}
                  onChange={(e) => setHolidayForm({ ...holidayForm, date_type: e.target.value as CalendarDateType })}
                  className="w-full border rounded px-2 py-1 text-xs">
                  <option value="public_holiday">วันหยุดราชการ</option>
                  <option value="university_holiday">วันหยุดมหาวิทยาลัย</option>
                  <option value="no_class">งดการเรียนการสอน</option>
                  <option value="case_exception">ข้อยกเว้นเฉพาะ case</option>
                  <option value="makeup">วันชดเชย</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">ขอบเขต</label>
                <select value={holidayForm.scope}
                  onChange={(e) => setHolidayForm({ ...holidayForm, scope: e.target.value as 'global' | 'semester' | 'case' })}
                  className="w-full border rounded px-2 py-1 text-xs">
                  <option value="global">ทุกรายวิชา</option>
                  <option value="semester">ภาคการศึกษานี้</option>
                  <option value="case">เฉพาะ case นี้</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={holidayForm.affects_work}
                onChange={(e) => setHolidayForm({ ...holidayForm, affects_work: e.target.checked })} />
              ยกเลิกวันทำงานในวันนี้
            </label>
            <div className="flex gap-2">
              <button onClick={() => addHolidayMut.mutate()}
                disabled={addHolidayMut.isPending || !holidayForm.date || !holidayForm.name}
                className="px-3 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600 disabled:opacity-50">
                {addHolidayMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => setShowHolidayForm(false)} className="px-3 py-1 border rounded text-xs">ยกเลิก</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Plan lock section (Case level) ── */}
      {!planLocked && scheduleGroups.length > 0 && (
        <div className="border-t pt-4">
          {scheduleGroups.some((g) => !g.locked_at) ? (
            <div className="text-xs text-gray-500 bg-gray-50 border rounded p-3">
              ล็อกทุกกลุ่มก่อนเพื่อเปิดปุ่มล็อกแผนงาน
              ({scheduleGroups.filter((g) => g.locked_at).length}/{scheduleGroups.length} กลุ่มถูกล็อกแล้ว)
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-green-700 font-medium">ทุกกลุ่มถูกล็อกแล้ว พร้อมล็อกแผนงาน</p>
              <button
                onClick={() => lockPlanMut.mutate()}
                disabled={lockPlanMut.isPending}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 font-semibold"
              >
                {lockPlanMut.isPending ? 'กำลังล็อก...' : 'ล็อกแผนงานทั้งหมด'}
              </button>
              {lockPlanMut.isError && (
                <p className="text-red-600 text-xs">{String((lockPlanMut.error as Error).message)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {planLocked && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-green-800 text-sm font-medium">แผนการทำงานถูกล็อกแล้ว</span>
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-1.5 border border-green-500 text-green-700 rounded text-xs hover:bg-green-100"
          >
            ดูตัวอย่างเอกสาร
          </button>
        </div>
      )}

      {/* Preview modal */}
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
  form: {
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
  onChange: (f: typeof form) => void
  caseRateSatang: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs text-gray-600 mb-1">ชื่อกลุ่ม</label>
        <input type="text" value={form.group_name} placeholder="เช่น กลุ่ม A"
          onChange={(e) => onChange({ ...form, group_name: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">วันประจำสัปดาห์</label>
        <select value={form.week_day} onChange={(e) => onChange({ ...form, week_day: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm">
          {DAY_OPTIONS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">เวลาเริ่ม</label>
        <input type="time" value={form.start_time}
          onChange={(e) => onChange({ ...form, start_time: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">เวลาสิ้นสุด</label>
        <input type="time" value={form.end_time}
          onChange={(e) => onChange({ ...form, end_time: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">วันที่เริ่ม</label>
        <input type="date" value={form.work_start_date}
          onChange={(e) => onChange({ ...form, work_start_date: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">วันที่สิ้นสุด</label>
        <input type="date" value={form.work_end_date}
          onChange={(e) => onChange({ ...form, work_end_date: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          อัตราค่าตอบแทน (บาท/ชม.)
          {caseRateSatang > 0 && (
            <span className="ml-1 text-gray-400">(ค่าเริ่มต้น {(caseRateSatang / 100).toFixed(2)})</span>
          )}
        </label>
        <input type="number" step="0.01" min="0" value={form.rate_per_hour_baht}
          placeholder={caseRateSatang > 0 ? String(caseRateSatang / 100) : '50.00'}
          onChange={(e) => onChange({ ...form, rate_per_hour_baht: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">ชั่วโมง/ครั้ง (ถ้าแตกต่างจากช่วงเวลา)</label>
        <input type="number" step="0.5" min="0" value={form.hours_per_session}
          onChange={(e) => onChange({ ...form, hours_per_session: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" placeholder="ว่าง = คำนวณจากเวลา" />
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="block text-xs text-gray-600 mb-1">หมายเหตุ</label>
        <input type="text" value={form.note}
          onChange={(e) => onChange({ ...form, note: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm" />
      </div>
    </div>
  )
}

function GroupInfoDisplay({ group, caseRateSatang }: { group: ScheduleGroup; caseRateSatang: number }) {
  const effectiveRate = group.rate_per_hour_satang > 0 ? group.rate_per_hour_satang : caseRateSatang
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <div><span className="text-gray-500 text-xs">วัน:</span> {DAY_LABELS[group.week_day]}</div>
      <div><span className="text-gray-500 text-xs">เวลา:</span> {group.start_time}–{group.end_time}</div>
      {group.work_start_date && (
        <div><span className="text-gray-500 text-xs">ช่วงวันที่:</span> {group.work_start_date.slice(0, 10)} – {group.work_end_date?.slice(0, 10) ?? '?'}</div>
      )}
      <div>
        <span className="text-gray-500 text-xs">อัตรา:</span>{' '}
        <strong className="text-blue-700">{(effectiveRate / 100).toFixed(2)} บาท/ชม.</strong>
        {group.rate_per_hour_satang > 0 && <span className="text-xs text-blue-500 ml-1">(เฉพาะกลุ่ม)</span>}
      </div>
      {group.hours_per_session > 0 && (
        <div><span className="text-gray-500 text-xs">ชม./ครั้ง:</span> {group.hours_per_session}</div>
      )}
      {group.note && <div className="col-span-2"><span className="text-gray-500 text-xs">หมายเหตุ:</span> {group.note}</div>}
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
    <div className="border rounded-lg p-3 bg-indigo-50 space-y-2">
      {allLabBoys.length === 0 ? (
        <p className="text-xs text-gray-500">ยังไม่มี Lab Boy ที่ได้รับเลือก</p>
      ) : (
        <div className="space-y-1">
          {allLabBoys.map((lb) => {
            const otherGroup = groupOfStudent(lb.student_id)
            return (
              <label key={lb.student_id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={selected.includes(lb.student_id)}
                  onChange={() => toggle(lb.student_id)} />
                <span className="text-gray-800">{lb.student_name}</span>
                <span className="text-gray-400 font-mono">{lb.student_code}</span>
                {otherGroup && (
                  <span className="text-amber-600 text-xs">(อยู่ใน{otherGroup})</span>
                )}
              </label>
            )
          })}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={isSaving}
          className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-50">
          {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button onClick={onCancel} className="px-3 py-1 border rounded text-xs">ยกเลิก</button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  )
}

function WorkPlanSummary({
  group, summary, planLocked, caseRateSatang,
}: {
  group: ScheduleGroup | null
  summary: GroupSummary | null
  planLocked: boolean
  caseRateSatang: number
}) {
  if (!group) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50 text-center text-gray-400 text-sm">
        <div className="text-2xl mb-2">📊</div>
        <p>เลือกกลุ่มตารางเพื่อดูสรุปค่าตอบแทน</p>
      </div>
    )
  }

  const effectiveRate = group.rate_per_hour_satang > 0 ? group.rate_per_hour_satang : caseRateSatang
  const durationMins = summary ? summary.durationMins : 0
  const durationHrs = durationMins / 60

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-white sticky top-4">
      <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">
        สรุปค่าตอบแทน — {group.group_name || `กลุ่ม ${group.id}`}
      </h3>

      {summary && (
        <>
          {/* Key metrics */}
          <div className="space-y-2 text-sm">
            <Row label="จำนวน Lab Boy" value={`${summary.labBoyCount} คน`} />
            <Row label="ชั่วโมงต่อครั้ง" value={`${durationHrs.toFixed(2)} ชม. (${durationMins} นาที)`} />
            <Row label="จำนวนครั้งทั้งหมด" value={`${summary.totalSessions} ครั้ง`} highlight />
            {summary.monthBreakdown.length > 1 && (
              <div className="pl-2">
                {summary.monthBreakdown.map((mb) => (
                  <div key={mb.label} className="flex justify-between text-xs text-gray-500">
                    <span>{mb.label}</span>
                    <span>{mb.count} ครั้ง</span>
                  </div>
                ))}
              </div>
            )}
            <Row label="อัตราค่าตอบแทน" value={`${(effectiveRate / 100).toFixed(2)} บาท/ชม.`} />
          </div>

          <div className="border-t pt-3 space-y-1">
            {/* Formula display */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 font-mono">
              {summary.labBoyCount} คน × {summary.totalSessions} ครั้ง × {durationHrs.toFixed(2)} ชม. × {(effectiveRate / 100).toFixed(0)} บาท
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">ต่อคน</span>
              <span className="font-bold text-blue-700">
                {summary.payPerPersonBaht.toFixed(2)} บาท
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">รวมกลุ่ม</span>
              <span className="font-bold text-green-700 text-base">
                {summary.totalPayBaht.toFixed(2)} บาท
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            * ค่าแสดงเป็น preview จาก Backend (authoritative คำนวณตอนสร้างเอกสาร)
          </p>
        </>
      )}

      {!summary && (
        <p className="text-xs text-gray-400">สร้างรายการวันทำงานเพื่อดูสรุป</p>
      )}

      {planLocked && (
        <div className="border-t pt-2">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">แผนถูกล็อกแล้ว</span>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={highlight ? 'font-bold text-indigo-700' : 'text-gray-800 text-xs'}>{value}</span>
    </div>
  )
}

function OccurrenceRow({
  occ, planLocked, groupLocked, isRescheduling, onUpdate, onStartReschedule, onCancelReschedule, onReschedule, reschedulePending,
}: {
  occ: WorkOccurrence
  planLocked: boolean
  groupLocked: boolean
  isRescheduling: boolean
  onUpdate: (status: string) => void
  onStartReschedule: () => void
  onCancelReschedule: () => void
  onReschedule: (newDate: string, newStart: string, newEnd: string, reason: string) => void
  reschedulePending: boolean
}) {
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: '', new_start: occ.start_time, new_end: occ.end_time, reason: '',
  })

  const isEditable = !planLocked && !groupLocked
  const isCancelled = occ.status === 'cancelled_holiday' || occ.status === 'cancelled_other' || occ.status === 'rescheduled'

  return (
    <>
      <div className={[
        'flex items-center gap-2 py-1.5 px-2 rounded text-xs',
        isCancelled ? 'opacity-60' : '',
        isRescheduling ? 'bg-yellow-50 border border-yellow-200' : 'hover:bg-gray-50',
      ].join(' ')}>
        <span className={`w-36 font-medium ${isCancelled ? 'line-through text-gray-400' : 'text-gray-700'}`}>
          {formatThaiDate(occ.scheduled_date)}
        </span>
        <span className="text-gray-500 w-20 text-center">{occ.start_time}–{occ.end_time}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[occ.status]}`}>
          {STATUS_LABELS[occ.status]}
        </span>
        {occ.reason && <span className="text-gray-400 text-xs flex-1 truncate">({occ.reason})</span>}
        {occ.rescheduled_to_date && (
          <span className="text-yellow-600 text-xs">→ {occ.rescheduled_to_date.slice(0, 10)}</span>
        )}
        {isEditable && (occ.status === 'scheduled' || occ.status === 'cancelled_holiday') && (
          <div className="flex gap-1 ml-auto shrink-0">
            <button onClick={() => onUpdate('completed')} className="text-green-700 hover:underline">เสร็จ</button>
            <button onClick={() => onUpdate('absent')} className="text-red-600 hover:underline">ขาด</button>
            <button onClick={() => onUpdate('cancelled_other')} className="text-gray-500 hover:underline">ยกเลิก</button>
            {occ.status === 'scheduled' && (
              <button onClick={onStartReschedule} className="text-yellow-700 hover:underline">เลื่อน</button>
            )}
          </div>
        )}
      </div>
      {isRescheduling && (
        <div className="ml-2 p-2 bg-yellow-50 border border-yellow-200 rounded space-y-2 mb-1">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">วันที่ใหม่</label>
              <input type="date" value={rescheduleForm.new_date}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_date: e.target.value })}
                className="border rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">เวลาเริ่ม</label>
              <input type="time" value={rescheduleForm.new_start}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_start: e.target.value })}
                className="border rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">เวลาสิ้นสุด</label>
              <input type="time" value={rescheduleForm.new_end}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, new_end: e.target.value })}
                className="border rounded px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">เหตุผล</label>
              <input type="text" value={rescheduleForm.reason} placeholder="ระบุเหตุผล"
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                className="border rounded px-2 py-1 text-xs w-32" />
            </div>
            <button
              onClick={() => onReschedule(rescheduleForm.new_date, rescheduleForm.new_start, rescheduleForm.new_end, rescheduleForm.reason)}
              disabled={reschedulePending || !rescheduleForm.new_date}
              className="px-2 py-1 bg-yellow-600 text-white rounded text-xs disabled:opacity-50"
            >
              {reschedulePending ? '...' : 'ยืนยัน'}
            </button>
            <button onClick={onCancelReschedule} className="px-2 py-1 border rounded text-xs">ยกเลิก</button>
          </div>
        </div>
      )}
    </>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal
      aria-label="ตัวอย่างข้อมูลเอกสารต้นภาคเรียน"
      tabIndex={-1}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-900">ตัวอย่างข้อมูลสำหรับเอกสารต้นภาคเรียน</h2>
          <button onClick={onClose} aria-label="ปิด"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
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
            <div key={g.id} className="border rounded p-3 space-y-1">
              <div className="font-medium text-gray-800">{g.group_name || `กลุ่ม ${g.id}`}</div>
              <div className="text-gray-600 text-xs">
                {DAY_LABELS[g.week_day]} {g.start_time}–{g.end_time}
              </div>
              <div className="text-gray-600 text-xs">
                {g.assigned_students?.map((s) => s.student_name).join(', ') || '(ยังไม่กำหนด Lab Boy)'}
              </div>
              <div className="text-blue-700 text-xs font-medium">
                อัตรา {((g.rate_per_hour_satang || staffCase.rate_per_hour_satang) / 100).toFixed(2)} บาท/ชม.
              </div>
            </div>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
            เอกสารจะถูกสร้างจากข้อมูล snapshot ณ เวลาล็อกแผน
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm">ปิด</button>
          <button
            disabled
            title="ระบบ generate เอกสารต้นภาคเรียนกำลังพัฒนา"
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm opacity-50 cursor-not-allowed"
          >
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
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-800 font-medium">{value || '—'}</div>
    </div>
  )
}
