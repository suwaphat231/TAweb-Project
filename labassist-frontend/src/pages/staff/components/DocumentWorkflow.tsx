import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import type {
  DocumentWorkflowItem, DocStepStatus, StaffCaseResponse, GroupMonthPlan, StaffDocument,
  WorkflowStepView, CreateWorkflowStepPayload, DocType,
} from '../../../types'
import { getApiErrorMessage, staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { triggerBrowserDownload } from '../../../utils/download'
import { Modal } from '../../../components/ui/Modal'
import { Textarea } from '../../../components/ui/Textarea'
import { Button } from '../../../components/ui/Button'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { WorkScheduleModal } from './WorkScheduleModal'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'

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

// คำอธิบายสั้น ๆ ของขั้นตอนที่ยังไม่ได้สร้าง ให้รู้ว่ากดแล้วจะเกิดอะไร
const STEP_HINT: Partial<Record<DocType, string>> = {
  hiring_notice:   'จัดตารางปฏิบัติงานของ Lab Boy ให้เรียบร้อย แล้วระบบจะสร้างแบบฟอร์มแจ้งความประสงค์จ้างจากตารางนั้น',
  approval_memo:   'ระบบสร้างบันทึกขออนุมัติจ้างจากเอกสารขั้นก่อนหน้าให้ทันที',
  payment_request: 'ระบบสร้างบันทึกขออนุมัติเบิกจ่ายเงิน พร้อมใบขวาง (หลักฐานการจ่ายเงิน) เดือนละ 1 หน้า',
  work_report:     'ระบบสร้างรายงานผลการปฏิบัติงานจากแผนปฏิบัติงานที่ยืนยันแล้ว',
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
  courseId,
  staffCase, courseCode, courseTitle, sectionNo,
  semester, academicYear, labBoyCount, courseSchedule, courseRef = '',
}: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [previewStep, setPreviewStep] = useState<DocumentWorkflowItem | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<number | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showWorkDates, setShowWorkDates] = useState(false)
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [form, setForm] = useState<CreateWorkflowStepPayload>({})
  const [openHistory, setOpenHistory] = useState<number | null>(null)
  const [cancelTarget, setCancelTarget] = useState<StaffDocument | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const planLocked = staffCase?.status === 'plan_locked' || staffCase?.status === 'done'

  const { data: workflow, isLoading, isError, refetch } = useQuery({
    queryKey: ['document-workflow', courseId],
    queryFn: () => staffApi.documentWorkflow(courseId),
    enabled: !!courseId,
  })

  // Opening the workflow creates the staff case once there are Lab Boys;
  // reload the case list so the work plan picks it up.
  const newCaseId = workflow?.course.staff_case_id
  useEffect(() => {
    if (newCaseId && !staffCase) qc.invalidateQueries({ queryKey: ['staff-cases'] })
  }, [newCaseId, staffCase, qc])

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

  const confirmScheduleMut = useMutation({
    mutationFn: () => staffApi.confirmSchedule(courseId),
    onSuccess: (data) => {
      showToast(`ยืนยันตารางปฏิบัติงานแล้ว — แจ้งเตือนนักศึกษา ${data.notified} คน`, 'success')
      qc.invalidateQueries({ queryKey: ['staff-cases'] })
      refresh()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ยืนยันตารางไม่สำเร็จ'), 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => staffApi.deleteDocument(id, reason),
    onSuccess: () => { showToast('ยกเลิกเอกสารแล้ว (ยังเก็บไว้ในประวัติ)', 'success'); setCancelTarget(null); refresh() },
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

  // The ใบขวาง printed with a step-3 payment request, from the same plan.
  async function downloadEvidence(doc: StaffDocument) {
    setDownloadingEvidenceId(doc.id)
    try {
      const blob = await staffApi.downloadEvidenceFile(doc.id)
      triggerBrowserDownload(blob, `หลักฐานการจ่ายเงิน ${doc.course_ref}.docx`)
    } catch (err) {
      showToast(await getApiErrorMessage(err, 'ดาวน์โหลดใบขวางไม่สำเร็จ'), 'error')
    } finally {
      setDownloadingEvidenceId(null)
    }
  }

  // Steps built entirely from the previous step's document: one click, no form.
  function oneClick(type: DocType) {
    return type === 'approval_memo' || type === 'payment_request' || type === 'work_report'
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
        โหลด workflow เอกสารไม่สำเร็จ <button onClick={() => refetch()} className="btn btn-outline btn-sm">ลองใหม่</button>
      </div>
    )
  }

  const views = workflow.steps
  // Timeline: documents are finished one at a time. The current step is the
  // first one without a document yet; later steps stay locked until it exists.
  const currentIdx = views.findIndex((v) => !v.document)

  const confirmed = workflow.course.schedule_confirmed
  const confirmBlockers = workflow.course.confirm_blocked_reasons ?? []
  // Scheduling Lab Boys is pointless until someone has been accepted; the
  // other blockers are what scheduling itself fixes.
  const scheduleBlocker = workflow.course.labboy_count === 0 ? 'ยังไม่มีนักศึกษาที่ผ่านการคัดเลือก' : ''
  const confirmReady = !confirmed && confirmBlockers.length === 0
  const confirmIsCurrent = currentIdx < 0 && !confirmed

  function moreItems(view: WorkflowStepView, item: DocumentWorkflowItem): ActionMenuItem[] {
    const doc = view.document
    const isHiringNotice = view.type === 'hiring_notice'
    return [
      ...(doc ? [{ label: 'ดูรายละเอียดเอกสาร', onClick: () => setPreviewStep(item) }] : []),
      ...(isHiringNotice && planLocked ? [{ label: 'ดูตารางปฏิบัติงาน', onClick: () => setShowScheduleModal(true) }] : []),
      ...(isHiringNotice && workDates.length > 0 ? [{
        label: showWorkDates ? 'ซ่อนวันที่ปฏิบัติงาน' : `วันที่ปฏิบัติงาน (${workDates.filter((d) => d.status === 'scheduled' || d.status === 'completed').length} วัน)`,
        onClick: () => setShowWorkDates((v) => !v),
      }] : []),
      ...(view.history.length > 0 ? [{
        label: openHistory === view.step ? 'ซ่อนฉบับก่อนหน้า' : `ฉบับก่อนหน้า (${view.history.length})`,
        onClick: () => setOpenHistory(openHistory === view.step ? null : view.step),
      }] : []),
      ...(doc ? [
        { label: 'สร้างฉบับใหม่', hint: 'ฉบับนี้จะเก็บไว้ในประวัติ', onClick: () => openCreate(view, true), separated: true },
        { label: 'ยกเลิกเอกสาร', danger: true, disabled: cancelMut.isPending, onClick: () => { setCancelReason(''); setCancelTarget(doc) } },
      ] : []),
    ]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {views.map((view, idx) => {
          const locked = currentIdx >= 0 && idx > currentIdx
          const isCurrent = idx === currentIdx
          const status = locked ? 'not_reached' : stepStatus(view)
          const baseCfg = STEP_STATUS_CONFIG[status]
          // The current step is the next one to do, so "not reached" would
          // contradict its "ขั้นตอนถัดไป" heading: say what it is waiting on.
          const cfg = isCurrent && status === 'not_reached'
            ? { ...baseCfg, label: 'ยังสร้างไม่ได้', color: 'var(--amber)', bg: 'var(--amber-bg)' }
            : baseCfg
          const shownBlockers = view.blocked_reasons
          const doc = view.document
          const isHiringNotice = view.type === 'hiring_notice'
          const createBlocker = isHiringNotice
            ? scheduleBlocker
            : view.can_create ? '' : view.blocked_reasons[0] ?? ''
          const done = !!doc
          const item: DocumentWorkflowItem = {
            step: view.step, label: view.label, docType: view.type, status,
            documentId: doc?.id, documentName: doc?.name, createdAt: doc?.created_at,
          }
          const menu = locked ? [] : moreItems(view, item)

          return (
            <TimelineNode key={view.step} state={done ? 'done' : isCurrent ? 'current' : 'locked'} marker={view.step}>
              {locked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 32 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-400)' }}>{view.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>· รอขั้นตอนที่ {views[idx - 1].step}</span>
                </div>
              ) : (
                <div style={isCurrent ? {
                  background: 'var(--primary-50)', border: '1.5px solid var(--primary-100)',
                  borderRadius: 12, padding: '14px 16px',
                } : undefined} className={isCurrent ? undefined : 'tl-row'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      {isCurrent && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.3, marginBottom: 2 }}>
                          ขั้นตอนถัดไป
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: isCurrent ? 16 : 14, fontWeight: isCurrent ? 700 : 600, color: 'var(--ink-900)', lineHeight: 1.45 }}>{view.label}</span>
                        {!done && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--radius-pill)', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      {doc ? (
                        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                          {doc.version && doc.version > 1 ? `ฉบับที่ ${doc.version} · ` : ''}สร้างเมื่อ {fmtDate(doc.created_at)}
                          {doc.ref_number && <> · ที่ {doc.ref_number}</>}
                        </div>
                      ) : STEP_HINT[view.type] && (
                        <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 4, lineHeight: 1.5 }}>{STEP_HINT[view.type]}</div>
                      )}
                    </div>

                    {/* การดำเนินการ: ปุ่มหลัก 1 ปุ่ม + เมนู ⋯ */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {!doc && (
                        <Button
                          onClick={() => (isHiringNotice ? setShowScheduleModal(true)
                            : oneClick(view.type) ? createMut.mutate({ type: view.type, body: {} }) : openCreate(view, false))}
                          disabled={!!createBlocker || createMut.isPending}
                          loading={createMut.isPending && createMut.variables?.type === view.type}
                          title={createBlocker || undefined}
                          style={{ minHeight: 40 }}
                        >
                          {isHiringNotice ? 'จัดตารางปฏิบัติงาน แล้วสร้างเอกสาร' : 'สร้างเอกสาร'}
                        </Button>
                      )}

                      {doc && view.has_template && (view.type === 'payment_request' ? (
                        <ActionMenu
                          label="ดาวน์โหลด"
                          align="right"
                          trigger={downloadingId === doc.id || downloadingEvidenceId === doc.id ? 'กำลังโหลด...' : <><DownloadIcon /> ดาวน์โหลด<ChevronIcon /></>}
                          className="doc-action"
                          items={[
                            { label: 'บันทึกขออนุมัติเบิกจ่ายเงิน', hint: 'เดือนละ 1 หน้า (.docx)', onClick: () => download(doc) },
                            { label: 'ใบขวาง (หลักฐานการจ่ายเงิน)', hint: 'เดือนละ 1 หน้า (.docx)', onClick: () => downloadEvidence(doc) },
                          ]}
                        />
                      ) : (
                        <button onClick={() => download(doc)} disabled={downloadingId === doc.id} className="doc-action">
                          {downloadingId === doc.id ? 'กำลังโหลด...' : <><DownloadIcon /> ดาวน์โหลด</>}
                        </button>
                      ))}

                      <ActionMenu
                        label="ตัวเลือกเพิ่มเติม"
                        align="right"
                        trigger={<DotsIcon />}
                        className="doc-action doc-action--icon"
                        items={menu}
                      />
                    </div>
                  </div>

                  {!doc && shownBlockers.length > 0 && (
                    <Note title="ต้องทำก่อนจึงจะสร้างได้" items={shownBlockers} />
                  )}
                  {doc && view.stale_reasons.length > 0 && (
                    <Note
                      title="ข้อมูลต้นทางเปลี่ยนหลังสร้างเอกสารนี้ — ถ้าต้องการให้ตรงกับข้อมูลปัจจุบัน ให้เลือก “สร้างฉบับใหม่” จากเมนู ⋯"
                      items={view.stale_reasons}
                    />
                  )}
                  {doc && !view.has_template && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>ยังไม่มี template .docx ของเอกสารนี้ — ติดตามสถานะได้ แต่ยังดาวน์โหลดไฟล์ไม่ได้</div>
                  )}

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
              )}
            </TimelineNode>
          )
        })}

        {/* ขั้นสุดท้าย: ยืนยันตารางปฏิบัติงาน เมื่อเอกสารครบทุกขั้น */}
        <TimelineNode last state={confirmed ? 'done' : confirmIsCurrent ? 'current' : 'locked'} marker={views.length + 1}>
          <div style={confirmIsCurrent ? {
            background: confirmReady ? 'var(--primary-50)' : 'var(--line-soft)',
            border: `1.5px solid ${confirmReady ? 'var(--primary-100)' : 'var(--line)'}`,
            borderRadius: 12, padding: '14px 16px',
          } : undefined} className={confirmIsCurrent ? undefined : 'tl-row'}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                {confirmIsCurrent && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.3, marginBottom: 2 }}>ขั้นตอนสุดท้าย</div>
                )}
                <div style={{ fontSize: confirmIsCurrent ? 16 : 14, fontWeight: 700, color: confirmed || confirmIsCurrent ? 'var(--ink-900)' : 'var(--ink-400)' }}>
                  ยืนยันตารางปฏิบัติงาน
                </div>
                <div style={{ fontSize: 13, color: confirmed ? 'var(--green)' : 'var(--ink-500)', marginTop: 2, lineHeight: 1.5 }}>
                  {confirmed
                    ? 'ยืนยันแล้ว — นักศึกษาเห็นตารางปฏิบัติงานและได้รับแจ้งเตือนแล้ว'
                    : confirmReady
                      ? `เอกสารครบแล้ว — ยืนยันเพื่อแจ้งตารางปฏิบัติงานให้ Lab Boy ${workflow.course.labboy_count} คน`
                      : 'ยืนยันได้เมื่อสร้างเอกสารทุกขั้นของรายวิชาครบแล้ว'}
                </div>
              </div>
              {confirmIsCurrent && (
                <Button onClick={() => confirmScheduleMut.mutate()} loading={confirmScheduleMut.isPending} disabled={!confirmReady} style={{ minHeight: 40 }}>
                  ยืนยันตารางปฏิบัติงาน
                </Button>
              )}
            </div>
            {!confirmed && confirmBlockers.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {confirmBlockers.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        </TimelineNode>
      </ol>

      {/* เอกสารรายเดือน — แสดงเฉพาะเมื่อมีเอกสารจริง */}
      {workflow.monthly_documents.length > 0 && (
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>เอกสารรายเดือน</div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>สร้างตามรอบเดือนที่ปฏิบัติงาน</div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
            {workflow.monthly_documents.map((d, i) => (
              <li key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '10px 14px', borderTop: i ? '1px solid var(--line-soft)' : 'none', fontSize: 13,
              }}>
                <FileIcon />
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{MONTHLY_LABEL[d.type] ?? d.type}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                    {d.period ? `${MONTH_TH[d.period.month]} ${d.period.year} · ` : ''}{DOC_STATUS_LABEL[d.status] ?? d.status} · {fmtDate(d.created_at)}
                  </div>
                </div>
                <button onClick={() => download(d)} disabled={downloadingId === d.id} className="doc-action">
                  {downloadingId === d.id ? 'กำลังโหลด...' : <><DownloadIcon /> ดาวน์โหลด</>}
                </button>
              </li>
            ))}
          </ul>
      </div>
      )}

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
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!cancelTarget}
        onClose={() => !cancelMut.isPending && setCancelTarget(null)}
        title="ยกเลิกเอกสาร"
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelMut.isPending}>ไม่ยกเลิก</Button>
          <Button
            variant="danger"
            loading={cancelMut.isPending}
            disabled={!cancelReason.trim()}
            onClick={() => cancelTarget && cancelMut.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })}
          >
            ยกเลิกเอกสาร
          </Button>
        </>}
      >
        {cancelTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{cancelTarget.name}</div>
            <div style={{ fontSize: 13, color: '#92400E', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>
              เอกสารจะถูกทำเครื่องหมาย "ยกเลิกแล้ว" และยังเก็บไว้ในประวัติ — ไม่ถูกลบ
            </div>
            <Textarea label="เหตุผลที่ยกเลิก *" rows={3} maxLength={300} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
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
          onCreateDocument={views.find((v) => v.type === 'hiring_notice')?.document ? undefined : () => {
            setShowScheduleModal(false)
            createMut.mutate({ type: 'hiring_notice', body: {} })
          }}
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

type NodeState = 'done' | 'current' | 'locked'

// One row of the vertical timeline: a marker on a rail plus its content. The
// rail segment grows with the content, so the connector always lines up.
function TimelineNode({ state, marker, last, children }: { state: NodeState; marker: number; last?: boolean; children: React.ReactNode }) {
  const circle: React.CSSProperties = state === 'done'
    ? { background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid #BBF7D0' }
    : state === 'current'
      ? { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', boxShadow: '0 0 0 4px var(--primary-100)' }
      : { background: '#fff', color: 'var(--ink-400)', border: '1px solid var(--line)' }
  return (
    <li style={{ display: 'flex', gap: 14 }} aria-current={state === 'current' ? 'step' : undefined}>
      <div style={{ width: 28, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, ...circle,
        }}>
          {state === 'done' ? <CheckIcon /> : marker}
        </div>
        {!last && (
          <div style={{ flex: 1, width: 1, minHeight: 12, margin: '6px 0 -4px', background: 'var(--line)' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 6 }}>{children}</div>
    </li>
  )
}

function Note({ title, items }: { title: string; items: string[] }) {
  return (
    <div role="note" style={{ marginTop: 10, padding: '8px 12px', background: 'var(--amber-bg)', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
      <b>{title}</b>
      <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{items.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2 }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function FileIcon() {
  return (
    <span aria-hidden style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    </span>
  )
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
