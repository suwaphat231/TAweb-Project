import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { Link } from 'react-router-dom'
import { CourseFormModal } from './CourseFormModal'
import { COURSE_FORM_EMPTY, splitRequirements, joinRequirements } from './_courseFormShared'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { CreateCoursePayload, CourseStatus, Course } from '../../types'

const STATUS_OPTIONS = [
  { value: 'open',         label: 'เปิดรับสมัคร' },
  { value: 'closing_soon', label: 'ใกล้ปิด' },
  { value: 'closed',       label: 'ปิดรับ' },
  { value: 'draft',        label: 'ร่าง' },
]

export default function InstructorAnnounce() {
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(COURSE_FORM_EMPTY)
  const [minGrade, setMinGrade] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [statusTarget, setStatusTarget] = useState<Course | null>(null)
  const [pendingStatus, setPendingStatus] = useState<CourseStatus>('open')
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
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

  const deleteMut = useMutation({
    mutationFn: (id: number) => instructorApi.deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setDeleteTarget(null)
      showToast('ลบประกาศเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถลบประกาศได้ กรุณาลองใหม่', 'error'),
  })

  function closeModal() { setShowCourseModal(false); setForm(COURSE_FORM_EMPTY); setMinGrade(''); setEditId(null) }

  function openEdit(course: Course) {
    const { minGrade: grade, rest } = splitRequirements(course.requirements ?? '')
    setForm({
      code: course.code, title: displayCourseTitle(course.title, course.english_title),
      semester: course.semester, academic_year: course.academic_year,
      ta_slots: course.ta_slots, labboy_slots: course.labboy_slots,
      status: course.status,
      description: course.description ?? '',
      requirements: rest,
      deadline: course.deadline ? course.deadline.slice(0, 10) : '',
    })
    setMinGrade(grade)
    setEditId(course.id)
    setShowCourseModal(true)
  }

  function openStatusModal(course: Course) {
    setPendingStatus(course.status)
    setStatusTarget(course)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = { ...form, requirements: joinRequirements(minGrade, form.requirements ?? '') }
    if (editId) updateMut.mutate({ id: editId, data })
    else createMut.mutate(data)
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
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{displayCourseTitle(c.title, c.english_title)}</div>
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
                  <Button
                    variant="outline" size="sm"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => setDeleteTarget(c)}
                  >
                    ลบ
                  </Button>
                  <Link to={`/instructor/select?course=${c.id}`}>
                    <Button size="sm">ดูผู้สมัคร →</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CourseFormModal
        isOpen={showCourseModal}
        onClose={closeModal}
        editId={editId}
        form={form}
        setForm={setForm}
        minGrade={minGrade}
        setMinGrade={setMinGrade}
        onSubmit={submit}
        loading={createMut.isPending || updateMut.isPending}
      />

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

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ลบประกาศ"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการลบประกาศ <strong>{deleteTarget?.code}</strong> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
            {(deleteTarget?.applicant_count ?? 0) > 0 && (
              <> และจะลบใบสมัครของผู้สมัคร <strong>{deleteTarget?.applicant_count}</strong> คนที่ยื่นไว้ทั้งหมดด้วย</>
            )}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              ลบประกาศ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
