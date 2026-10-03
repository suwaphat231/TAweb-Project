import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import type { StaffCaseResponse, MonthlyPeriodResponse, OccurrenceStatus, StaffDocument, ScheduleGroup } from '../../../types'

const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี',
  FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const THAI_MONTHS = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  scheduled: 'กำหนดการ', cancelled_holiday: 'วันหยุด',
  rescheduled: 'เลื่อน', completed: 'เสร็จ',
  absent: 'ขาด', cancelled_other: 'ยกเลิก',
}

interface Props {
  staffCase: StaffCaseResponse
}

export default function MonthlyOpsTab({ staffCase }: Props) {
  const qc = useQueryClient()
  const caseId = staffCase.id
  const [openPeriodForm, setOpenPeriodForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['staff-monthly-periods', caseId],
    queryFn: () => staffApi.listMonthlyPeriods(caseId),
  })
  const { data: scheduleGroups = [] } = useQuery({
    queryKey: ['staff-schedule-groups', caseId],
    queryFn: () => staffApi.getCaseScheduleGroups(caseId),
  })

  const openMut = useMutation({
    mutationFn: () => staffApi.openMonthlyPeriod(caseId, openPeriodForm.month, openPeriodForm.year),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-monthly-periods', caseId] }),
  })
  const closeMut = useMutation({
    mutationFn: (id: number) => staffApi.closeMonthlyPeriod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-monthly-periods', caseId] }),
  })

  if (isLoading) return <p className="text-gray-500 text-sm py-4">กำลังโหลด...</p>

  return (
    <div className="space-y-4">
      {/* Open period */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-600 mb-1">เดือน</label>
          <select value={openPeriodForm.month}
            onChange={(e) => setOpenPeriodForm({ ...openPeriodForm, month: Number(e.target.value) })}
            className="border rounded px-2 py-1 text-sm"
          >
            {THAI_MONTHS.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">ปี (ค.ศ.)</label>
          <input type="number" value={openPeriodForm.year} min={2020} max={2100}
            onChange={(e) => setOpenPeriodForm({ ...openPeriodForm, year: Number(e.target.value) })}
            className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <button
          onClick={() => openMut.mutate()}
          disabled={openMut.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {openMut.isPending ? 'กำลังเปิด...' : 'เปิดรอบเดือน'}
        </button>
      </div>

      {periods.length === 0 && (
        <p className="text-gray-500 text-sm py-4 text-center">ยังไม่มีรอบเดือน</p>
      )}

      {periods.map((p) => (
        <PeriodAccordion
          key={p.id}
          period={p}
          expanded={expandedId === p.id}
          onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
          onClose={() => closeMut.mutate(p.id)}
          closing={closeMut.isPending}
          staffCase={staffCase}
          scheduleGroups={scheduleGroups}
        />
      ))}
    </div>
  )
}

function PeriodAccordion({
  period, expanded, onToggle, onClose, closing, staffCase, scheduleGroups,
}: {
  period: MonthlyPeriodResponse
  expanded: boolean
  onToggle: () => void
  onClose: () => void
  closing: boolean
  staffCase: StaffCaseResponse
  scheduleGroups: ScheduleGroup[]
}) {
  const [generatedDoc, setGeneratedDoc] = useState<StaffDocument | null>(null)
  const [genDocError, setGenDocError] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const { data: occs = [] } = useQuery({
    queryKey: ['monthly-occurrences', period.id],
    queryFn: () => staffApi.getMonthlyOccurrences(period.id),
    enabled: expanded,
  })

  const genDocMut = useMutation({
    mutationFn: (type: 'work_report' | 'payment_request') =>
      staffApi.generateMonthlyDocument(period.id, type, selectedGroupId ? { schedule_group_id: selectedGroupId } : undefined),
    onSuccess: (doc) => {
      setGeneratedDoc(doc)
      setGenDocError(null)
    },
    onError: (err: Error) => setGenDocError(err.message),
  })
  const downloadDocMut = useMutation({
    mutationFn: (docId: number) => staffApi.downloadDocument(docId),
    onSuccess: (blob, docId) => {
      const doc = generatedDoc?.id === docId ? generatedDoc : null
      downloadBlob(blob, doc ? doc.name + '.docx' : `document-${docId}.docx`)
    },
    onError: (err: Error) => setGenDocError(err.message),
  })

  const totalBaht = (period.total_amount_satang / 100).toFixed(2)
  const ratePerHourBaht = (staffCase.rate_per_hour_satang / 100).toFixed(2)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-800">
            {THAI_MONTHS[period.month]} {period.year + 543}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            period.status === 'closed'
              ? 'bg-gray-200 text-gray-700'
              : 'bg-blue-100 text-blue-800'
          }`}>
            {period.status === 'closed' ? 'ปิดแล้ว' : 'เปิดอยู่'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>เสร็จ {period.completed_sessions}/{period.total_sessions}</span>
          <span className="font-medium text-gray-800">{period.total_hours} ชม.</span>
          <span className="font-medium text-green-700">{totalBaht} บาท</span>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div className="bg-blue-50 rounded p-2">
              <div className="font-bold text-blue-700">{period.total_sessions}</div>
              <div className="text-blue-600 text-xs">ทั้งหมด</div>
            </div>
            <div className="bg-green-50 rounded p-2">
              <div className="font-bold text-green-700">{period.completed_sessions}</div>
              <div className="text-green-600 text-xs">เสร็จสิ้น</div>
            </div>
            <div className="bg-red-50 rounded p-2">
              <div className="font-bold text-red-700">{period.absent_sessions}</div>
              <div className="text-red-600 text-xs">ขาด</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="font-bold text-gray-700">{period.cancelled_sessions}</div>
              <div className="text-gray-600 text-xs">ยกเลิก</div>
            </div>
          </div>

          {/* Payment summary */}
          <div className="bg-green-50 rounded-lg p-3 text-sm flex justify-between items-center">
            <span className="text-gray-600">
              {period.total_hours} ชม. × {ratePerHourBaht} บาท/ชม.
            </span>
            <span className="font-bold text-green-700 text-base">{totalBaht} บาท</span>
          </div>

          {/* Occurrences */}
          {occs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border px-2 py-1 text-left">วันที่</th>
                    <th className="border px-2 py-1 text-left">เวลา</th>
                    <th className="border px-2 py-1 text-left">สถานะ</th>
                    <th className="border px-2 py-1 text-right">ชม.</th>
                  </tr>
                </thead>
                <tbody>
                  {occs.map((o) => (
                    <tr key={o.id} className={o.status === 'rescheduled' ? 'opacity-40' : ''}>
                      <td className="border px-2 py-1">{o.scheduled_date.slice(0, 10)}</td>
                      <td className="border px-2 py-1">{o.start_time}-{o.end_time}</td>
                      <td className="border px-2 py-1">{STATUS_LABELS[o.status]}</td>
                      <td className="border px-2 py-1 text-right">
                        {o.status === 'completed' ? (o.actual_hours || staffCase.hours_per_session) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Generated document feedback */}
          {generatedDoc && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm flex items-center justify-between">
              <span className="text-blue-800">สร้างเอกสาร <strong>{generatedDoc.name}</strong> เรียบร้อย</span>
              <button
                onClick={() => downloadDocMut.mutate(generatedDoc.id)}
                disabled={downloadDocMut.isPending}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 ml-3"
              >
                {downloadDocMut.isPending ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด .docx'}
              </button>
            </div>
          )}
          {genDocError && (
            <p className="text-red-600 text-sm">{genDocError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {scheduleGroups.length > 0 && (
              <div className="flex items-center gap-2 text-sm w-full">
                <label className="text-gray-600 text-xs">สร้างสำหรับ:</label>
                <select
                  value={selectedGroupId ?? ''}
                  onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">ทุกกลุ่ม</option>
                  {scheduleGroups.map((sg) => (
                    <option key={sg.id} value={sg.id}>
                      {DAY_LABELS[sg.week_day] ?? sg.week_day} {sg.start_time}–{sg.end_time}
                      {sg.assigned_students?.length > 0 ? ` (${sg.assigned_students.length} คน)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => genDocMut.mutate('work_report')}
              disabled={genDocMut.isPending || period.completed_sessions === 0}
              className="px-4 py-2 border border-blue-300 text-blue-700 rounded text-sm hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={period.completed_sessions === 0 ? 'ยังไม่มีวันทำงานที่เสร็จสิ้น' : undefined}
            >
              {genDocMut.isPending ? 'กำลังสร้าง...' : 'สร้างรายงานผลการปฏิบัติงาน'}
            </button>
            <button
              onClick={() => genDocMut.mutate('payment_request')}
              disabled={genDocMut.isPending || period.completed_sessions === 0}
              className="px-4 py-2 border border-green-300 text-green-700 rounded text-sm hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={period.completed_sessions === 0 ? 'ยังไม่มีวันทำงานที่เสร็จสิ้น' : undefined}
            >
              {genDocMut.isPending ? 'กำลังสร้าง...' : 'สร้างบันทึกขออนุมัติเบิกจ่าย'}
            </button>
            {period.status === 'open' && (
              <button
                onClick={onClose}
                disabled={closing}
                className="px-4 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50 ml-auto"
              >
                {closing ? 'กำลังปิด...' : 'ปิดรอบเดือน'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
