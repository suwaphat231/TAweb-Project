import { useState } from 'react'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { HolidayOverview } from '../../components/admin/HolidayOverview'
import { CalendarReview } from '../../components/admin/CalendarReview'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { CALENDAR_JOB_KEY, useCalendarJob } from '../../hooks/useCalendarJob'
import { formatThaiDate } from '../../utils/thaiDate'
import type { CalendarJob, CalendarPreviewResponse } from '../../types'
import {
  CALENDAR_SEMESTER_LABELS, filledTerms, termIssue, toDraftRows, toImportPayload, toTermDrafts, toTermPayload, toEventDrafts, toEventPayload,
  type EventDraft,
} from '../../utils/academicCalendar'
import type { CalendarDraftRow, TermDraft } from '../../utils/academicCalendar'

// Keys invalidated after an import: semester holidays shown to staff, and
// the plans that holidays change.
const AFFECTED_QUERIES = ['academic-terms', 'admin-year-holidays', 'semester-cal-dates', 'staff-calendar-dates', 'calendar-dates',
  'monthly-plan']

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
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CalendarPreviewResponse | null>(null)
  const [rows, setRows] = useState<CalendarDraftRow[]>([])
  const [terms, setTerms] = useState<TermDraft[]>([])
  const [events, setEvents] = useState<EventDraft[]>([])

  // The file is read in the background (minutes for a scanned PDF); the job
  // lives on the server, so leaving this page doesn't lose it.
  const { data: job } = useCalendarJob()
  const processing = job?.status === 'processing'

  const previewMut = useMutation({
    mutationFn: () => adminApi.previewCalendarImport(file!),
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

  // Rows are read-only; only which of them get saved can change.
  const selectRows = (indexes: number[], selected: boolean) => {
    const set = new Set(indexes)
    setRows((old) => old.map((r, i) => (set.has(i) ? { ...r, selected } : r)))
  }
  const selectEvents = (indexes: number[], include: boolean) => {
    const set = new Set(indexes)
    setEvents((old) => old.map((e, i) => (set.has(i) ? { ...e, include } : e)))
  }

  const termCount = filledTerms(terms).length
  const termProblem = terms.some((t) => termIssue(t))
  const updateTerm = (semester: string, patch: Partial<TermDraft>) =>
    setTerms((old) => old.map((t) => (t.semester === semester ? { ...t, ...patch } : t)))
  const yearMismatch = preview?.detected_academic_year && preview.detected_academic_year !== preview.academic_year

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (file) previewMut.mutate() }}
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'end',
          background: '#fff', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}
      >
        <Input
          label="ไฟล์ปฏิทินการศึกษา (.pdf) *" type="file" accept=".pdf,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <Button type="submit" loading={previewMut.isPending} disabled={!file || processing || !!preview}>
          {previewMut.isPending ? 'กำลังส่งไฟล์...' : 'อ่านไฟล์'}
        </Button>
      </form>

      {processing && (
        <Notice tone="blue">
          กำลังอ่านไฟล์{job?.meta ? ` “${job.meta.file_name}”` : ''} อยู่เบื้องหลัง —
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
              ไฟล์นี้เป็นภาพสแกน ระบบอ่านด้วย OCR ซึ่งอาจอ่านวันที่หรือชื่อผิดได้ กรุณาตรวจทานทุกรายการ — รายการที่อ่านผิดให้เอาเครื่องหมายเลือกออก
            </Notice>
          )}
          {preview.entries.length === 0 && termCount === 0 && events.length === 0 && (
            <Notice tone="amber">
              ไม่พบวันหยุดในไฟล์นี้ — ตรวจสอบว่าเป็นไฟล์ปฏิทินการศึกษา
            </Notice>
          )}

          <TermSection terms={terms} onChange={updateTerm} />
          <CalendarReview
            key={loadedJob ?? ''}
            academicYear={preview.academic_year}
            rows={rows}
            events={events}
            savedEvents={preview.saved_events}
            termCount={termCount}
            termProblem={termProblem}
            saving={importMut.isPending}
            onSelectRows={selectRows}
            onSelectEvents={selectEvents}
            onDiscard={discard}
            onSave={() => importMut.mutate()}
          />
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
        description="ดูวันหยุดทั้งหมดของปี และจัดการการนำเข้า — วันหยุดจะแสดงในหน้ากำหนดวันหยุดปฏิบัติงานของเจ้าหน้าที่ และยกเลิกวันทำงานของ Lab Boy ที่ตรงกับวันหยุดอัตโนมัติ"
      />
      <div className="cal-tabs" role="tablist" aria-label="ปฏิทินการศึกษา">
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>ภาพรวมวันหยุด</button>
        <button type="button" role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>นำเข้าจากไฟล์ PDF</button>
      </div>
      {tab === 'overview' ? <HolidayOverview /> : <ImportTab />}
    </div>
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
