import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { CourseCodeAutocomplete } from '../../components/course/CourseCodeAutocomplete'
import { SectionCatalogPicker } from '../../components/course/SectionCatalogPicker'
import { GRADE_OPTIONS } from './_courseFormShared'
import type { CreateCoursePayload } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  editId: number | null
  form: CreateCoursePayload
  setForm: (fn: (f: CreateCoursePayload) => CreateCoursePayload) => void
  minGrade: string
  setMinGrade: (v: string) => void
  sectionIds: number[]
  setSectionIds: (ids: number[]) => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
}

export function CourseFormModal({
  isOpen, onClose, editId, form, setForm, minGrade, setMinGrade, sectionIds, setSectionIds, onSubmit, loading,
}: Props) {
  function set(k: keyof CreateCoursePayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value
      setForm(f => ({ ...f, [k]: value }))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? `แก้ไขวิชา — ${form.code}` : 'สร้างประกาศรับสมัคร'}
      size="lg"
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: editId ? '1fr 1fr' : '1fr', gap: 14 }}>
          <CourseCodeAutocomplete
            value={form.code}
            onChange={(v) => { setForm(f => ({ ...f, code: v })); setSectionIds([]) }}
            onSelect={(c) => setForm(f => ({ ...f, code: c.code, title: c.title }))}
            disabled={!!editId}
          />
          {/* ปีการศึกษา/ภาคเรียน มาจากไฟล์ที่นำเข้าอยู่แล้วตอนสร้างประกาศใหม่ (ผูกกับ
              section ที่เลือก) — ให้แก้ได้เฉพาะตอนแก้ไข section ที่เปิดอยู่แล้วเท่านั้น */}
          {editId && (
            <Input label="ปีการศึกษา *" type="number" value={form.academic_year} onChange={set('academic_year')} required />
          )}
        </div>
        <Input label="ชื่อวิชา *" value={form.title} onChange={set('title')} placeholder="การโปรแกรมคอมพิวเตอร์" required />
        {editId && (
          <Select label="ภาคเรียน" value={form.semester} onChange={set('semester')}
            options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
        )}

        {editId ? (
          // Editing one existing, already-open section — Sec/เวลาเรียนมาจากไฟล์นำเข้า
          // เสมอ แสดงเป็นข้อมูลอย่างเดียว แก้ไขไม่ได้ เพื่อลดโอกาสพิมพ์ผิด
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 5 }}>Sec</div>
              <div style={{ fontSize: 14, color: 'var(--ink-900)', padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-input)' }}>
                {form.section || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 5 }}>เวลาเรียน</div>
              <div style={{ fontSize: 14, color: 'var(--ink-900)', padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-input)' }}>
                {form.schedule || '—'}
              </div>
            </div>
          </div>
        ) : (
          <SectionCatalogPicker
            code={form.code}
            semester={form.semester}
            academicYear={form.academic_year}
            selectedIds={sectionIds}
            onChange={setSectionIds}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Input
            label="Lab Boy Slots *" type="number" min="0" 
            value={form.labboy_slots || ''} onChange={set('labboy_slots')} required
          />
          <Input label="วันปิดรับสมัคร" type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
        </div>
        {editId && (
          <Select label="สถานะ" value={form.status ?? 'draft'} onChange={set('status')}
            options={[{ value: 'draft', label: 'ร่าง' }, { value: 'open', label: 'เปิดรับสมัคร' }, { value: 'closing_soon', label: 'ใกล้ปิด' }, { value: 'closed', label: 'ปิดรับ' }]} />
        )}
        <Select label="เกรดเฉลี่ยขั้นต่ำ" value={minGrade} onChange={(e) => setMinGrade(e.target.value)} options={GRADE_OPTIONS} />

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          border: form.require_grade_proof ? '2px solid var(--primary)' : '1.5px solid var(--line)',
          background: form.require_grade_proof ? 'var(--primary-50)' : '#fff',
        }}>
          <input
            type="checkbox"
            checked={!!form.require_grade_proof}
            onChange={(e) => setForm(f => ({ ...f, require_grade_proof: e.target.checked }))}
            style={{ marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>ต้องแนบรูปภาพเกรดยืนยัน</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
              นักศึกษาต้องแนบรูปเกรด (เช่น ภาพจาก MyReg) ตอนสมัคร แทนการกรอกเกรดเฉยๆ — ป้องกันการกรอกเกรดมั่ว
            </div>
          </div>
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" loading={loading} disabled={!editId && sectionIds.length === 0}>
            {editId ? 'บันทึก' : 'เปิดรับสมัคร'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
