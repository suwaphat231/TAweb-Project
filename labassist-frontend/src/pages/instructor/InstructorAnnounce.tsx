import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { EmptyState } from '../../components/ui/EmptyState'
import type { CreateCoursePayload, CourseStatus } from '../../types'
import { Link } from 'react-router-dom'

const EMPTY: CreateCoursePayload = { code: '', title: '', semester: '1', academic_year: 2567, ta_slots: 0, labboy_slots: 0, status: 'draft', description: '', requirements: '' }

export default function InstructorAnnounce() {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data: courses = [], isLoading } = useQuery({ queryKey: ['instructor-courses'], queryFn: instructorApi.courses })

  const createMut = useMutation({
    mutationFn: instructorApi.createCourse,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['instructor-courses'] }); closeModal() },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCoursePayload> }) => instructorApi.updateCourse(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['instructor-courses'] }); closeModal() },
  })
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: CourseStatus }) => instructorApi.updateCourseStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-courses'] }),
  })

  function closeModal() { setShowModal(false); setForm(EMPTY); setEditId(null) }
  function openEdit(course: (typeof courses)[0]) {
    setForm({ code: course.code, title: course.title, semester: course.semester, academic_year: course.academic_year, ta_slots: course.ta_slots, labboy_slots: course.labboy_slots, status: course.status, description: course.description, requirements: course.requirements })
    setEditId(course.id)
    setShowModal(true)
  }
  function set(k: keyof CreateCoursePayload) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value })) }
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (editId) updateMut.mutate({ id: editId, data: form })
    else createMut.mutate(form)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการวิชา</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 4 }}>{courses.length} วิชา</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ สร้างประกาศรับสมัคร</Button>
      </div>

      {courses.length === 0 && !isLoading && <EmptyState title="ยังไม่มีวิชา" description="สร้างประกาศรับสมัครวิชาแรกของคุณ" icon="📚" action={<Button onClick={() => setShowModal(true)}>สร้างเลย</Button>} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {courses.map((c) => (
          <Card key={c.id} style={{ padding: '18px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>{c.code}</span>
                  <Badge value={c.status} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                  ภาค {c.semester}/{c.academic_year} · TA {c.ta_accepted}/{c.ta_slots} · Lab Boy {c.labboy_accepted}/{c.labboy_slots}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Select
                  options={[{value:'draft',label:'ร่าง'},{value:'open',label:'เปิดรับ'},{value:'closing_soon',label:'ใกล้ปิด'},{value:'closed',label:'ปิดรับ'}]}
                  value={c.status}
                  onChange={(e) => statusMut.mutate({ id: c.id, status: e.target.value as CourseStatus })}
                  style={{ width: 120, fontSize: 13 }}
                />
                <Button variant="outline" size="sm" onClick={() => openEdit(c)}>แก้ไข</Button>
                <Link to={`/instructor/select?course=${c.id}`}><Button size="sm">ผู้สมัคร</Button></Link>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={closeModal} title={editId ? 'แก้ไขวิชา' : 'สร้างประกาศรับสมัคร'} width={560}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="รหัสวิชา *" value={form.code} onChange={set('code')} placeholder="CS101" required />
            <Input label="ปีการศึกษา *" type="number" value={form.academic_year} onChange={set('academic_year')} required />
          </div>
          <Input label="ชื่อวิชา *" value={form.title} onChange={set('title')} placeholder="การโปรแกรมคอมพิวเตอร์" required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Select label="ภาคเรียน" value={form.semester} onChange={set('semester')} options={[{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}]} />
            <Input label="TA Slots" type="number" min="0" value={form.ta_slots} onChange={set('ta_slots')} />
            <Input label="Lab Boy Slots" type="number" min="0" value={form.labboy_slots} onChange={set('labboy_slots')} />
          </div>
          <Select label="สถานะ" value={form.status ?? 'draft'} onChange={set('status')} options={[{value:'draft',label:'ร่าง'},{value:'open',label:'เปิดรับสมัคร'},{value:'closing_soon',label:'ใกล้ปิด'},{value:'closed',label:'ปิดรับ'}]} />
          <Input label="วันปิดรับสมัคร" type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
          <Textarea label="คำอธิบายวิชา" value={form.description ?? ''} onChange={set('description')} rows={3} />
          <Textarea label="คุณสมบัติที่ต้องการ" value={form.requirements ?? ''} onChange={set('requirements')} rows={2} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={closeModal}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending || updateMut.isPending}>{editId ? 'บันทึก' : 'สร้าง'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
