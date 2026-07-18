import { useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { instructorApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Modal } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import type { CreateCoursePayload, Course } from '../../types'

const EMPTY: CreateCoursePayload = {
  code: '', title: '', semester: '1', academic_year: 2567,
  ta_slots: 0, labboy_slots: 0, status: 'draft', description: '', requirements: '', deadline: '',
}

interface Posting {
  course: Course
  role: 'ta' | 'labboy'
  slots: number
  accepted: number
  applied: number
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

export default function InstructorHome() {
  const [search, setSearch] = useState('')
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: instructorApi.courses,
  })

  // Per-role applied counts aren't returned by the courses list (only combined
  // applicant_count + per-role accepted counts are), so pull the real applicant
  // lists to split "สมัคร" accurately between TA and Lab Boy rows.
  const applicantQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-applicants', c.id],
      queryFn: () => instructorApi.applicants(c.id),
    })),
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

  const postings = useMemo<Posting[]>(() => {
    const out: Posting[] = []
    courses.forEach((c, i) => {
      const applicants = applicantQueries[i]?.data ?? []
      const appliedFor = (role: 'ta' | 'labboy') =>
        applicants.filter((a) => a.role_applied === role && a.status !== 'withdrawn').length
      if (c.ta_slots > 0) {
        out.push({ course: c, role: 'ta', slots: c.ta_slots, accepted: c.ta_accepted, applied: appliedFor('ta') })
      }
      if (c.labboy_slots > 0) {
        out.push({ course: c, role: 'labboy', slots: c.labboy_slots, accepted: c.labboy_accepted, applied: appliedFor('labboy') })
      }
    })
    return out
  }, [courses, applicantQueries])

  const filtered = useMemo(() => {
    if (!search) return postings
    const q = search.toLowerCase()
    return postings.filter((p) => p.course.code.toLowerCase().includes(q) || p.course.title.toLowerCase().includes(q))
  }, [postings, search])

  const openCount = postings.filter((p) => p.course.status === 'open' || p.course.status === 'closing_soon').length
  const totalApplied = postings.reduce((s, p) => s + p.applied, 0)
  const totalAccepted = postings.reduce((s, p) => s + p.accepted, 0)

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 6 }}>อาจารย์ / จัดการประกาศ</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการประกาศรับสมัคร</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={() => showToast('ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้', 'info')}>
            นำเข้าจากภาคที่แล้ว
          </Button>
          <Button onClick={() => setShowCourseModal(true)}>+ สร้างประกาศใหม่</Button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="ประกาศของฉัน" value={postings.length} icon="📄" iconColor="var(--primary)" />
          <StatCard label="เปิดรับอยู่" value={openCount} icon="🕐" iconColor="var(--green)" />
          <StatCard label="รวมผู้สมัคร" value={totalApplied} icon="🧑" iconColor="var(--accent)" />
          <StatCard label="คัดเลือกแล้ว" value={totalAccepted} icon="✅" iconColor="#7C3AED" />
        </div>
      )}

      <Card padding={0}>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>ประกาศของฉัน</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>เรียงตามวันที่ล่าสุด</div>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ width: 220 }} />
        </CardHeader>

        <CardBody tight>
          {isLoading ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} height={52} borderRadius={8} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={postings.length === 0 ? 'ยังไม่มีประกาศ' : 'ไม่พบประกาศที่ค้นหา'}
              description={postings.length === 0 ? 'สร้างประกาศรับสมัครวิชาแรกของคุณ' : undefined}
              icon="📄"
              action={postings.length === 0 ? { label: 'สร้างเลย', onClick: () => setShowCourseModal(true) } : undefined}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
                    {['รายวิชา', 'ประเภท', 'รับ', 'สมัคร', 'สถานะ', ''].map((h) => (
                      <th key={h} style={{ padding: '11px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const c = p.course
                    const closed = c.status === 'closed'
                    return (
                      <tr key={`${c.id}-${p.role}`} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                              {c.code}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{c.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                            ภาค {c.semester}/{c.academic_year}
                            {c.deadline && (
                              <span style={{ marginLeft: 6, color: closed ? 'var(--ink-400)' : 'var(--amber)' }}>
                                · {closed ? 'ปิดรับเมื่อ' : 'เปิดรับถึง'}{' '}
                                {new Date(c.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px' }}><StatusBadge value={p.role} /></td>
                        <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{p.slots}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{p.applied} คน</td>
                        <td style={{ padding: '14px 20px' }}><StatusBadge value={c.status} /></td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Link to={`/instructor/select?course=${c.id}`}>
                              <Button size="sm">{closed ? 'ดูผลคัดเลือก' : 'ดูผู้สมัคร'}</Button>
                            </Link>
                            {closed ? (
                              <Button
                                size="sm" variant="outline"
                                title="เก็บเข้าคลัง"
                                onClick={() => showToast('ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้', 'info')}
                              >
                                <ArchiveIcon />
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" title="แก้ไข" onClick={() => openEdit(c)}>
                                <EditIcon />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCourseModal}
        onClose={closeModal}
        title={editId ? `แก้ไขวิชา — ${form.code}` : 'สร้างประกาศรับสมัคร'}
        size="lg"
      >
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="รหัสวิชา *"
              value={form.code}
              onChange={set('code')}
              placeholder="CS101"
              required
              readOnly={!!editId}
              style={editId ? { background: '#F8F9FB', cursor: 'not-allowed' } : undefined}
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
    </div>
  )
}
