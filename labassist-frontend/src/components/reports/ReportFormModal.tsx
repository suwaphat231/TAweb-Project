import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage, reportsApi } from '../../services/api'
import { useToast } from '../../hooks/useToast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { categoryLabel, categoryOptions } from './reportLabels'
import { FilePicker } from './FilePicker'
import { Icon } from './ReportIcons'
import type { LabBoyReport, ReportCategory, ReportEvidence, ReportInput } from '../../types'

const MAX_TEXT = 2000

function todayISO() {
  // Local calendar date, matching the server's Asia/Bangkok "today".
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface ReportTarget {
  applicationId: number
  studentName: string
  studentCode: string
  courseLabel: string
}

interface Props {
  target: ReportTarget
  onClose: () => void
  /** The draft being edited; omit to create a new report. */
  existing?: LabBoyReport
  existingEvidence?: ReportEvidence[]
  /** Called with the report id after it was saved or submitted. */
  onSaved?: (reportId: number, submitted: boolean) => void
}

// ReportFormModal is the one form instructors use to report a Lab Boy's
// behaviour — opened from the course's student list, or from a draft's
// detail page to edit it. The student and course are fixed by where it was
// opened; the server re-derives both from the application anyway.
export function ReportFormModal({ target, onClose, existing, existingEvidence = [], onSaved }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [incidentDate, setIncidentDate] = useState(existing?.incident_date.slice(0, 10) ?? todayISO())
  const [category, setCategory] = useState<ReportCategory | ''>(existing?.category ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [impact, setImpact] = useState(existing?.impact ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function validate(): ReportInput | null {
    const e: Record<string, string> = {}
    if (!incidentDate) e.date = 'กรุณาระบุวันที่เกิดเหตุ'
    else if (incidentDate > todayISO()) e.date = 'วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต'
    if (!category) e.category = 'กรุณาเลือกประเภทพฤติกรรมที่รายงาน'
    if (!description.trim()) e.description = 'กรุณาระบุรายละเอียดและเหตุผลที่รายงาน'
    else if (description.trim().length > MAX_TEXT) e.description = `ไม่เกิน ${MAX_TEXT} ตัวอักษร`
    if (impact.trim().length > MAX_TEXT) e.impact = `ไม่เกิน ${MAX_TEXT} ตัวอักษร`
    setErrors(e)
    if (Object.keys(e).length) return null
    return {
      application_id: target.applicationId, incident_date: incidentDate, category: category as ReportCategory,
      description: description.trim(), impact: impact.trim(),
    }
  }

  function refresh(reportId: number) {
    qc.invalidateQueries({ queryKey: ['instructor-reports'] })
    qc.invalidateQueries({ queryKey: ['report-detail', reportId] })
  }

  // Creates or updates the draft, then uploads any new files. Returns the
  // report id, or 0 when something failed (already toasted).
  async function saveDraft(input: ReportInput): Promise<number> {
    let reportId = existing?.id ?? 0
    try {
      if (reportId) await reportsApi.updateDraft(reportId, input)
      else reportId = (await reportsApi.create(input)).id
    } catch (err) {
      showToast(await getApiErrorMessage(err, 'บันทึกรายงานไม่สำเร็จ'), 'error')
      return 0
    }
    if (files.length) {
      try {
        await reportsApi.uploadEvidence(reportId, files)
      } catch (err) {
        // The draft itself is saved; send the instructor to it to retry the upload.
        showToast(await getApiErrorMessage(err, 'บันทึกร่างแล้ว แต่แนบไฟล์ไม่สำเร็จ'), 'error')
        refresh(reportId)
        onSaved?.(reportId, false)
        return 0
      }
    }
    refresh(reportId)
    return reportId
  }

  async function handleSaveDraft() {
    const input = validate()
    if (!input) return
    setSaving(true)
    const reportId = await saveDraft(input)
    setSaving(false)
    if (reportId) {
      showToast('บันทึกฉบับร่างแล้ว', 'success')
      onSaved?.(reportId, false)
    }
  }

  async function handleSubmit() {
    const input = validate()
    if (!input) { setConfirming(false); return }
    setSaving(true)
    const reportId = await saveDraft(input)
    if (reportId) {
      try {
        await reportsApi.act(reportId, 'submit')
        refresh(reportId)
        showToast('ส่งรายงานเพื่อตรวจสอบแล้ว', 'success')
        onSaved?.(reportId, true)
      } catch (err) {
        showToast(await getApiErrorMessage(err, 'บันทึกร่างแล้ว แต่ส่งรายงานไม่สำเร็จ'), 'error')
        onSaved?.(reportId, false)
      }
    }
    setSaving(false)
  }

  const footer = confirming ? (
    <>
      <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>กลับไปแก้ไข</Button>
      <Button onClick={handleSubmit} loading={saving}>ยืนยันส่งรายงาน</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
      <Button variant="outline" onClick={handleSaveDraft} loading={saving}>บันทึกฉบับร่าง</Button>
      <Button onClick={() => { if (validate()) setConfirming(true) }} disabled={saving}>ส่งรายงาน</Button>
    </>
  )

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={existing ? 'แก้ไขร่างรายงาน' : 'รายงานพฤติกรรมการปฏิบัติงาน'} size="lg" footer={footer}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
            {target.studentName} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-500)' }}>{target.studentCode}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 2 }}>{target.courseLabel}</div>
        </div>
      </div>

      {confirming ? (
        <div style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.7 }}>
          <p style={{ fontWeight: 600 }}>ยืนยันส่งรายงาน "{category ? categoryLabel[category] : ''}"?</p>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            <li>เมื่อส่งแล้วจะแก้ไขไม่ได้ (ถอนรายงานได้โดยระบุเหตุผล)</li>
            <li>นักศึกษาจะได้รับแจ้งและสามารถส่งคำชี้แจงได้</li>
            <li>เจ้าหน้าที่จะตรวจสอบก่อน — รายงานจะมีผลเป็นประวัติก็ต่อเมื่อได้รับการยืนยันแล้วเท่านั้น</li>
          </ul>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Input label="วันที่เกิดเหตุ *" type="date" max={todayISO()} value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} error={errors.date} />
            <Select
              label="ประเภทพฤติกรรมที่รายงาน *"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              error={errors.category}
              options={[{ value: '', label: '— เลือกประเภท —' }, ...categoryOptions]}
            />
          </div>
          <Textarea
            label={`รายละเอียดและเหตุผลที่รายงาน *${category === 'OTHER' ? ' (โปรดระบุว่าเป็นพฤติกรรมประเภทใด)' : ''}`}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
            maxLength={MAX_TEXT}
            hint={`${description.trim().length}/${MAX_TEXT} — บันทึกข้อเท็จจริง เช่น วัน เวลา งานที่ได้รับมอบหมาย และสิ่งที่เกิดขึ้น`}
          />
          <Textarea label="ผลกระทบ (ไม่บังคับ)" rows={2} value={impact} onChange={(e) => setImpact(e.target.value)} error={errors.impact} maxLength={MAX_TEXT} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>หลักฐานประกอบ (ไม่บังคับ)</span>
            {existingEvidence.length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>แนบไว้แล้ว: {existingEvidence.map((e) => e.file_name).join(', ')}</span>
            )}
            <FilePicker files={files} onChange={setFiles} label="แนบหลักฐาน" />
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>เปิดดูได้เฉพาะผู้รายงาน ผู้ตรวจสอบ และนักศึกษาเจ้าของรายงาน</span>
          </div>
          <p style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink-600)', background: 'var(--blue-bg)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6 }}>
            <Icon name="alert" size={16} style={{ marginTop: 2, color: 'var(--primary)' }} />
            รายงานนี้ไม่ใช่ข้อสรุปว่านักศึกษากระทำผิด จะต้องผ่านการตรวจสอบและนักศึกษามีสิทธิ์ชี้แจงก่อน
          </p>
        </div>
      )}
    </Modal>
  )
}
