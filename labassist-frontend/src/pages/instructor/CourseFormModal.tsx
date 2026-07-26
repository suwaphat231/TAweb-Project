import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { CourseCodeAutocomplete } from '../../components/course/CourseCodeAutocomplete'
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
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
}

export function CourseFormModal({
  isOpen, onClose, editId, form, setForm, minGrade, setMinGrade, onSubmit, loading,
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CourseCodeAutocomplete
            value={form.code}
            onChange={(v) => setForm(f => ({ ...f, code: v }))}
            onSelect={(c) => setForm(f => ({ ...f, code: c.code, title: c.title }))}
            disabled={!!editId}
          />
          <Input label="ปีการศึกษา *" type="number" value={form.academic_year} onChange={set('academic_year')} required />
        </div>
        <Input label="ชื่อวิชา *" value={form.title} onChange={set('title')} placeholder="การโปรแกรมคอมพิวเตอร์" required />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Select label="ภาคเรียน" value={form.semester} onChange={set('semester')}
            options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
          <Input label="TA Slots" type="number" min="0" value={form.ta_slots} onChange={set('ta_slots')} />
          <Input label="Lab Boy Slots" type="number" min="0" value={form.labboy_slots} onChange={set('labboy_slots')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Select label="สถานะ" value={form.status ?? 'draft'} onChange={set('status')}
            options={[{ value: 'draft', label: 'ร่าง' }, { value: 'open', label: 'เปิดรับสมัคร' }, { value: 'closing_soon', label: 'ใกล้ปิด' }, { value: 'closed', label: 'ปิดรับ' }]} />
          <Input label="วันปิดรับสมัคร" type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
        </div>
        <Select label="เกรดเฉลี่ยขั้นต่ำ" value={minGrade} onChange={(e) => setMinGrade(e.target.value)} options={GRADE_OPTIONS} />
        <Textarea label="คุณสมบัติที่ต้องการเพิ่มเติม" value={form.requirements ?? ''} onChange={set('requirements')} rows={2} placeholder="ทักษะที่ต้องการ..." />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" loading={loading}>
            {editId ? 'บันทึก' : 'สร้าง'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
