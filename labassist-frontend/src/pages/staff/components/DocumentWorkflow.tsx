import { useState, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import type {
  DocumentWorkflowItem, DocStepStatus, StaffCaseResponse, GroupMonthPlan, StaffDocument,
  WorkflowStepView, CreateWorkflowStepPayload, DocType,
} from '../../../types'
import { getApiErrorMessage, staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { triggerBrowserDownload } from '../../../utils/download'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Button } from '../../../components/ui/Button'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { WorkScheduleModal } from './WorkScheduleModal'

const STEP_STATUS_CONFIG: Record<DocStepStatus, { label: string; color: string; bg: string }> = {
  not_reached:         { label: 'ยังไม่ถึงขั้นตอน', color: 'var(--ink-400)',  bg: 'var(--line-soft)' },
  waiting:             { label: 'รอสร้าง',           color: 'var(--amber)',   bg: 'var(--amber-bg)' },
  created:             { label: 'ร่างเอกสาร',        color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  in_review:           { label: 'รอตรวจสอบ',         color: 'var(--primary)', bg: 'var(--primary-50)' },
  approved:            { label: 'อนุมัติแล้ว',       color: 'var(--primary)', bg: 'var(--primary-50)' },
  awaiting_signature:  { label: 'รอลงนาม',           color: 'var(--amber)',   bg: 'var(--amber-bg)' },
  signed:              { label: 'ลงนามแล้ว',         color: 'var(--green)',   bg: 'var(--green-bg)' },
  completed:           { label: 'ดำเนินการเสร็จสิ้น', color: 'var(--green)',   bg: 'var(--green-bg)' },
}

const DOC_STATUS_LABEL: Record<string, string> = {
  draft: 'ร่างเอกสาร', pending: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', generated: 'สร้างแล้ว',
  awaiting_signature: 'รอลงนาม', signed: 'ลงนามแล้ว', cancelled: 'ยกเลิกแล้ว', superseded: 'มีฉบับใหม่แทน',
}

const MONTHLY_LABEL: Partial<Record<DocType, string>> = {
  work_report: 'รายงานผลการปฏิบัติงานนอกเวลาราชการ',
  payment_evidence: 'หลักฐานการจ่ายเงิน',
  payment_request: 'บันทึกขออนุมัติเบิกจ่ายเงิน',
}

function stepStatus(view: WorkflowStepView): DocStepStatus {
  const doc = view.document
  if (!doc) return view.can_create ? 'waiting' : 'not_reached'
  switch (doc.status) {
    case 'signed':             return 'signed'
    case 'awaiting_signature': return 'awaiting_signature'
    case 'approved':           return 'approved'
    case 'pending':            return 'in_review'
    default:                   return 'created'
  }
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
}

interface Props {
  courseId: number
  onDocumentCreated: () => void
  staffCase?: StaffCaseResponse
  courseCode?: string
  courseTitle?: string
  sectionNo?: number
  semester?: string
  academicYear?: number
  labBoyCount?: number
  courseSchedule?: string
  courseRef?: string
}

type CreateTarget = { view: WorkflowStepView; replace: boolean }

// DocumentWorkflow shows one course offering's documents in order. The
// steps, what blocks each one and whether an existing document is out of
// date all come from the server, which enforces the same rules on create.
export function DocumentWorkflow({
  courseId, onDocumentCreated,
  staffCase, courseCode, courseTitle, sectionNo,
  semester, academicYear, labBoyCount, courseSchedule, courseRef = '',
}: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [previewStep, setPreviewStep] = useState<DocumentWorkflowItem | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showWorkDates, setShowWorkDates] = useState(false)
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [form, setForm] = useState<CreateWorkflowStepPayload>({})
  const [openHistory, setOpenHistory] = useState<number | null>(null)

  const planLocked = staffCase?.status === 'plan_locked' || staffCase?.status === 'done'

  const { data: workflow, isLoading, isError, refetch } = useQuery({
    queryKey: ['document-workflow', courseId],
    queryFn: () => staffApi.documentWorkflow(courseId),
    enabled: !!courseId,
  })

  const { data: monthlyPlan = [] } = useQuery<GroupMonthPlan[]>({
    queryKey: ['monthly-plan', staffCase?.id],
    queryFn: () => staffApi.getMonthlyPlan(staffCase!.id),
    enabled: !!staffCase?.id,
  })

  const workDates = useMemo(() => {
    const all: Array<{ date: string; startTime: string; endTime: string; status: string }> = []
    for (const gp of monthlyPlan) {
      for (const entry of gp.months) {
        for (const occ of entry.occurrences) {
          all.push({ date: occ.scheduled_date.slice(0, 10), startTime: occ.start_time, endTime: occ.end_time, status: occ.status })
        }
      }
    }
    return all.sort((a, b) => a.date.localeCompare(b.date))
  }, [monthlyPlan])

  function refresh() {
    qc.invalidateQueries({ queryKey: ['document-workflow', courseId] })
    qc.invalidateQueries({ queryKey: ['staff-documents'] })
    onDocumentCreated()
  }

  const createMut = useMutation({
    mutationFn: ({ type, body }: { type: DocType; body: CreateWorkflowStepPayload }) =>
      staffApi.createWorkflowStep(courseId, type, body),
    onSuccess: (doc) => {
      showToast(`สร้าง "${doc.name}" แล้ว${doc.version && doc.version > 1 ? ` (ฉบับที่ ${doc.version})` : ''}`, 'success')
      setCreateTarget(null)
      setForm({})
      refresh()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'สร้างเอกสารไม่สำเร็จ'), 'error'),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => staffApi.updateDocumentStatus(id, status),
    onSuccess: (_d, v) => {
      showToast(v.status === 'signed' ? 'บันทึกลงนามแล้ว' : 'ส่งรอลงนามเรียบร้อย', 'success')
      refresh()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'เกิดข้อผิดพลาด กรุณาลองใหม่'), 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => staffApi.deleteDocument(id, reason),
    onSuccess: () => { showToast('ยกเลิกเอกสารแล้ว (ยังเก็บไว้ในประวัติ)', 'success'); refresh() },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ยกเลิกเอกสารไม่สำเร็จ'), 'error'),
  })

  async function download(doc: StaffDocument) {
    setDownloadingId(doc.id)
    try {
      const blob = await staffApi.downloadDocument(doc.id)
      triggerBrowserDownload(blob, `${doc.name}.docx`)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 501) showToast('เอกสารประเภทนี้ยังไม่มี template สำหรับสร้างไฟล์', 'info')
      else showToast(await getApiErrorMessage(err, 'ดาวน์โหลดไม่สำเร็จ'), 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  function openCreate(view: WorkflowStepView, replace: boolean) {
    // The memo header fields default to the step's current document, so a
    // new version only needs what changed.
    const d = view.document
    setForm({ ref_number: d?.ref_number ?? '', dept_head_name: d?.dept_head_name ?? '', staff_officer_name: d?.staff_officer_name ?? '' })
    setCreateTarget({ view, replace })
  }

  function submitCreate() {
    if (!createTarget) return
    const body: CreateWorkflowStepPayload = { ...form, replace: createTarget.replace }
    if (createTarget.replace && !body.reason?.trim()) return
    createMut.mutate({ type: createTarget.view.type, body })
  }

  if (isLoading) return <div style={{ height: 160, background: 'var(--line-soft)', borderRadius: 8 }} />
  if (isError || !workflow) {
    return (
      <div style={{ fontSize: 13, color: 'var(--red)' }}>
        โหลด workflow เอกสารไม่สำเร็จ <button onClick={() => refetch()} style={actionBtn('transparent', 'var(--primary)', '1px solid var(--line)')}>ลองใหม่</button>
      </div>
    )
  }

  const views = workflow.steps
  const isMemo = createTarget?.view.type === 'approval_memo'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {views.map((view, idx) => {
        const status = stepStatus(view)
        const cfg = STEP_STATUS_CONFIG[status]
        const isLast = idx === views.length - 1
        const doc = view.document
        const isHiringNotice = view.type === 'hiring_notice'
        const done = status === 'signed' || status === 'completed'
        const item: DocumentWorkflowItem = {
          step: view.step, label: view.label, docType: view.type, status,
          documentId: doc?.id, documentName: doc?.name, createdAt: doc?.created_at,
        }

        return (
          <div key={view.step} style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {!isLast && (
              <div style={{ position: 'absolute', left: 23, top: 46, width: 2, height: 'calc(100% - 24px)', background: done ? 'var(--green)' : 'var(--line)' }} />
            )}
            <div style={{ width: 46, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: status === 'not_reached' ? 'var(--line-soft)' : done ? 'var(--green)'
                  : status === 'waiting' || status === 'awaiting_signature' ? 'var(--amber)' : 'var(--primary)',
                color: status === 'not_reached' ? 'var(--ink-400)' : '#fff',
                border: `2px solid ${status === 'not_reached' ? 'var(--line)' : 'transparent'}`,
              }}>
                {done ? <CheckIcon /> : view.step}
              </div>
            </div>

            <div style={{ flex: 1, padding: '14px 16px 20px 12px', borderBottom: isLast ? 'none' : '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.4 }}>{view.label}</div>
                  {doc && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3 }}>
                      {doc.name}{doc.version && doc.version > 1 ? ` · ฉบับที่ ${doc.version}` : ''}
                      <span style={{ color: 'var(--ink-400)' }}> — สร้างเมื่อ {fmtDate(doc.created_at)}</span>
                      {doc.ref_number && <span style={{ color: 'var(--ink-400)' }}> · ที่ {doc.ref_number}</span>}
                    </div>
                  )}
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                  {cfg.label}
                </span>
              </div>

              {!doc && view.blocked_reasons.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.6 }}>
                  {view.blocked_reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {doc && view.stale_reasons.length > 0 && (
                <div role="note" style={{ marginTop: 8, padding: '8px 12px', background: 'var(--amber-bg)', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
                  <b>ข้อมูลต้นทางเปลี่ยนไปหลังสร้างเอกสารนี้</b> — เอกสารเดิมไม่ถูกแก้ไข หากต้องการให้ตรงกับข้อมูลปัจจุบันให้สร้างฉบับใหม่
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{view.stale_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
              {doc && !view.has_template && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>ยังไม่มี template .docx ของเอกสารนี้ — บันทึกข้อมูลและติดตามสถานะได้ แต่ยังดาวน์โหลดไฟล์ไม่ได้</div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {isHiringNotice && !planLocked && !doc && (
                  <button onClick={() => setShowScheduleModal(true)} style={actionBtn('var(--primary)', '#fff')}>กำหนดตารางปฏิบัติงาน</button>
                )}
                {isHiringNotice && planLocked && (
                  <button onClick={() => setShowScheduleModal(true)} style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}>ดูตารางปฏิบัติงาน</button>
                )}
                {isHiringNotice && workDates.length > 0 && (
                  <button onClick={() => setShowWorkDates((v) => !v)} style={actionBtn('transparent', 'var(--primary)', '1.5px solid var(--primary)')}>
                    {showWorkDates ? 'ซ่อนวันที่ปฏิบัติงาน' : `วันที่ปฏิบัติงาน (${workDates.filter((d) => d.status === 'scheduled' || d.status === 'completed').length} วัน)`}
                  </button>
                )}

                {!doc && (
                  <button
                    onClick={() => openCreate(view, false)}
                    disabled={!view.can_create || createMut.isPending}
                    title={!view.can_create ? view.blocked_reasons[0] : undefined}
                    style={view.can_create ? actionBtn('var(--accent)', '#fff') : disabledBtn}
                  >
                    สร้างเอกสาร
                  </button>
                )}
                {doc && (
                  <>
                    <button onClick={() => setPreviewStep(item)} style={actionBtn('transparent', 'var(--primary)', '1.5px solid var(--primary)')}>ดูรายละเอียด</button>
                    {view.has_template && (
                      <button onClick={() => download(doc)} disabled={downloadingId === doc.id} style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}>
                        {downloadingId === doc.id ? 'กำลังโหลด...' : 'ดาวน์โหลด DOCX'}
                      </button>
                    )}
                    {(doc.status === 'draft' || doc.status === 'generated' || doc.status === 'approved') && (
                      <button onClick={() => statusMut.mutate({ id: doc.id, status: 'awaiting_signature' })} disabled={statusMut.isPending} style={actionBtn('var(--amber)', '#fff')}>ส่งรอลงนาม</button>
                    )}
                    {doc.status === 'awaiting_signature' && (
                      <button onClick={() => statusMut.mutate({ id: doc.id, status: 'signed' })} disabled={statusMut.isPending} style={actionBtn('var(--green)', '#fff')}>บันทึกลงนามแล้ว</button>
                    )}
                    <button onClick={() => openCreate(view, true)} style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}>สร้างฉบับใหม่</button>
                    <button
                      onClick={() => {
                        const reason = window.prompt('เหตุผลที่ยกเลิกเอกสารนี้ (เอกสารจะยังเก็บไว้ในประวัติ)')
                        if (reason === null) return
                        cancelMut.mutate({ id: doc.id, reason: reason.trim() })
                      }}
                      disabled={cancelMut.isPending}
                      style={actionBtn('transparent', 'var(--red)', '1px solid var(--red)')}
                    >
                      ยกเลิกเอกสาร
                    </button>
                  </>
                )}
                {view.history.length > 0 && (
                  <button onClick={() => setOpenHistory(openHistory === view.step ? null : view.step)} style={actionBtn('transparent', 'var(--ink-500)', '1px dashed var(--line)')}>
                    ประวัติ {view.history.length} ฉบับ
                  </button>
                )}
              </div>

              {openHistory === view.step && (
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {view.history.slice().reverse().map((h) => (
                    <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-600)', background: 'var(--line-soft)', borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ fontWeight: 600 }}>ฉบับที่ {h.version ?? 1}</span>
                      <span>{DOC_STATUS_LABEL[h.status] ?? h.status}</span>
                      <span style={{ color: 'var(--ink-400)' }}>สร้างเมื่อ {fmtDate(h.created_at)}</span>
                      {view.has_template && h.status !== 'cancelled' && (
                        <button onClick={() => download(h)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>ดาวน์โหลด</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isHiringNotice && showWorkDates && workDates.length > 0 && <WorkDatesPanel dates={workDates} />}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, marginBottom: 10 }}>เอกสารรายเดือน (สร้างตามรอบเดือนที่ปฏิบัติงาน)</div>
        {workflow.monthly_documents.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>ยังไม่มีเอกสารรายเดือน</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {workflow.monthly_documents.map((d) => (
              <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{MONTHLY_LABEL[d.type] ?? d.type}</span>
                {d.period && <span style={{ color: 'var(--ink-500)' }}>{d.period.month}/{d.period.year}</span>}
                <span style={{ color: 'var(--ink-500)' }}>{DOC_STATUS_LABEL[d.status] ?? d.status}</span>
                <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>{fmtDate(d.created_at)}</span>
                <button onClick={() => download(d)} disabled={downloadingId === d.id} style={{ ...actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)'), marginLeft: 'auto' }}>ดาวน์โหลด</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DocumentPreviewModal step={previewStep} onClose={() => setPreviewStep(null)} />

      <Modal
        isOpen={!!createTarget}
        onClose={() => !createMut.isPending && setCreateTarget(null)}
        title={createTarget ? `${createTarget.replace ? 'สร้างฉบับใหม่' : 'สร้างเอกสาร'} — ขั้นตอนที่ ${createTarget.view.step}` : ''}
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setCreateTarget(null)} disabled={createMut.isPending}>ยกเลิก</Button>
          <Button onClick={submitCreate} loading={createMut.isPending} disabled={!!createTarget?.replace && !form.reason?.trim()}>
            {createTarget?.replace ? 'สร้างฉบับใหม่' : 'สร้างเอกสาร'}
          </Button>
        </>}
      >
        {createTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{createTarget.view.label}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6 }}>
              ระบบใช้ข้อมูลรายวิชา {courseCode} ตอน {sectionNo} ภาค {semester}/{academicYear}, รายชื่อ Lab Boy {workflow.course.labboy_count} คน
              และแผนปฏิบัติงานที่ยืนยันแล้วจากฐานข้อมูล แล้วบันทึกเป็นข้อมูลชุดคงที่ของเอกสารฉบับนี้
            </div>
            {createTarget.replace && (
              <>
                <div style={{ fontSize: 13, color: '#92400E', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>
                  ฉบับปัจจุบันจะถูกเก็บไว้เป็น "มีฉบับใหม่แทน" — ไม่ถูกลบ
                </div>
                <Textarea label="เหตุผลที่สร้างฉบับใหม่ *" rows={3} value={form.reason ?? ''} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              </>
            )}
            {isMemo && (
              <>
                <Input label="ที่ (เลขที่บันทึก)" placeholder="อว 8613.7/..." value={form.ref_number ?? ''} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, ref_number: e.target.value }))} />
                <Input label="ชื่อเจ้าหน้าที่ผู้จัดทำ" value={form.staff_officer_name ?? ''} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, staff_officer_name: e.target.value }))} />
                <Input label="ชื่อหัวหน้าภาควิชา" value={form.dept_head_name ?? ''} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, dept_head_name: e.target.value }))} />
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>ข้อมูลส่วนหัวบันทึกที่ไม่มีในฐานข้อมูล — เว้นว่างได้และกรอกภายหลังเมื่อมีเลขที่</span>
              </>
            )}
          </div>
        )}
      </Modal>

      {showScheduleModal && (
        <WorkScheduleModal
          caseId={staffCase?.id}
          courseId={courseId}
          courseCode={courseCode ?? courseRef}
          courseTitle={courseTitle ?? ''}
          sectionNo={sectionNo ?? 0}
          semester={semester ?? ''}
          academicYear={academicYear ?? 0}
          labBoyCount={labBoyCount ?? staffCase?.lab_boys?.length ?? 0}
          courseSchedule={courseSchedule}
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['staff-cases'] })
            refresh()
          }}
        />
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

const disabledBtn: React.CSSProperties = {
  padding: '5px 12px', fontSize: 12, fontWeight: 500,
  borderRadius: 'var(--radius-btn)', cursor: 'not-allowed',
  background: 'var(--line-soft)', color: 'var(--ink-400)',
  border: '1px solid var(--line)', opacity: 0.7,
}

function actionBtn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    padding: '5px 14px', fontSize: 12, fontWeight: 600,
    borderRadius: 'var(--radius-btn)', cursor: 'pointer',
    background: bg, color, border: border ?? 'none',
    transition: 'opacity .15s',
  }
}

