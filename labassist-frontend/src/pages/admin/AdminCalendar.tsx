import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import type { CalendarImportType, CalendarPreviewResponse } from '../../types'
import {
  CALENDAR_IMPORT_TYPE_LABELS, CALENDAR_SEMESTER_LABELS, currentAcademicYear, entryDays,
  formatEntryRange, importSummary, toDraftRows, toImportPayload,
} from '../../utils/academicCalendar'
import type { CalendarDraftRow } from '../../utils/academicCalendar'

const SEMESTER_TABS = [
  { value: '', label: 'ทั้งหมด' },
  { value: '1', label: CALENDAR_SEMESTER_LABELS['1'] },
  { value: '2', label: CALENDAR_SEMESTER_LABELS['2'] },
  { value: 'S', label: CALENDAR_SEMESTER_LABELS.S },
]

const CELL_INPUT: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px', borderRadius: 6,
  border: '1.5px solid var(--line)', fontSize: 13, color: 'var(--ink-800)',
  background: '#fff', boxSizing: 'border-box', outline: 'none',
}

// Keys invalidated after an import: semester holidays shown to staff, and
// the plans/makeup lists that holidays change.
const AFFECTED_QUERIES = ['semester-cal-dates', 'staff-calendar-dates', 'calendar-dates',
  'monthly-plan', 'case-makeup-days', 'instructor-makeup-days']

function errorText(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const detail = err.response?.data?.error
  if (typeof detail === 'string' && detail) return detail
  // No message from the API: say which part of the setup failed instead of
  // a bare "try again" that never succeeds.
  switch (err.response?.status) {
    case undefined:
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า backend ทำงานอยู่'
    case 404:
      return 'เซิร์ฟเวอร์ยังไม่รองรับการนำเข้าปฏิทิน (backend เป็นเวอร์ชันเก่า) กรุณา build backend ใหม่'
    case 502:
    case 503:
    case 504:
      return 'บริการอ่านเอกสาร (OCR) ไม่ตอบสนองหรือใช้เวลานานเกินไป กรุณาตรวจสอบว่า ocr-service ทำงานอยู่ แล้วลองใหม่'
    case 413:
      return 'ไฟล์ใหญ่เกินกำหนด (สูงสุด 10 MB)'
  }
  return `${fallback} (HTTP ${err.response?.status})`
}

