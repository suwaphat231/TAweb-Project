import { useMemo, useState } from 'react'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { HolidayOverview } from '../../components/admin/HolidayOverview'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { CALENDAR_JOB_KEY, useCalendarJob } from '../../hooks/useCalendarJob'
import { formatThaiDate } from '../../utils/thaiDate'
import type { CalendarImportType, CalendarJob, CalendarPreviewResponse } from '../../types'
import {
  CALENDAR_IMPORT_TYPE_LABELS, CALENDAR_SEMESTER_LABELS, currentAcademicYear, entryDays,
  filledTerms, formatEntryRange, importSummary, termIssue, toDraftRows, toImportPayload, toTermDrafts, toTermPayload, toEventDrafts, toEventPayload, EVENT_CATEGORY_LABEL, type EventDraft,
} from '../../utils/academicCalendar'
import type { CalendarDraftRow, TermDraft } from '../../utils/academicCalendar'

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
const AFFECTED_QUERIES = ['academic-terms', 'admin-year-holidays', 'semester-cal-dates', 'staff-calendar-dates', 'calendar-dates',
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

function ImportTab() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [academicYear, setAcademicYear] = useState(String(currentAcademicYear()))
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CalendarPreviewResponse | null>(null)
  const [rows, setRows] = useState<CalendarDraftRow[]>([])
  const [terms, setTerms] = useState<TermDraft[]>([])
  const [events, setEvents] = useState<EventDraft[]>([])
  const [semesterFilter, setSemesterFilter] = useState('')

  // The file is read in the background (minutes for a scanned PDF); the job
  // lives on the server, so leaving this page doesn't lose it.
  const { data: job } = useCalendarJob()
  const processing = job?.status === 'processing'

  const previewMut = useMutation({
    mutationFn: () => adminApi.previewCalendarImport(file!, Number(academicYear)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CALENDAR_JOB_KEY })
      setFile(null)
      showToast('เริ่มอ่านไฟล์แล้ว — ไปหน้าอื่นได้ ระบบจะแจ้งเตือนเมื่ออ่านเสร็จ', 'info')
    },
    onError: (err) => showToast(errorText(err, 'อ่านไฟล์ปฏิทินไม่สำเร็จ กรุณาลองใหม่'), 'error'),
  })

  // Forget a finished job (saved, cancelled or failed). The cache is emptied
  // first so the finished result is not loaded again while the server catches up.
  const clearJob = useMutation({
    mutationFn: adminApi.clearCalendarJob,
    onMutate: () => { qc.setQueryData<CalendarJob | null>(CALENDAR_JOB_KEY, null) },
    onSettled: () => qc.invalidateQueries({ queryKey: CALENDAR_JOB_KEY }),
  })

  // Load a finished job's result for review when one is waiting. Each job is
  // loaded once (keyed by its start time), so discarding it is not undone by a
  // refetch that still returns the old result. Adjusting state while rendering
  // is React's pattern for deriving state from a changed value.
  const [loadedJob, setLoadedJob] = useState<string | null>(null)
  if (job?.status === 'done' && job.result && loadedJob !== job.started_at) {
    setLoadedJob(job.started_at)
    setPreview(job.result)
    setRows(toDraftRows(job.result.entries))
    setTerms(toTermDrafts(job.result.terms))
    setEvents(toEventDrafts(job.result.activities))
    setSemesterFilter('')
  }

  const discard = () => {
    setPreview(null)
    setRows([])
    setTerms([])
    setEvents([])
    clearJob.mutate()
  }

  const importMut = useMutation({
    mutationFn: () => adminApi.importCalendar(preview!.academic_year, toImportPayload(rows), toTermPayload(terms), toEventPayload(events)),
    onSuccess: (res) => {
      for (const key of AFFECTED_QUERIES) qc.invalidateQueries({ queryKey: [key] })
      const skipped = res.skipped > 0 ? ` (ข้าม ${res.skipped} วันที่มีอยู่แล้ว)` : ''
      const parts = []
      if (res.created > 0 || res.skipped > 0) parts.push(`วันหยุด ${res.created} วัน${skipped}`)
      if (res.terms_saved > 0) parts.push(`วันเปิด-ปิดภาคเรียน ${res.terms_saved} ภาค`)
      if (res.events_saved > 0) parts.push(`กิจกรรมวิชาการ ${res.events_saved} รายการ`)
      showToast(`บันทึก${parts.join(' และ ')} เรียบร้อย`, 'success')
      if (res.warning) showToast(res.warning, 'error')
      discard()
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
  const termCount = filledTerms(terms).length
  const eventCount = events.filter((e) => e.include).length
  const updateEvent = (index: number, patch: Partial<EventDraft['activity']> & { include?: boolean }) =>
    setEvents((old) => old.map((e, i) => {
      if (i !== index) return e
      const { include, ...rest } = patch
      return { activity: { ...e.activity, ...rest }, include: include ?? e.include }
    }))
  const termProblem = terms.some((t) => termIssue(t))
  const updateTerm = (semester: string, patch: Partial<TermDraft>) =>
    setTerms((old) => old.map((t) => (t.semester === semester ? { ...t, ...patch } : t)))
  const yearMismatch = preview?.detected_academic_year && preview.detected_academic_year !== preview.academic_year

  const setAllVisible = (selected: boolean) => {
    const indexes = new Set(visible.filter(({ row }) => !row.exists).map(({ index }) => index))
    setRows((old) => old.map((r, i) => (indexes.has(i) ? { ...r, selected } : r)))
  }

  return (
    <div>
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
        <Button type="submit" loading={previewMut.isPending} disabled={!file || !academicYear || processing || !!preview}>
          {previewMut.isPending ? 'กำลังส่งไฟล์...' : 'อ่านไฟล์'}
        </Button>
      </form>

      {processing && (
        <Notice tone="blue">
          กำลังอ่านไฟล์{job?.meta ? ` “${job.meta.file_name}” (ปีการศึกษา ${job.meta.academic_year})` : ''} อยู่เบื้องหลัง —
          ถ้าเป็น PDF ที่สแกนเป็นภาพ ระบบต้องใช้ OCR อ่านทีละหน้า อาจใช้เวลา 2–6 นาที ไปทำหน้าอื่นได้ ระบบจะแจ้งเตือนเมื่ออ่านเสร็จ
        </Notice>
      )}
      {job?.status === 'failed' && (
        <Notice tone="amber">
          <span>อ่านไฟล์{job.meta ? ` “${job.meta.file_name}”` : ''}ไม่สำเร็จ: {job.error ?? 'กรุณาลองใหม่'}</span>
          <Button type="button" size="sm" variant="ghost" style={{ marginLeft: 12 }} onClick={() => clearJob.mutate()}>ปิด</Button>
        </Notice>
      )}

      {!preview && !processing && job?.status !== 'failed' && (
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
          {preview.entries.length === 0 && termCount === 0 && events.length === 0 && (
            <Notice tone="amber">
              ไม่พบวันหยุดในไฟล์นี้ — ตรวจสอบว่าเป็นไฟล์ปฏิทินการศึกษา หรือเพิ่มวันหยุดเองที่หน้า “กำหนดวันหยุดปฏิบัติงาน”
            </Notice>
          )}

          <TermSection terms={terms} onChange={updateTerm} />
          <EventSection events={events} saved={preview.saved_events} onChange={updateEvent} />

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

          <div className="data-table-wrap" role="region" aria-label="รายการวันหยุดที่อ่านได้จากปฏิทิน" tabIndex={0}>
            <table className="data-table" style={{ minWidth: 880 }}>
              <thead>
                <tr>
                  {['', 'วันที่', 'รายการ', 'ภาค', 'ประเภท', 'ยกเลิกวันทำงาน'].map((h, i) => (
                    <th key={i} scope="col">{h || <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>เลือก</span>}</th>
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
                    <tr key={index} style={{ opacity: row.exists ? 0.6 : 1 }}>
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
              วันหยุด <b>{summary.entries}</b> รายการ ({summary.days} วัน) · วันเปิด-ปิดภาคเรียน <b>{termCount}</b> ภาค · กิจกรรมวิชาการ <b>{eventCount}</b> รายการ — ปีการศึกษา {preview.academic_year}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={discard}>ยกเลิก</Button>
              <Button type="button" loading={importMut.isPending} disabled={(summary.entries === 0 && termCount === 0 && eventCount === 0) || termProblem} onClick={() => importMut.mutate()}>
                บันทึกลงปฏิทิน
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function AdminCalendar() {
  const [tab, setTab] = useState<'overview' | 'import'>('overview')
  return (
    <div>
      <AdminPageHeader
        title="ปฏิทินการศึกษา"
        description={<>
          ดูวันหยุดทั้งหมดของปี และจัดการการนำเข้า — วันหยุดแสดงในหน้า{' '}
          <Link to="/staff/settings" style={{ color: 'var(--primary)', fontWeight: 600 }}>กำหนดวันหยุดปฏิบัติงาน</Link>
          {' '}ของเจ้าหน้าที่ และยกเลิกวันทำงานของ Lab Boy ที่ตรงกับวันหยุดอัตโนมัติ
        </>}
      />
      <div className="cal-tabs" role="tablist" aria-label="ปฏิทินการศึกษา">
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>ภาพรวมวันหยุด</button>
        <button type="button" role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>นำเข้าจากไฟล์ PDF</button>
      </div>
      {tab === 'overview' ? <HolidayOverview /> : <ImportTab />}
    </div>
  )
}

const EVENT_CATEGORIES = Object.keys(EVENT_CATEGORY_LABEL) as (keyof typeof EVENT_CATEGORY_LABEL)[]

/** Other activities of the calendar (registration, exams, deadlines): pick which go on the admin calendar. */
function EventSection({ events, saved, onChange }: {
  events: EventDraft[]; saved: number
  onChange: (index: number, patch: Partial<EventDraft['activity']> & { include?: boolean }) => void
}) {
  if (events.length === 0) return null
  return (
    <section aria-label="กิจกรรมวิชาการ" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>กิจกรรมวิชาการ ({events.length} รายการ)</h3>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 8px' }}>
        ลงทะเบียน สอบ กำหนดส่ง ฯลฯ — แสดงบนปฏิทินภาพรวมของแอดมินเท่านั้น ไม่กระทบตารางงานเจ้าหน้าที่
        {saved > 0 && ` · มีกิจกรรมที่บันทึกไว้แล้ว ${saved} รายการ การบันทึกครั้งนี้จะแทนที่ของปีนี้ทั้งหมด`}
      </p>
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
        {events.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={e.include} aria-label={`เลือก ${e.activity.name}`} onChange={(ev) => onChange(i, { include: ev.target.checked })} />
            <span style={{ fontSize: 13, color: 'var(--ink-500)', minWidth: 150 }}>
              {formatEntryRange(e.activity.start_date, e.activity.end_date)} · ภาค {e.activity.semester}
            </span>
            <input value={e.activity.name} maxLength={200} aria-label="ชื่อกิจกรรม" onChange={(ev) => onChange(i, { name: ev.target.value })}
              style={{ flex: 1, minWidth: 200, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6 }} />
            <select value={e.activity.category} aria-label="ประเภท" onChange={(ev) => onChange(i, { category: ev.target.value as EventDraft['activity']['category'] })}
              style={{ padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }}>
              {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{EVENT_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}

function TermSection({ terms, onChange }: { terms: TermDraft[]; onChange: (semester: string, patch: Partial<TermDraft>) => void }) {
  return (
    <section aria-label="วันเปิด-ปิดภาคเรียน" style={{
      background: '#fff', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>วันเปิด-ปิดภาคเรียน</h2>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 14px' }}>
        อ่านจากแถว “วันเปิดภาคการศึกษา / ปิดภาคการศึกษา” ในตารางปฏิทิน ตรวจทานให้ตรงกับไฟล์ก่อนบันทึก
        — ถ้าช่องไหนว่าง แปลว่าไม่พบในไฟล์ กรอกเองได้ (ปล่อยว่างทั้งภาคถ้าไม่ต้องการบันทึก)
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {terms.map((t) => {
          const issue = termIssue(t)
          const saved = t.saved_open_date || t.saved_close_date
          return (
            <div key={t.semester} style={{ display: 'grid', gridTemplateColumns: '120px repeat(2, minmax(150px, 1fr))', gap: 12, alignItems: 'start' }}>
              <div style={{ paddingTop: 30, fontWeight: 700, color: 'var(--ink-900)', fontSize: 14 }}>{CALENDAR_SEMESTER_LABELS[t.semester]}</div>
              <div>
                <Input label="วันเปิดภาคเรียน" type="date" value={t.open_date} onChange={(e) => onChange(t.semester, { open_date: e.target.value })} />
                <TermHint found={!!t.open_name && !!t.open_date} name={t.open_name} page={t.page} />
              </div>
              <div>
                <Input label="วันปิดภาคเรียน" type="date" value={t.close_date} min={t.open_date || undefined}
                  onChange={(e) => onChange(t.semester, { close_date: e.target.value })} />
                <TermHint found={!!t.close_name && !!t.close_date} name={t.close_name} page={t.page} />
              </div>
              {(issue || saved) && (
                <div style={{ gridColumn: '2 / -1', fontSize: 12.5, color: issue ? 'var(--red)' : 'var(--ink-500)' }} role={issue ? 'alert' : undefined}>
                  {issue || `ในระบบตอนนี้: ${t.saved_open_date ? formatThaiDate(t.saved_open_date) : '-'} ถึง ${t.saved_close_date ? formatThaiDate(t.saved_close_date) : '-'} (จะถูกแทนที่เมื่อบันทึก)`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TermHint({ found, name, page }: { found: boolean; name?: string; page?: number }) {
  return (
    <div style={{ fontSize: 12, marginTop: 4, color: found ? 'var(--ink-500)' : 'var(--amber, #D97706)' }}>
      {found ? `อ่านจากแถว “${name}”${page ? ` (หน้า ${page})` : ''}` : 'ไม่พบในไฟล์ — กรอกเอง'}
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