// ─── WorkDatesPanel ───────────────────────────────────────────────────────────

const MONTH_TH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const DAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function fmtDateTH(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTH_TH[d.getMonth() + 1]} ${d.getFullYear() + 543} (${DAY_TH[d.getDay()]})`
}

interface WorkDateEntry { date: string; startTime: string; endTime: string; status: string }

function WorkDatesPanel({ dates }: { dates: WorkDateEntry[] }) {
  // Group by year-month
  const groups = useMemo(() => {
    const map = new Map<string, WorkDateEntry[]>()
    for (const d of dates) {
      const key = d.date.slice(0, 7) // YYYY-MM
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [dates])

  const payable = dates.filter((d) => d.status === 'scheduled' || d.status === 'completed').length
  const holiday = dates.filter((d) => d.status === 'cancelled_holiday').length

  return (
    <div style={{
      marginTop: 12,
      border: '1.5px solid var(--primary-100)',
      borderRadius: 'var(--radius-card)',
      background: 'var(--primary-50)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--primary-100)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
          วันที่ปฏิบัติงานทั้งหมด
        </span>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ นับได้ {payable} วัน</span>
          {holiday > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}>✗ วันหยุด {holiday} วัน</span>}
        </div>
      </div>

      {/* Month groups */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(([key, entries]) => {
          const [y, m] = key.split('-').map(Number)
          const monthLabel = `${MONTH_TH[m]} ${y + 543}`
          return (
            <div key={key}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--ink-500)',
                textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
              }}>
                {monthLabel} ({entries.filter((e) => e.status === 'scheduled' || e.status === 'completed').length} วันทำงาน)
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 4,
              }}>
                {entries.map((e, i) => {
                  const isHol = e.status === 'cancelled_holiday'
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', borderRadius: 6, fontSize: 12,
                      background: isHol ? 'var(--red-bg)' : '#fff',
                      border: `1px solid ${isHol ? '#FCA5A5' : 'var(--line)'}`,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isHol ? 'var(--red)' : 'var(--green)',
                      }} />
                      <span style={{ color: isHol ? 'var(--red)' : 'var(--ink-900)', flex: 1 }}>
                        {fmtDateTH(e.date)}
                      </span>
                      <span style={{ color: 'var(--ink-400)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {e.startTime}–{e.endTime}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
