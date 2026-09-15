import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DocumentWorkflowItem, DocType, DocStepStatus } from '../../../types'
import { staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { triggerBrowserDownload } from '../../../utils/download'
import { DocumentPreviewModal } from './DocumentPreviewModal'

const STEP_STATUS_CONFIG: Record<DocStepStatus, { label: string; color: string; bg: string }> = {
  not_reached: { label: 'ยังไม่ถึงขั้นตอน', color: 'var(--ink-400)',  bg: 'var(--line-soft)' },
  waiting:     { label: 'รอจัดทำ',           color: 'var(--amber)',   bg: 'var(--amber-bg)' },
  created:     { label: 'สร้างแล้ว',         color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  in_review:   { label: 'รอตรวจสอบ',         color: 'var(--primary)', bg: 'var(--primary-50)' },
  approved:    { label: 'อนุมัติแล้ว',       color: 'var(--green)',   bg: 'var(--green-bg)' },
  completed:   { label: 'เสร็จสิ้น',         color: 'var(--green)',   bg: 'var(--green-bg)' },
}

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

  const createMut = useMutation({
    mutationFn: ({ docType }: { docType: DocType; step: number }) =>
      staffApi.createDocument({ type: docType, course_ref: courseRef, course_id: courseId }),
    onSuccess: (_doc, { step }) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`สร้างเอกสารขั้นตอนที่ ${step} สำเร็จ`, 'success')
      setCreatingStep(null)
      onDocumentCreated()
    },
    onError: () => { showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'); setCreatingStep(null) },
  })

  const confirmMut = useMutation({
    mutationFn: (docId: number) => staffApi.updateDocumentStatus(docId, 'approved'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast('ยืนยันเอกสารเสร็จสิ้นแล้ว', 'success')
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

        return (
          <div key={item.step} style={{
            display: 'flex', gap: 0, position: 'relative',
          }}>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 23, top: 46, width: 2,
                height: 'calc(100% - 24px)',
                background: item.status === 'completed' || item.status === 'approved'
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
                  : item.status === 'completed' || item.status === 'approved' ? 'var(--green)'
                  : item.status === 'waiting' ? 'var(--amber)'
                  : 'var(--primary)',
                color: item.status === 'not_reached' ? 'var(--ink-400)' : '#fff',
                border: `2px solid ${item.status === 'not_reached' ? 'var(--line)' : 'transparent'}`,
              }}>
                {item.status === 'completed' || item.status === 'approved'
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

                    {/* Upload signed (TODO) */}
                    {(item.status === 'in_review' || item.status === 'approved') && (
                      <button
                        disabled
                        style={disabledBtn}
                        title="TODO: PUT /staff/documents/{id}/signed — อยู่ระหว่างพัฒนา"
                      >
                        อัปโหลดฉบับลงนาม
                      </button>
                    )}

                    {/* Confirm done */}
                    {item.status === 'created' && item.documentId && (
                      <button
                        onClick={() => confirmMut.mutate(item.documentId!)}
                        disabled={confirmMut.isPending}
                        style={actionBtn('var(--green)', '#fff')}
                        aria-label={`ยืนยันเสร็จสิ้นขั้นตอนที่ ${item.step}`}
                      >
                        {confirmMut.isPending ? 'กำลังบันทึก...' : 'ยืนยันเสร็จสิ้น'}
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
