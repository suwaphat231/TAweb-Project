import { useState, useEffect, useRef } from 'react'
import { renderAsync } from 'docx-preview'
import type { DocumentWorkflowItem } from '../../../types'
import { Modal } from '../../../components/ui/Modal'
import { staffApi } from '../../../services/api'

const STEP_DESC: Record<number, string> = {
  1: 'แบบฟอร์มนี้ใช้แจ้งความประสงค์ในการจ้างนักศึกษาช่วยสอนและช่วยคุมปฏิบัติการ ประกอบด้วยรายชื่อนักศึกษาที่อาจารย์ผู้รับผิดชอบรายวิชายืนยันเลือกแล้ว พร้อมข้อมูลรายวิชา ตารางเรียน และอัตราค่าตอบแทน',
  2: 'บันทึกขออนุมัติการจ้างนักศึกษาช่วยสอน ส่งถึงหัวหน้าภาควิชาเพื่อขออนุมัติ ระบุรายชื่อนักศึกษา วงเงินที่คาดว่าจะใช้ และอ้างอิงแบบฟอร์มแจ้งความประสงค์ฉบับก่อนหน้า',
  3: 'แบบแจ้งนักศึกษาช่วยคุมรายวิชาปฏิบัติการ ใช้แจ้งกำหนดการและหน้าที่ให้นักศึกษาที่ได้รับเลือก — ยังอยู่ระหว่างพัฒนา',
  4: 'รายงานผลการปฏิบัติงานนอกเวลาราชการ สรุปชั่วโมงและวันทำงานจริงของนักศึกษาแต่ละคน ลงนามรับรองโดยอาจารย์ผู้รับผิดชอบและหัวหน้าภาควิชา',
  5: 'บันทึกขออนุมัติเบิกจ่ายเงินค่าตอบแทน สรุปยอดรวมและรายละเอียดเพื่อส่งฝ่ายการเงิน',
}

const STATUS_LABEL: Record<string, string> = {
  not_reached: 'ยังไม่ถึงขั้นตอน',
  waiting:     'รอจัดทำ',
  created:     'สร้างแล้ว (ร่าง)',
  in_review:   'รอตรวจสอบ',
  approved:    'อนุมัติแล้ว',
  completed:   'เสร็จสิ้น',
}

type PreviewState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

interface Props {
  step: DocumentWorkflowItem | null
  onClose: () => void
}

export function DocumentPreviewModal({ step, onClose }: Props) {
  const [previewState, setPreviewState] = useState<PreviewState>('idle')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!step?.documentId) {
      setPreviewState('idle')
      return
    }
    setPreviewState('loading')
    let cancelled = false

    staffApi.downloadDocument(step.documentId)
      .then((blob) => {
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        return renderAsync(blob, containerRef.current, undefined, {
          inWrapper: false,
          ignoreWidth: true,
          useBase64URL: true,
        })
      })
      .then(() => { if (!cancelled) setPreviewState('ready') })
      .catch((err: unknown) => {
        if (cancelled) return
        const status = (err as { response?: { status?: number } })?.response?.status
        setPreviewState(status === 501 ? 'unavailable' : 'error')
      })

    return () => { cancelled = true }
  }, [step?.documentId])

  if (!step) return null

  return (
    <Modal isOpen={!!step} onClose={onClose} title={`ตัวอย่างเอกสาร — ขั้นตอนที่ ${step.step}`} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Step badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: 'var(--primary-50)',
          borderRadius: 8, border: '1px solid var(--primary-100)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'var(--primary)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
          }}>
            {step.step}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.3 }}>
              {step.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3 }}>
              สถานะ: {STATUS_LABEL[step.status] ?? step.status}
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={{
          padding: '14px 16px', background: 'var(--bg)',
          borderRadius: 8, border: '1px solid var(--line)',
          fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.7,
        }}>
          {STEP_DESC[step.step]}
        </div>

        {/* Document info if exists */}
        {step.documentId && (
          <div style={{
            padding: '12px 16px', background: 'var(--green-bg)',
            borderRadius: 8, border: '1px solid #86EFAC',
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>เอกสารที่สร้างแล้ว</div>
            <div style={{ color: 'var(--ink-700)' }}>{step.documentName}</div>
            {step.createdAt && (
              <div style={{ color: 'var(--ink-400)', fontSize: 12, marginTop: 4 }}>
                สร้างเมื่อ {new Date(step.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        )}

        {/* Document preview area */}
        <div style={{
          borderRadius: 8, border: '1.5px solid var(--line)',
          overflow: 'hidden', background: 'var(--line-soft)',
          minHeight: 220,
        }}>
          {/* Render target — always mounted so the ref is available */}
          <div
            ref={containerRef}
            style={{
              display: previewState === 'ready' ? 'block' : 'none',
              maxHeight: 420, overflowY: 'auto',
              padding: '12px 16px', background: '#fff',
              fontSize: 12,
            }}
          />

          {/* Loading */}
          {previewState === 'loading' && (
            <div style={{
              height: 220, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>กำลังโหลดตัวอย่างเอกสาร…</span>
            </div>
          )}

          {/* No document yet */}
          {previewState === 'idle' && (
            <div style={{
              height: 220, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีไฟล์เอกสาร — สร้างเอกสารก่อน</span>
            </div>
          )}

          {/* 501 — template not ready */}
          {previewState === 'unavailable' && (
            <div style={{
              height: 220, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--ink-500)', textAlign: 'center', maxWidth: 240 }}>
                เอกสารประเภทนี้ยังไม่รองรับการดูตัวอย่าง<br/>
                <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>ดาวน์โหลดได้เมื่อ template พร้อม</span>
              </span>
            </div>
          )}

          {/* Generic error */}
          {previewState === 'error' && (
            <div style={{
              height: 220, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>ไม่สามารถโหลดตัวอย่างได้</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              borderRadius: 'var(--radius-btn)', cursor: 'pointer',
              background: 'var(--primary)', color: '#fff', border: 'none',
            }}
          >
            ปิด
          </button>
        </div>
      </div>
    </Modal>
  )
}
