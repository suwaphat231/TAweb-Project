import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { CourseCodeAutocomplete } from '../../components/ui/CourseCodeAutocomplete'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { Link } from 'react-router-dom'
import type { CreateCoursePayload, CourseStatus, Course } from '../../types'

const EMPTY: CreateCoursePayload = {
  code: '', title: '', semester: '1', academic_year: 2567,
  ta_slots: 0, labboy_slots: 0, status: 'draft', description: '', requirements: '', deadline: '',
}

const STATUS_OPTIONS = [
  { value: 'open',         label: 'เปิดรับสมัคร' },
  { value: 'closing_soon', label: 'ใกล้ปิด' },
  { value: 'closed',       label: 'ปิดรับ' },
  { value: 'draft',        label: 'ร่าง' },
]

export default function InstructorAnnounce() {
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [statusTarget, setStatusTarget] = useState<Course | null>(null)
  const [pendingStatus, setPendingStatus] = useState<CourseStatus>('open')
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: instructorApi.courses,
  })

  const createMut = useMutation({
    mutationFn: instructorApi.createCourse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      closeModal()
      showToast('สร้างประกาศรับสมัครเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถสร้างวิชาได้ กรุณาลองใหม่', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCoursePayload> }) =>
      instructorApi.updateCourse(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      closeModal()
      showToast('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถบันทึกได้ กรุณาลองใหม่', 'error'),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: CourseStatus }) =>
      instructorApi.updateCourseStatus(id, status),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setStatusTarget(null)
      const label = STATUS_OPTIONS.find((o) => o.value === vars.status)?.label ?? vars.status
      showToast(`เปลี่ยนสถานะเป็น "${label}" เรียบร้อยแล้ว`, 'success')
    },
    onError: () => showToast('ไม่สามารถเปลี่ยนสถานะได้', 'error'),
  })

  function closeModal() { setShowCourseModal(false); setForm(EMPTY); setEditId(null) }

  function openEdit(course: Course) {
    setForm({
      code: course.code, title: course.title,
      semester: course.semester, academic_year: course.academic_year,
      ta_slots: course.ta_slots, labboy_slots: course.labboy_slots,
      status: course.status,
      description: course.description ?? '',
      requirements: course.requirements ?? '',
      deadline: course.deadline ? course.deadline.slice(0, 10) : '',
    })
    setEditId(course.id)
    setShowCourseModal(true)
  }

  function openStatusModal(course: Course) {
    setPendingStatus(course.status)
    setStatusTarget(course)
  }

  function set(k: keyof CreateCoursePayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value
      setForm(f => ({ ...f, [k]: value }))
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (editId) updateMut.mutate({ id: editId, data: form })
    else createMut.mutate(form)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการประกาศรับสมัคร</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 4 }}>{courses.length} วิชา</p>
        </div>
        <Button onClick={() => setShowCourseModal(true)}>+ สร้างประกาศ</Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={96} borderRadius={12} />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title="ยังไม่มีวิชา"
          description="สร้างประกาศรับสมัครวิชาแรกของคุณ"
          icon="📚"
          action={{ label: 'สร้างเลย', onClick: () => setShowCourseModal(true) }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {courses.map((c) => (
            <Card key={c.id} style={{ padding: '18px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--primary)',
                      background: 'var(--primary-50)', padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    }}>{c.code}</span>
                    <StatusBadge value={c.status} />
                    {(c.applicant_count ?? 0) > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>
                        {c.applicant_count} ผู้สมัคร
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                    ภาค {c.semester}/{c.academic_year}
                    &nbsp;·&nbsp;TA {c.ta_accepted}/{c.ta_slots}
                    &nbsp;·&nbsp;Lab Boy {c.labboy_accepted}/{c.labboy_slots}
                    {c.deadline && (
                      <span style={{ marginLeft: 8, color: 'var(--amber)' }}>
                        · ปิด {new Date(c.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => openStatusModal(c)}>เปลี่ยนสถานะ</Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>แก้ไข</Button>
                  <Link to={`/instructor/select?course=${c.id}`}>
                    <Button size="sm">ดูผู้สมัคร →</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCourseModal}
        onClose={closeModal}
        title={editId ? `แก้ไขวิชา — ${form.code}` : 'สร้างประกาศรับสมัคร'}
        size="lg"
      >
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              options={[{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}]} />
            <Input label="TA Slots" type="number" min="0" value={form.ta_slots} onChange={set('ta_slots')} />
            <Input label="Lab Boy Slots" type="number" min="0" value={form.labboy_slots} onChange={set('labboy_slots')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Select label="สถานะ" value={form.status ?? 'draft'} onChange={set('status')}
              options={[{value:'draft',label:'ร่าง'},{value:'open',label:'เปิดรับสมัคร'},{value:'closing_soon',label:'ใกล้ปิด'},{value:'closed',label:'ปิดรับ'}]} />
            <Input label="วันปิดรับสมัคร" type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
          </div>
          <Textarea label="คุณสมบัติที่ต้องการ" value={form.requirements ?? ''} onChange={set('requirements')} rows={2} placeholder="เกรดเฉลี่ยขั้นต่ำ, ทักษะที่ต้องการ..." />
          <Textarea label="รายละเอียดเพิ่มเติม" value={form.description ?? ''} onChange={set('description')} rows={2} placeholder="หน้าที่ความรับผิดชอบ, ตารางสอน..." />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={closeModal}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
              {editId ? 'บันทึก' : 'สร้าง'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        isOpen={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={`เปลี่ยนสถานะ — ${statusTarget?.code}`}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                border: pendingStatus === opt.value ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                background: pendingStatus === opt.value ? 'var(--primary-50)' : '#fff',
                transition: 'border .12s, background .12s',
              }}
            >
              <input
                type="radio"
                name="status"
                value={opt.value}
                checked={pendingStatus === opt.value}
                onChange={() => setPendingStatus(opt.value as CourseStatus)}
                style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: pendingStatus === opt.value ? 'var(--primary)' : 'var(--ink-900)' }}>
                {opt.label}
              </span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>ยกเลิก</Button>
            <Button
              loading={statusMut.isPending}
              onClick={() => statusTarget && statusMut.mutate({ id: statusTarget.id, status: pendingStatus })}
            >
              บันทึก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
