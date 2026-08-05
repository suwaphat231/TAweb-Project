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
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [statusTarget, setStatusTarget] = useState<Course | null>(null)
  const [pendingStatus, setPendingStatus] = useState<CourseStatus>('open')
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const [closeTarget, setCloseTarget] = useState<Course | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
  })

  // "Creating" a posting means opening one or more of the instructor's
  // already-imported sections (picked via SectionCatalogPicker) — each is
  // an existing Course row from the Excel import, so this is a batch of
  // ordinary updates, not a brand-new row.
  const openSectionsMut = useMutation({
    mutationFn: async (vars: { ids: number[]; data: Partial<CreateCoursePayload> }) => {
      await Promise.all(vars.ids.map((id) => instructorApi.updateCourse(id, vars.data)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      closeModal()
      showToast('เปิดรับสมัครเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถเปิดรับสมัครได้ กรุณาลองใหม่', 'error'),
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

  // Closing applications takes the section straight to "closed" — students
  // immediately see it as no longer accepting applications (CourseCard
  // shows the "ปิดรับ" badge instead of an apply button for closed/draft).
  const closeMut = useMutation({
    mutationFn: (id: number) => instructorApi.updateCourseStatus(id, 'closed'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setCloseTarget(null)
      showToast('ปิดรับสมัครเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถปิดรับสมัครได้ กรุณาลองใหม่', 'error'),
  })

  function openCreate() {
    setForm(COURSE_FORM_EMPTY)
    setMinGrade('')
    setSectionIds([])
    setEditId(null)
    setShowCourseModal(true)
  }

  function closeModal() { setShowCourseModal(false); setForm(COURSE_FORM_EMPTY); setMinGrade(''); setSectionIds([]); setEditId(null) }

  function openEdit(course: Course) {
    const { minGrade: grade, rest } = splitRequirements(course.requirements ?? '')
    setForm({
      code: course.code, title: displayCourseTitle(course.title, course.english_title),
      semester: course.semester, academic_year: course.academic_year,
      labboy_slots: course.labboy_slots,
      status: course.status,
      description: course.description ?? '',
      requirements: rest,
      deadline: course.deadline ? course.deadline.slice(0, 10) : '',
      section: course.section ?? 0,
      schedule: course.schedule ?? '',
      require_grade_proof: course.require_grade_proof,
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
    if (editId) {
      updateMut.mutate({ id: editId, data })
    } else {
      if (sectionIds.length === 0) return
      const { labboy_slots, status, deadline, description, requirements, require_grade_proof } = data
      openSectionsMut.mutate({ ids: sectionIds, data: { labboy_slots, status, deadline, description, requirements, require_grade_proof } })
    }
  }

  // Draft rows are just unopened sections from the Excel import — the
  // instructor picks among them via SectionCatalogPicker when creating a
  // posting, so they don't need to also clutter this list until opened.
  const visibleCourses = courses.filter((c) => c.status !== 'draft')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการประกาศรับสมัคร</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 4 }}>{visibleCourses.length} วิชา</p>
        </div>
        <Button onClick={openCreate}>+ สร้างประกาศ</Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={96} borderRadius={12} />)}
        </div>
      ) : visibleCourses.length === 0 ? (
        <EmptyState
          title="ยังไม่มีวิชา"
          description="สร้างประกาศรับสมัครวิชาแรกของคุณ"
          icon="📚"
          action={{ label: 'สร้างเลย', onClick: openCreate }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleCourses.map((c) => (
            <Card key={c.id} style={{ padding: '18px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--primary)',
                      background: 'var(--primary-50)', padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    }}>{c.code}</span>
                    {!!c.section && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
                        Sec {c.section}
                      </span>
                    )}
                    <StatusBadge value={c.status} />
                    {(c.applicant_count ?? 0) > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>
                        {c.applicant_count} ผู้สมัคร
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{displayCourseTitle(c.title, c.english_title)}</div>
                  {c.schedule && (
                    <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 2 }}>🕐 {c.schedule}</div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                    ภาค {c.semester}/{c.academic_year}
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
                  {(c.status === 'open' || c.status === 'closing_soon') && (
                    <Button
                      variant="outline" size="sm"
                      style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}
                      onClick={() => setCloseTarget(c)}
                    >
                      ปิดรับสมัคร
                    </Button>
                  )}
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
        sectionIds={sectionIds}
        setSectionIds={setSectionIds}
        onSubmit={submit}
        loading={openSectionsMut.isPending || updateMut.isPending}
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

      {/* Close Applications Confirm Modal */}
      <Modal
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title="ปิดรับสมัคร"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการปิดรับสมัครประกาศ <strong>{closeTarget?.code}</strong> ใช่หรือไม่?
            นักศึกษาจะเห็นว่าวิชานี้ปิดรับสมัครแล้วและจะสมัครไม่ได้อีก
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setCloseTarget(null)}>ยกเลิก</Button>
            <Button
              loading={closeMut.isPending}
              onClick={() => closeTarget && closeMut.mutate(closeTarget.id)}
            >
              ปิดรับสมัคร
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