export default function AdminCalendar() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [academicYear, setAcademicYear] = useState(String(currentAcademicYear()))
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CalendarPreviewResponse | null>(null)
  const [rows, setRows] = useState<CalendarDraftRow[]>([])
  const [semesterFilter, setSemesterFilter] = useState('')

  const previewMut = useMutation({
    mutationFn: () => adminApi.previewCalendarImport(file!, Number(academicYear)),
    onSuccess: (res) => {
      setPreview(res)
      setRows(toDraftRows(res.entries))
      setSemesterFilter('')
    },
    onError: (err) => showToast(errorText(err, 'อ่านไฟล์ปฏิทินไม่สำเร็จ กรุณาลองใหม่'), 'error'),
  })

  const importMut = useMutation({
    mutationFn: () => adminApi.importCalendar(preview!.academic_year, toImportPayload(rows)),
    onSuccess: (res) => {
      for (const key of AFFECTED_QUERIES) qc.invalidateQueries({ queryKey: [key] })
      const skipped = res.skipped > 0 ? ` (ข้าม ${res.skipped} วันที่มีอยู่แล้ว)` : ''
      showToast(`บันทึกวันหยุด ${res.created} วัน${skipped} — ดูได้ที่หน้ากำหนดวันหยุดปฏิบัติงาน`, 'success')
      if (res.warning) showToast(res.warning, 'error')
      setPreview(null)
      setRows([])
      setFile(null)
    },
    onError: (err) => showToast(errorText(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่'), 'error'),
  })

  const update = (index: number, patch: Partial<CalendarDraftRow>) =>
    setRows((old) => old.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const visible = useMemo(() => rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !semesterFilter || row.semester === semesterFilter),
  [rows, semesterFilter])

  const summary = importSummary(rows)
  const yearMismatch = preview?.detected_academic_year && preview.detected_academic_year !== preview.academic_year

  const setAllVisible = (selected: boolean) => {
    const indexes = new Set(visible.filter(({ row }) => !row.exists).map(({ index }) => index))
    setRows((old) => old.map((r, i) => (indexes.has(i) ? { ...r, selected } : r)))
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>ปฏิทินการศึกษา</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>
          นำเข้าไฟล์ PDF ปฏิทินการศึกษาของทั้งปีการศึกษา ระบบจะกรองเฉพาะวันหยุด (วันหยุดราชการ / วันหยุดมหาวิทยาลัย)
          ของทุกภาคการศึกษาให้ตรวจทานก่อนบันทึก — วันหยุดที่บันทึกจะแสดงในหน้า{' '}
          <Link to="/staff/settings" style={{ color: 'var(--primary)', fontWeight: 600 }}>กำหนดวันหยุดปฏิบัติงาน</Link>
          {' '}ของเจ้าหน้าที่ และยกเลิกวันทำงานของ Lab Boy ที่ตรงกับวันหยุดอัตโนมัติ
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (file) previewMut.mutate() }}
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(140px, 1fr) auto', gap: 14, alignItems: 'end',
          background: '#fff', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}
      >
        <Input
          label="ไฟล์ปฏิทินการศึกษา (.pdf) *" type="file" accept=".pdf,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <Input
          label="ปีการศึกษา (พ.ศ.) *" type="number" min={2500} max={2700}
          value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}
          required
        />
        <Button type="submit" loading={previewMut.isPending} disabled={!file || !academicYear}>
          {previewMut.isPending ? 'กำลังอ่านไฟล์...' : 'อ่านไฟล์'}
        </Button>
      </form>

      {previewMut.isPending && (
        <Notice tone="blue">
          กำลังอ่านไฟล์… ถ้าเป็น PDF ที่สแกนเป็นภาพ ระบบต้องใช้ OCR อ่านทีละหน้า อาจใช้เวลา 2–6 นาที กรุณาอย่าปิดหน้านี้
        </Notice>
      )}

      {!preview && !previewMut.isPending && (
        <EmptyState
          title="ยังไม่ได้เลือกไฟล์"
          description="เลือกไฟล์ PDF ปฏิทินการศึกษาจากสำนักทะเบียน แล้วกด “อ่านไฟล์” เพื่อตรวจทานรายการก่อนบันทึก"
        />
      )}

      {preview && (
        <>
          {yearMismatch && (
            <Notice tone="amber">
              ไฟล์นี้ระบุ “ปีการศึกษา {preview.detected_academic_year}” แต่เลือกนำเข้าเป็นปี {preview.academic_year} —
              ตรวจสอบปีการศึกษาให้ถูกต้องก่อนบันทึก
            </Notice>
          )}
          {preview.used_ocr && (
            <Notice tone="blue">
              ไฟล์นี้เป็นภาพสแกน ระบบอ่านด้วย OCR ซึ่งอาจอ่านวันที่หรือชื่อผิดได้ กรุณาตรวจทานทุกรายการ
            </Notice>
          )}
          {preview.entries.length === 0 && (
            <Notice tone="amber">
              ไม่พบวันหยุดในไฟล์นี้ — ตรวจสอบว่าเป็นไฟล์ปฏิทินการศึกษา หรือเพิ่มวันหยุดเองที่หน้า “กำหนดวันหยุดปฏิบัติงาน”
            </Notice>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {SEMESTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSemesterFilter(tab.value)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  border: '1.5px solid var(--line)', cursor: 'pointer',
                  background: semesterFilter === tab.value ? 'var(--primary)' : '#fff',
                  color: semesterFilter === tab.value ? '#fff' : 'var(--ink-700)',
                }}
              >
                {tab.label}
              </button>
            ))}
            <Button type="button" size="sm" variant="outline" style={{ marginLeft: 'auto' }} onClick={() => setAllVisible(true)}>เลือกทั้งหมด</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAllVisible(false)}>ไม่เลือกเลย</Button>
          </div>

          <div style={{ overflow: 'auto', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
                  {['', 'วันที่', 'รายการ', 'ภาค', 'ประเภท', 'ยกเลิกวันทำงาน'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={6}><EmptyState title="ไม่มีรายการในตัวกรองนี้" /></td></tr>
                )}
                {visible.map(({ row, index }) => {
                  const days = entryDays(row.start_date, row.end_date)
                  return (
                    <tr key={index} style={{ borderTop: '1px solid var(--line-soft)', opacity: row.exists ? 0.6 : 1 }}>
                      <td style={{ padding: '8px 12px', width: 36 }}>
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${row.name}`}
                          checked={row.selected && !row.exists}
                          disabled={row.exists}
                          title={row.exists ? 'มีในระบบแล้ว' : undefined}
                          onChange={(e) => update(index, { selected: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-700)', whiteSpace: 'nowrap' }}>
                        {formatEntryRange(row.start_date, row.end_date)}
                        {days > 1 && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{days} วัน</div>}
                      </td>
                      <td style={{ padding: '8px 12px', minWidth: 260 }}>
                        <input
                          value={row.name}
                          maxLength={200}
                          aria-label="ชื่อรายการ"
                          onChange={(e) => update(index, { name: e.target.value })}
                          style={{ ...CELL_INPUT, borderColor: row.selected && !row.name.trim() ? 'var(--red)' : 'var(--line)' }}
                        />
                        {row.exists && <div style={{ marginTop: 4 }}><Badge variant="gray">มีในระบบแล้ว</Badge></div>}
                        {!row.exists && !row.include && (
                          <div style={{ marginTop: 4 }}>
                            <Badge variant="amber">วันสำคัญ — ไฟล์ไม่ได้ระบุว่าหยุด ตรวจสอบก่อนเลือก</Badge>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', width: 130 }}>
                        <select
                          value={row.semester}
                          aria-label="ภาคการศึกษา"
                          onChange={(e) => update(index, { semester: e.target.value })}
                          style={CELL_INPUT}
                        >
                          {Object.entries(CALENDAR_SEMESTER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', width: 190 }}>
                        <select
                          value={row.date_type}
                          aria-label="ประเภท"
                          onChange={(e) => update(index, { date_type: e.target.value as CalendarImportType })}
                          style={CELL_INPUT}
                        >
                          {Object.entries(CALENDAR_IMPORT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', width: 110, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label="ยกเลิกวันทำงานที่ตรงกับวันนี้"
                          checked={row.affects_work}
                          onChange={(e) => update(index, { affects_work: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{
            position: 'sticky', bottom: 0, marginTop: 16, padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: '#fff', border: '1.5px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow-md)',
          }}>
            <span style={{ fontSize: 14, color: 'var(--ink-700)' }}>
              เลือก <b>{summary.entries}</b> รายการ ({summary.days} วัน) — ปีการศึกษา {preview.academic_year}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => { setPreview(null); setRows([]) }}>ยกเลิก</Button>
              <Button type="button" loading={importMut.isPending} disabled={summary.entries === 0} onClick={() => importMut.mutate()}>
                บันทึกลงปฏิทิน
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Notice({ tone, children }: { tone: 'amber' | 'blue'; children: React.ReactNode }) {
  const color = tone === 'amber' ? 'var(--amber, #D97706)' : 'var(--primary)'
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500,
      border: `1.5px solid ${color}`, color, background: tone === 'amber' ? 'var(--amber-bg, #FFFBEB)' : 'var(--primary-50)',
    }}>
      {children}
    </div>
  )
}
