import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DocumentWorkflowItem, DocType, DocStepStatus, WorkDaySlot } from '../../../types'
import { staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { triggerBrowserDownload } from '../../../utils/download'
import { DocumentPreviewModal } from './DocumentPreviewModal'

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

const DAY_OPTIONS = [
  'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี',
  'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์',
]

const EMPTY_SLOT: WorkDaySlot = { day: '', time_start: '', time_end: '' }

interface Props {
  items: DocumentWorkflowItem[]
  courseId: number
  courseRef: string
  onDocumentCreated: () => void
}

export function DocumentWorkflow({ items, courseId, courseRef, onDocumentCreated }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [previewStep, setPreviewStep] = useState<DocumentWorkflowItem | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [creatingStep, setCreatingStep] = useState<number | null>(null)

  // Hiring notice form modal state (used for both create and edit)
  const [hiringModalItem, setHiringModalItem] = useState<DocumentWorkflowItem | null>(null)
  const [hiringModalMode, setHiringModalMode] = useState<'create' | 'edit'>('create')
  const [workSlots, setWorkSlots] = useState<WorkDaySlot[]>([{ ...EMPTY_SLOT }])
  const [sessionsPerMonth, setSessionsPerMonth] = useState<number>(0)

  const createMut = useMutation({
    mutationFn: ({ docType, workSchedule, sessionsPerMonth: spm }: {
      docType: DocType; step: number;
      workSchedule?: WorkDaySlot[]; sessionsPerMonth?: number
    }) =>
      staffApi.createDocument({
        type: docType,
        course_ref: courseRef,
        course_id: courseId,
        work_schedule: workSchedule,
        sessions_per_month: spm,
      }),
    onSuccess: (_doc, { step }) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`สร้างเอกสารขั้นตอนที่ ${step} สำเร็จ`, 'success')
      setCreatingStep(null)
      setHiringModalItem(null)
      onDocumentCreated()
    },
    onError: () => {
      showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
      setCreatingStep(null)
    },
  })

  const updateScheduleMut = useMutation({
    mutationFn: ({ id, workSchedule, spm }: { id: number; workSchedule: WorkDaySlot[]; spm: number }) =>
      staffApi.updateDocumentSchedule(id, { work_schedule: workSchedule, sessions_per_month: spm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast('บันทึกตารางปฏิบัติงานเรียบร้อย', 'success')
      setHiringModalItem(null)
      onDocumentCreated()
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
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
    if (item.docType === 'hiring_notice') {
      setWorkSlots([{ ...EMPTY_SLOT }])
      setSessionsPerMonth(0)
      setHiringModalMode('create')
      setHiringModalItem(item)
    } else {
      setCreatingStep(item.step)
      createMut.mutate({ docType: item.docType, step: item.step })
    }
  }

  function handleHiringSubmit() {
    if (!hiringModalItem) return
    const validSlots = workSlots.filter((s) => s.day || s.time_start || s.time_end)
    if (hiringModalMode === 'edit' && hiringModalItem.documentId) {
      updateScheduleMut.mutate({
        id: hiringModalItem.documentId,
        workSchedule: validSlots,
        spm: sessionsPerMonth,
      })
    } else if (hiringModalItem.docType) {
      setCreatingStep(hiringModalItem.step)
      createMut.mutate({
        docType: hiringModalItem.docType,
        step: hiringModalItem.step,
        workSchedule: validSlots.length > 0 ? validSlots : undefined,
        sessionsPerMonth: sessionsPerMonth > 0 ? sessionsPerMonth : undefined,
      })
    }
  }

  function openEditSchedule(item: DocumentWorkflowItem) {
    setWorkSlots([{ ...EMPTY_SLOT }])
    setSessionsPerMonth(0)
    setHiringModalMode('edit')
    setHiringModalItem(item)
  }

  function updateSlot(idx: number, field: keyof WorkDaySlot, value: string) {
    setWorkSlots((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function addSlot() {
    if (workSlots.length < 3) setWorkSlots((prev) => [...prev, { ...EMPTY_SLOT }])
  }

  function removeSlot(idx: number) {
    setWorkSlots((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, idx) => {
        const cfg = STEP_STATUS_CONFIG[item.status]
        const isLast = idx === items.length - 1
        const isNotSupported = item.docType === null
        const isLoading = creatingStep === item.step && createMut.isPending

        return (
          <div key={item.step} style={{
            display: 'flex', gap: 0, position: 'relative',
          }}>
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
                  <button disabled style={disabledBtn} title="TODO: POST /staff/documents — ยังไม่รองรับประเภทเอกสารนี้">
                    ยังไม่รองรับ
                  </button>
                ) : (
                  <>
                    {/* Create */}
                    {(item.status === 'waiting') && (
                      <button
                        onClick={() => handleCreate(item)}
                        disabled={isLoading}
                        style={actionBtn('var(--accent)', '#fff')}
                        aria-label={`สร้างเอกสารขั้นตอนที่ ${item.step}`}
                      >
                        {isLoading ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
                      </button>
                    )}

                    {/* Edit work schedule — always visible for existing hiring_notice */}
                    {item.docType === 'hiring_notice' && item.documentId && (
                      <button
                        onClick={() => openEditSchedule(item)}
                        style={actionBtn('transparent', 'var(--primary)', '1.5px solid var(--primary)')}
                        aria-label="กรอก/แก้ไขตารางปฏิบัติงาน"
                      >
                        ตารางปฏิบัติงาน
                      </button>
                    )}

                    {/* Preview */}
                    {(item.status !== 'not_reached') && (
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

                    {/* Mark awaiting signature */}
                    {(item.status === 'created' || item.status === 'approved') && item.documentId && (
                      <button
                        onClick={() => confirmMut.mutate(item.documentId!)}
                        disabled={confirmMut.isPending}
                        style={actionBtn('var(--amber)', '#fff')}
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
            </div>
          </div>
        )
      })}

      <DocumentPreviewModal step={previewStep} onClose={() => setPreviewStep(null)} />

      {/* Hiring notice work schedule modal */}
      {hiringModalItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(e) => { if (e.target === e.currentTarget) setHiringModalItem(null) }}>
          <div style={{
            background: '#fff', borderRadius: 'var(--radius-lg)',
            padding: 28, width: '100%', maxWidth: 560,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
              {hiringModalMode === 'edit' ? 'แก้ไขตารางปฏิบัติงาน' : 'กรอกข้อมูลตารางปฏิบัติงาน'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 20 }}>
              อัตราค่าตอบแทน: 50 บาท/ชั่วโมง
            </div>

            {/* Work day slots */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 10 }}>
                วันปฏิบัติงานในแต่ละสัปดาห์
              </div>
              {workSlots.map((slot, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <select
                    value={slot.day}
                    onChange={(e) => updateSlot(i, 'day', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">เลือกวัน</option>
                    {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    value={slot.time_start}
                    onChange={(e) => updateSlot(i, 'time_start', e.target.value)}
                    style={{ ...inputStyle, width: 110 }}
                    placeholder="เวลาเริ่ม"
                  />
                  <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>ถึง</span>
                  <input
                    type="time"
                    value={slot.time_end}
                    onChange={(e) => updateSlot(i, 'time_end', e.target.value)}
                    style={{ ...inputStyle, width: 110 }}
                    placeholder="เวลาสิ้นสุด"
                  />
                  {workSlots.length > 1 && (
                    <button onClick={() => removeSlot(i)} style={removeBtn} title="ลบ">✕</button>
                  )}
                </div>
              ))}
              {workSlots.length < 3 && (
                <button onClick={addSlot} style={addRowBtn}>+ เพิ่มวัน</button>
              )}
            </div>

            {/* Sessions per month */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', display: 'block', marginBottom: 6 }}>
                จำนวนครั้งปฏิบัติงานต่อเดือน
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={sessionsPerMonth || ''}
                  onChange={(e) => setSessionsPerMonth(Number(e.target.value))}
                  style={{ ...inputStyle, width: 100 }}
                  placeholder="0"
                />
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>ครั้ง/เดือน</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setHiringModalItem(null)}
                style={actionBtn('transparent', 'var(--ink-600)', '1px solid var(--line)')}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleHiringSubmit}
                disabled={createMut.isPending || updateScheduleMut.isPending}
                style={actionBtn('var(--accent)', '#fff')}
              >
                {(createMut.isPending || updateScheduleMut.isPending)
                  ? 'กำลังบันทึก...'
                  : hiringModalMode === 'edit' ? 'บันทึก' : 'สร้างเอกสาร'}
              </button>
            </div>
          </div>
        </div>
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

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--line)', borderRadius: 'var(--radius-btn)',
  background: '#fff', color: 'var(--ink-900)',
  outline: 'none',
}

const removeBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%', border: 'none',
  background: 'var(--line-soft)', color: 'var(--ink-500)',
  cursor: 'pointer', fontSize: 11, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
}

const addRowBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontWeight: 500,
  border: '1px dashed var(--line)', borderRadius: 'var(--radius-btn)',
  background: 'transparent', color: 'var(--ink-500)', cursor: 'pointer',
  marginTop: 4,
}

function actionBtn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    padding: '5px 14px', fontSize: 12, fontWeight: 600,
    borderRadius: 'var(--radius-btn)', cursor: 'pointer',
    background: bg, color, border: border ?? 'none',
    transition: 'opacity .15s',
  }
}
