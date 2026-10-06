import { useState, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import type { DocumentWorkflowItem, DocType, DocStepStatus, StaffCaseResponse, GroupMonthPlan } from '../../../types'
import { staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { triggerBrowserDownload } from '../../../utils/download'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { WorkScheduleModal } from './WorkScheduleModal'

const STEP_STATUS_CONFIG: Record<DocStepStatus, { label: string; color: string; bg: string }> = {
  not_reached:         { label: 'ยังไม่ถึงขั้นตอน', color: 'var(--ink-400)',  bg: 'var(--line-soft)' },
  waiting:             { label: 'รอจัดทำ',           color: 'var(--amber)',   bg: 'var(--amber-bg)' },
  created:             { label: 'สร้างแล้ว',         color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  in_review:           { label: 'รอตรวจสอบ',         color: 'var(--primary)', bg: 'var(--primary-50)' },
  approved:            { label: 'อนุมัติแล้ว',       color: 'var(--primary)', bg: 'var(--primary-50)' },
  awaiting_signature:  { label: 'รอลงนาม',           color: 'var(--amber)',   bg: 'var(--amber-bg)' },
  signed:              { label: 'ลงนามแล้ว',         color: 'var(--green)',   bg: 'var(--green-bg)' },
  completed:           { label: 'เสร็จสิ้น',         color: 'var(--green)',   bg: 'var(--green-bg)' },
}


interface Props {
  items: DocumentWorkflowItem[]
  courseId: number
  courseRef: string
  onDocumentCreated: () => void
  staffCase?: StaffCaseResponse
  courseCode?: string
  courseTitle?: string
  sectionNo?: number
  semester?: string
  academicYear?: number
  labBoyCount?: number
  courseSchedule?: string
}

export function DocumentWorkflow({
  items, courseId, courseRef, onDocumentCreated,
  staffCase, courseCode, courseTitle, sectionNo,
  semester, academicYear, labBoyCount, courseSchedule,
}: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [previewStep, setPreviewStep] = useState<DocumentWorkflowItem | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [creatingStep, setCreatingStep] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const planLocked = staffCase?.status === 'plan_locked' || staffCase?.status === 'done'
  const [showWorkDates, setShowWorkDates] = useState(false)

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
          all.push({
            date: occ.scheduled_date.slice(0, 10),
            startTime: occ.start_time,
            endTime: occ.end_time,
            status: occ.status,
          })
        }
      }
    }
    return all.sort((a, b) => a.date.localeCompare(b.date))
  }, [monthlyPlan])

  const createMut = useMutation({
    mutationFn: ({ docType }: { docType: DocType; step: number }) =>
      staffApi.createDocument({
        type: docType,
        course_ref: courseRef,
        course_id: courseId,
        staff_case_id: staffCase?.id,
      }),
    onSuccess: (_doc, { step }) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`สร้างเอกสารขั้นตอนที่ ${step} สำเร็จ`, 'success')
      setCreatingStep(null)
      onDocumentCreated()
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      showToast(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
      setCreatingStep(null)
    },
  })

  const confirmMut = useMutation({
    mutationFn: (docId: number) => staffApi.updateDocumentStatus(docId, 'awaiting_signature'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast('ส่งรอลงนามเรียบร้อย', 'success')
      onDocumentCreated()
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (docId: number) => staffApi.deleteDocument(docId),
    onSuccess: (_data, docId) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast('ลบเอกสารเรียบร้อย', 'success')
      setDeletingId(null)
      if (deletingId === docId) setDeletingId(null)
      onDocumentCreated()
    },
    onError: () => {
      showToast('ลบเอกสารไม่สำเร็จ', 'error')
      setDeletingId(null)
    },
  })

  const signedMut = useMutation({
    mutationFn: (docId: number) => staffApi.updateDocumentStatus(docId, 'signed'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast('บันทึกลงนามแล้ว', 'success')
      onDocumentCreated()
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  async function handleDownload(item: DocumentWorkflowItem) {
    if (!item.documentId) return
    setDownloadingId(item.documentId)
    try {
      const blob = await staffApi.downloadDocument(item.documentId)
      triggerBrowserDownload(blob, `${item.documentName ?? `step-${item.step}`}.docx`)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 501) showToast('เอกสารประเภทนี้ยังไม่รองรับการสร้างไฟล์', 'info')
      else showToast('ดาวน์โหลดไม่สำเร็จ', 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  function handleCreate(item: DocumentWorkflowItem) {
    if (!item.docType) return
    setCreatingStep(item.step)
    createMut.mutate({ docType: item.docType, step: item.step })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, idx) => {
        const cfg = STEP_STATUS_CONFIG[item.status]
        const isLast = idx === items.length - 1
        const isNotSupported = item.docType === null
        const isLoading = creatingStep === item.step && createMut.isPending
        const isHiringNotice = item.docType === 'hiring_notice'
        const scheduleBlocked = isHiringNotice && !planLocked

        return (
          <div key={item.step} style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 23, top: 46, width: 2,
                height: 'calc(100% - 24px)',
                background: item.status === 'signed' || item.status === 'completed'
                  ? 'var(--green)' : 'var(--line)',
              }} />
            )}

            {/* Step circle */}
            <div style={{
              width: 46, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: item.status === 'not_reached' ? 'var(--line-soft)'
                  : item.status === 'signed' || item.status === 'completed' ? 'var(--green)'
                  : item.status === 'waiting' || item.status === 'awaiting_signature' ? 'var(--amber)'
                  : 'var(--primary)',
                color: item.status === 'not_reached' ? 'var(--ink-400)' : '#fff',
                border: `2px solid ${item.status === 'not_reached' ? 'var(--line)' : 'transparent'}`,
              }}>
                {item.status === 'signed' || item.status === 'completed'
                  ? <CheckIcon />
                  : item.step}
              </div>
            </div>

            {/* Content */}
            <div style={{
              flex: 1, padding: '14px 16px 20px 12px',
              borderBottom: isLast ? 'none' : '1px solid var(--line-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.4 }}>
                    {item.label}
                  </div>
                  {item.documentName && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3 }}>
                      {item.documentName}
                      {item.createdAt && (
                        <span style={{ color: 'var(--ink-400)' }}>
                          {' '}— {new Date(item.createdAt).toLocaleDateString('th-TH')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                  background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
                }}>
                  {cfg.label}
                </span>
              </div>


              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {isNotSupported ? (
                  <button disabled style={disabledBtn} title="TODO: ยังไม่รองรับประเภทเอกสารนี้">
                    ยังไม่รองรับ
                  </button>
                ) : (
                  <>
                    {/* Schedule setup button — visible when this step needs plan to be locked */}
                    {scheduleBlocked && item.status === 'waiting' && (
                      <button
                        onClick={() => setShowScheduleModal(true)}
                        style={actionBtn('var(--primary)', '#fff')}
                        aria-label="กำหนดตารางปฏิบัติงาน"
                      >
                        กำหนดตารางปฏิบัติงาน
                      </button>
                    )}

                    {/* View/edit schedule */}
                    {isHiringNotice && item.status !== 'not_reached' && (
                      <button
                        onClick={() => setShowScheduleModal(true)}
                        style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}
                        aria-label="ดูตารางปฏิบัติงาน"
                      >
                        ดูตารางปฏิบัติงาน
                      </button>
                    )}

                    {/* Show individual work dates panel */}
                    {isHiringNotice && item.status !== 'not_reached' && workDates.length > 0 && (
                      <button
                        onClick={() => setShowWorkDates((v) => !v)}
                        style={actionBtn('transparent', 'var(--primary)', '1.5px solid var(--primary)')}
                        aria-label="แสดงวันที่ปฏิบัติงาน"
                      >
                        {showWorkDates ? 'ซ่อนวันที่ปฏิบัติงาน' : `วันที่ปฏิบัติงาน (${workDates.filter(d => d.status === 'scheduled' || d.status === 'completed').length} วัน)`}
                      </button>
                    )}

                    {/* Create */}
                    {item.status === 'waiting' && (
                      <button
                        onClick={() => handleCreate(item)}
                        disabled={isLoading || scheduleBlocked}
                        title={scheduleBlocked ? 'ยืนยันตารางปฏิบัติงานก่อน' : undefined}
                        style={actionBtn(
                          scheduleBlocked ? 'var(--line-soft)' : 'var(--accent)',
                          scheduleBlocked ? 'var(--ink-400)' : '#fff',
                        )}
                        aria-label={`สร้างเอกสารขั้นตอนที่ ${item.step}`}
                      >
                        {isLoading ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
                      </button>
                    )}

                    {/* Preview */}
                    {item.status !== 'not_reached' && (
                      <button
                        onClick={() => setPreviewStep(item)}
                        style={actionBtn('transparent', 'var(--primary)', '1.5px solid var(--primary)')}
                        aria-label={`ดูตัวอย่างเอกสารขั้นตอนที่ ${item.step}`}
                      >
                        ดูตัวอย่าง
                      </button>
                    )}

                    {/* Download DOCX */}
                    {item.documentId && (
                      <button
                        onClick={() => handleDownload(item)}
                        disabled={downloadingId === item.documentId}
                        style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}
                        aria-label={`ดาวน์โหลด DOCX ขั้นตอนที่ ${item.step}`}
                      >
                        {downloadingId === item.documentId ? 'กำลังโหลด...' : 'ดาวน์โหลด DOCX'}
                      </button>
                    )}

                    {/* Delete document */}
                    {item.documentId && (
                      <button
                        onClick={() => {
                          if (!window.confirm('ลบเอกสารนี้ใช่ไหม?')) return
                          setDeletingId(item.documentId!)
                          deleteMut.mutate(item.documentId!)
                        }}
                        disabled={deletingId === item.documentId}
                        style={actionBtn('transparent', 'var(--red, #ef4444)', '1px solid var(--red, #ef4444)')}
                        aria-label={`ลบเอกสารขั้นตอนที่ ${item.step}`}
                      >
                        {deletingId === item.documentId ? 'กำลังลบ...' : 'ลบ'}
                      </button>
                    )}

                    {/* Mark awaiting signature */}
                    {(item.status === 'created' || item.status === 'approved') && item.documentId && (
                      <button
                        onClick={() => confirmMut.mutate(item.documentId!)}
                        disabled={confirmMut.isPending || scheduleBlocked}
                        title={scheduleBlocked ? 'ยืนยันตารางปฏิบัติงานก่อน' : undefined}
                        style={actionBtn(
                          scheduleBlocked ? 'var(--line-soft)' : 'var(--amber)',
                          scheduleBlocked ? 'var(--ink-400)' : '#fff',
                        )}
                        aria-label={`ส่งรอลงนามขั้นตอนที่ ${item.step}`}
                      >
                        {confirmMut.isPending ? 'กำลังบันทึก...' : 'ส่งรอลงนาม'}
                      </button>
                    )}

                    {/* Mark signed */}
                    {item.status === 'awaiting_signature' && item.documentId && (
                      <button
                        onClick={() => signedMut.mutate(item.documentId!)}
                        disabled={signedMut.isPending}
                        style={actionBtn('var(--green)', '#fff')}
                        aria-label={`บันทึกลงนามแล้วขั้นตอนที่ ${item.step}`}
                      >
                        {signedMut.isPending ? 'กำลังบันทึก...' : 'บันทึกลงนามแล้ว'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Work dates panel */}
              {isHiringNotice && showWorkDates && item.status !== 'not_reached' && workDates.length > 0 && (
                <WorkDatesPanel dates={workDates} />
              )}
            </div>
          </div>
        )
      })}

      <DocumentPreviewModal step={previewStep} onClose={() => setPreviewStep(null)} />

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
            onDocumentCreated()
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
