import type { DocumentWorkflowItem } from '../../../types'
import { Modal } from '../../../components/ui/Modal'

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

interface Props {
  step: DocumentWorkflowItem | null
  onClose: () => void
}

export function DocumentPreviewModal({ step, onClose }: Props) {
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

        {/* Placeholder preview */}
        <div style={{
          height: 200, borderRadius: 8, border: '1.5px dashed var(--line)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, background: 'var(--line-soft)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            {step.documentId ? 'ดาวน์โหลดเอกสารจากปุ่มด้านล่าง' : 'ยังไม่มีไฟล์เอกสาร — สร้างเอกสารก่อน'}
          </span>
          {/* TODO: Embed PDF/DOCX preview when available */}
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
