import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../../services/api'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../hooks/useToast'
import type { StudentInfoComparison, StudentInfoDocument } from '../../../types'

// ─── Field row ───────────────────────────────────────────────────────────────

function FieldRow({
  label,
  ocr,
  current,
  match,
  ocrOnly,
}: {
  label: string
  ocr: string | null | undefined
  current: string | null | undefined
  match: boolean
  ocrOnly?: boolean
}) {
  const hasOcr = ocr != null && ocr !== ''
  const hasCurrent = current != null && current !== ''

  return (
    <tr>
      <td style={{ padding: '7px 10px', fontSize: 13, color: 'var(--ink-600)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </td>
      <td style={{ padding: '7px 10px', fontSize: 13, color: hasOcr ? 'var(--ink-900)' : 'var(--ink-400)' }}>
        {hasOcr ? String(ocr) : '—'}
      </td>
      <td style={{ padding: '7px 10px', fontSize: 13, color: hasCurrent ? 'var(--ink-900)' : 'var(--ink-400)' }}>
        {ocrOnly ? <span style={{ fontSize: 11, color: 'var(--ink-400)', fontStyle: 'italic' }}>—</span>
          : hasCurrent ? String(current) : '—'}
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
        {ocrOnly ? (
          <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>จากเอกสาร</span>
        ) : hasOcr && hasCurrent ? (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: match ? '#F0FDF4' : '#FFF7ED',
            color: match ? '#15803D' : '#C2410C',
            border: `1px solid ${match ? '#BBF7D0' : '#FED7AA'}`,
          }}>
            {match ? 'ตรงกัน' : 'ต่างกัน'}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>—</span>
        )}
      </td>
    </tr>
  )
}

// ─── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable({ cmp }: { cmp: StudentInfoComparison }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1.5px solid var(--line)' }}>
          <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--ink-500)', fontWeight: 700 }}>ฟิลด์</th>
          <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--ink-500)', fontWeight: 700 }}>จากเอกสาร (OCR)</th>
          <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--ink-500)', fontWeight: 700 }}>โปรไฟล์ปัจจุบัน</th>
          <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, color: 'var(--ink-500)', fontWeight: 700 }}>สถานะ</th>
        </tr>
      </thead>
      <tbody>
        <FieldRow label="รหัสนักศึกษา"            ocr={cmp.student_id.ocr}      current={cmp.student_id.current}      match={cmp.student_id.match} />
        <FieldRow label="ชื่อ-นามสกุล (ภาษาไทย)" ocr={cmp.full_name_th.ocr}    current={cmp.full_name_th.current}    match={cmp.full_name_th.match} />
        <FieldRow label="ชื่อ-นามสกุล (English)"  ocr={cmp.full_name_en.ocr}    current={cmp.full_name_en.current}    match={cmp.full_name_en.match}   ocrOnly />
        <FieldRow label="ระดับการศึกษา"            ocr={cmp.education_level.ocr} current={cmp.education_level.current} match={cmp.education_level.match} ocrOnly />
        <FieldRow label="หลักสูตร"                 ocr={cmp.curriculum.ocr}      current={cmp.curriculum.current}      match={cmp.curriculum.match}      ocrOnly />
        <FieldRow label="ภาควิชา"                  ocr={cmp.faculty.ocr}         current={cmp.faculty.current}         match={cmp.faculty.match} />
        <FieldRow label="วิทยาเขต"                 ocr={cmp.campus.ocr}          current={cmp.campus.current}          match={cmp.campus.match}          ocrOnly />
        <FieldRow label="สถานภาพนักศึกษา"          ocr={cmp.student_status.ocr}  current={cmp.student_status.current}  match={cmp.student_status.match}  ocrOnly />
      </tbody>
    </table>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasMismatch(cmp: StudentInfoComparison): boolean {
  return [cmp.student_id, cmp.full_name_th, cmp.faculty].some(
    (f) => f.ocr != null && f.current != null && !f.match,
  )
}

function hasAnyOcr(doc: StudentInfoDocument): boolean {
  return !!(
    doc.ocr_student_id ||
    doc.ocr_full_name_th ||
    doc.ocr_full_name_en ||
    doc.ocr_faculty ||
    doc.ocr_curriculum ||
    doc.ocr_campus ||
    doc.ocr_student_status
  )
}

// Statuses on the registrar document that mean the student is still enrolled.
function isActiveStatus(status: string): boolean {
  return /กำลังศึกษา|ปกติ|active|studying/i.test(status)
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

// ─── Main component ───────────────────────────────────────────────────────────

export function StudentInfoVerification() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [applyToProfile, setApplyToProfile] = useState(true)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['student-info-doc'],
    queryFn: studentApi.getStudentInfo,
    retry: (failCount, err) => {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return false
      return failCount < 2
    },
  })

  const uploadMut = useMutation({
    mutationFn: studentApi.uploadStudentInfo,
    onSuccess: (result) => {
      qc.setQueryData(['student-info-doc'], result)
      showToast('อ่านข้อมูลจากเอกสารเรียบร้อยแล้ว', 'success')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const confirmMut = useMutation({
    mutationFn: () => studentApi.confirmStudentInfo(applyToProfile),
    onSuccess: (result) => {
      qc.setQueryData(['student-info-doc'], result)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast(
        applyToProfile ? 'ยืนยันและอัปเดตโปรไฟล์เรียบร้อยแล้ว' : 'ยืนยันเอกสารเรียบร้อยแล้ว',
        'success',
      )
    },
    onError: () => {
      showToast('ยืนยันไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast('รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('ไฟล์ขนาดใหญ่เกินไป (สูงสุด 10 MB)', 'error')
      return
    }
    uploadMut.mutate(file)
  }

  const isUploading = uploadMut.isPending
  const isConfirming = confirmMut.isPending

  const doc = data?.document
  const cmp = data?.comparison
  const isConfirmed = !!doc?.confirmed_at

  // ── No document yet ──
  if (!isLoading && !doc && !uploadMut.isPending) {
    return (
      <Card style={{ padding: 24 }}>
        <SectionHeader />
        <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={handleFileChange} />
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-800)', marginBottom: 6 }}>
            ยังไม่มีเอกสาร
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>
            อัปโหลด PDF หรือรูปภาพ (JPG/PNG) ใบแสดงข้อมูลนักศึกษา
            <br />เพื่อให้ระบบอ่านและเปรียบเทียบข้อมูลกับโปรไฟล์
          </div>
          <Button onClick={() => fileInputRef.current?.click()}>อัปโหลดเอกสาร</Button>
        </div>
      </Card>
    )
  }

  // ── Uploading / loading ──
  if (isLoading || isUploading) {
    return (
      <Card style={{ padding: 24 }}>
        <SectionHeader />
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--ink-500)', fontSize: 14 }}>
          {isUploading ? 'กำลังอ่านเอกสาร...' : 'กำลังโหลด...'}
        </div>
      </Card>
    )
  }

  if (!doc || !cmp) return null

  const anyMismatch = hasMismatch(cmp)
  const anyOcr = hasAnyOcr(doc)
  const confidence = doc.confidence

  return (
    <Card style={{ padding: 24 }}>
      <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={handleFileChange} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionHeader />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isConfirmed && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0',
            }}>
              ยืนยันแล้ว ✓
            </span>
          )}
          {doc.ocr_student_status && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              ...(isActiveStatus(doc.ocr_student_status)
                ? { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }
                : { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }),
            }}>
              {doc.ocr_student_status}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isConfirming}
          >
            อัปโหลดใหม่
          </Button>
        </div>
      </div>

      {/* File info */}
      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 14 }}>
        ไฟล์: {doc.file_name}
        {isConfirmed && doc.confirmed_at && (
          <> · ยืนยันเมื่อ {new Date(doc.confirmed_at).toLocaleDateString('th-TH')}</>
        )}
        {confidence > 0 && (
          <> · ความมั่นใจ OCR: {(confidence * 100).toFixed(0)}%</>
        )}
      </div>

      {/* OCR couldn't extract anything */}
      {!anyOcr && (
        <div style={{
          background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8,
          padding: '12px 14px', fontSize: 13, color: '#C2410C', marginBottom: 16,
        }}>
          ระบบไม่สามารถอ่านข้อมูลจากเอกสารนี้ได้ กรุณาลองอัปโหลดภาพที่ชัดกว่า
        </div>
      )}

      {/* Low confidence warning (OCR path only — text-layer PDFs have confidence 1.0) */}
      {anyOcr && confidence > 0 && confidence < 0.6 && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#92400E', marginBottom: 14,
        }}>
          ความมั่นใจในการอ่านต่ำ ({(confidence * 100).toFixed(0)}%) — กรุณาตรวจสอบข้อมูลก่อนยืนยัน
        </div>
      )}

      {/* Student status banner */}
      {doc.ocr_student_status && !isActiveStatus(doc.ocr_student_status) && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#B91C1C', marginBottom: 14,
        }}>
          สถานภาพนักศึกษาในเอกสาร: <b>{doc.ocr_student_status}</b> — กรุณาตรวจสอบว่ายังมีสถานะเป็นนักศึกษาอยู่
        </div>
      )}
      {anyOcr && !doc.ocr_student_status && !isConfirmed && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#92400E', marginBottom: 14,
        }}>
          ไม่พบสถานภาพนักศึกษาในเอกสาร — กรุณาอัปโหลดเอกสารที่ระบุสถานภาพ (เช่น กำลังศึกษา)
        </div>
      )}

      {/* Mismatch banner */}
      {anyOcr && anyMismatch && !isConfirmed && (
        <div style={{
          background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#C2410C', marginBottom: 14,
        }}>
          พบข้อมูลที่ต่างจากโปรไฟล์ปัจจุบัน — ตรวจสอบตารางด้านล่าง
        </div>
      )}

      {/* Comparison table */}
      {anyOcr && (
        <div style={{ overflowX: 'auto', marginBottom: 16, border: '1px solid var(--line)', borderRadius: 8 }}>
          <ComparisonTable cmp={cmp} />
        </div>
      )}

      {/* Confirm section */}
      {anyOcr && !isConfirmed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={applyToProfile}
              onChange={(e) => setApplyToProfile(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            <span style={{ color: 'var(--ink-700)' }}>
              อัปเดตโปรไฟล์จากเอกสาร (รหัสนักศึกษา, ชื่อ-นามสกุล (ไทย), ภาควิชา)
            </span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              loading={isConfirming}
              disabled={isUploading}
              onClick={() => confirmMut.mutate()}
            >
              ยืนยันข้อมูล
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SectionHeader() {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
      ยืนยันข้อมูลจากเอกสาร
      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-500)', marginLeft: 8 }}>
        PDF / รูปภาพใบแสดงข้อมูลนักศึกษา
      </span>
    </div>
  )
}
