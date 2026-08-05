import { useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { instructorApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { CourseFormModal } from './CourseFormModal'
import { COURSE_FORM_EMPTY, splitRequirements, joinRequirements } from './_courseFormShared'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { CreateCoursePayload, Course } from '../../types'

interface Posting {
  course: Course
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

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="8" x2="16" y2="16" />
      <line x1="16" y1="8" x2="8" y2="16" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

// A course is still openable through the end of its deadline day — only
// strictly-past days are blocked, matching the backend's cutoff.
function isPastDeadline(deadline?: string): boolean {
  if (!deadline) return false
  const end = new Date(deadline)
  end.setHours(23, 59, 59, 999)
  return end < new Date()
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
  return detail ?? fallback
}

export default function InstructorHome() {
  const [search, setSearch] = useState('')
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(COURSE_FORM_EMPTY)
  const [minGrade, setMinGrade] = useState('')
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const [closeTarget, setCloseTarget] = useState<Course | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
  })

  // applicant_count on the course list only counts non-withdrawn applicants
  // in total; pull the real applicant lists so "สมัคร" excludes withdrawn ones.
  const applicantQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-applicants', c.id],
      queryFn: () => instructorApi.applicants(c.id),
    })),
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
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถเปิดรับสมัครได้ กรุณาลองใหม่'), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCoursePayload> }) =>
      instructorApi.updateCourse(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      closeModal()
      showToast('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถบันทึกได้ กรุณาลองใหม่'), 'error'),
  })

  const archiveMut = useMutation({
    mutationFn: (id: number) => instructorApi.updateCourseStatus(id, 'archived'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setArchiveTarget(null)
      showToast('เก็บประกาศเข้าคลังแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถเก็บเข้าคลังได้ กรุณาลองใหม่', 'error'),
  })

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => instructorApi.updateCourseStatus(id, 'closed'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      showToast('กู้คืนประกาศแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถกู้คืนได้ กรุณาลองใหม่', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => instructorApi.deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setDeleteTarget(null)
      showToast('ลบประกาศเรียบร้อยแล้ว — วิชานี้ยังเลือกเปิดรับสมัครใหม่ได้อีกภายหลัง', 'success')
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

  // The reverse of closeMut — a closed posting needs a direct way back to
  // "open" without going through the edit form, or it's stuck closed forever.
  const reopenMut = useMutation({
    mutationFn: (id: number) => instructorApi.updateCourseStatus(id, 'open'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      showToast('เปิดรับสมัครใหม่เรียบร้อยแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถเปิดรับสมัครใหม่ได้ กรุณาลองใหม่'), 'error'),
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

  const postings = useMemo<Posting[]>(() => {
    return courses.map((c, i) => {
      const applicants = applicantQueries[i]?.data ?? []
      const applied = applicants.filter((a) => a.status !== 'withdrawn').length
      return { course: c, slots: c.labboy_slots, accepted: c.labboy_accepted, applied }
    })
  }, [courses, applicantQueries])

  // Draft rows are just unopened sections from the Excel import — the
  // instructor picks among them via SectionCatalogPicker when creating a
  // posting, so they don't need to also clutter this list until opened.
  const activePostings = useMemo(() => postings.filter((p) => p.course.status !== 'archived' && p.course.status !== 'draft'), [postings])
  const archivedPostings = useMemo(() => postings.filter((p) => p.course.status === 'archived'), [postings])

  const filtered = useMemo(() => {
    const base = showArchived ? archivedPostings : activePostings
    if (!search) return base
    const q = search.toLowerCase()
    return base.filter((p) => p.course.code.toLowerCase().includes(q) || p.course.title.toLowerCase().includes(q))
  }, [activePostings, archivedPostings, showArchived, search])

  const openCount = activePostings.filter((p) => p.course.status === 'open' || p.course.status === 'closing_soon').length
  const totalApplied = activePostings.reduce((s, p) => s + p.applied, 0)
  const totalAccepted = activePostings.reduce((s, p) => s + p.accepted, 0)

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 6 }}>อาจารย์ / จัดการประกาศ</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการประกาศรับสมัคร</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={openCreate}>+ สร้างประกาศใหม่</Button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="ประกาศของฉัน" value={activePostings.length} icon="📄" iconColor="var(--primary)" />
          <StatCard label="เปิดรับอยู่" value={openCount} icon="🕐" iconColor="var(--green)" />
          <StatCard label="รวมผู้สมัคร" value={totalApplied} icon="🧑" iconColor="var(--accent)" />
          <StatCard label="คัดเลือกแล้ว" value={totalAccepted} icon="✅" iconColor="#7C3AED" />
        </div>
      )}

      <Card padding={0}>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
              {showArchived ? 'ประกาศที่เก็บถาวร' : 'ประกาศของฉัน'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>เรียงตามวันที่ล่าสุด</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ width: 220 }} />
            <Button
              size="sm" variant={showArchived ? 'primary' : 'outline'}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? 'กลับไปหน้าหลัก' : `คลัง (${archivedPostings.length})`}
            </Button>
          </div>
        </CardHeader>

        <CardBody tight>
          {isLoading ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} height={52} borderRadius={8} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'ไม่พบประกาศที่ค้นหา' : showArchived ? 'ยังไม่มีประกาศที่เก็บถาวร' : 'ยังไม่มีประกาศ'}
              description={!search && !showArchived && activePostings.length === 0 ? 'สร้างประกาศรับสมัครวิชาแรกของคุณ' : undefined}
              icon="📄"
              action={!search && !showArchived && activePostings.length === 0 ? { label: 'สร้างเลย', onClick: openCreate } : undefined}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
                    {['รายวิชา', 'รับ', 'สมัคร', 'สถานะ', ''].map((h) => (
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
                    const archived = c.status === 'archived'
                    return (
                      <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                              {c.code}
                            </span>
                            {!!c.section && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                                Sec {c.section}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{displayCourseTitle(c.title, c.english_title)}</div>
                          {c.schedule && (
                            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>🕐 {c.schedule}</div>
                          )}
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
                        <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{p.slots}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{p.applied} คน</td>
                        <td style={{ padding: '14px 20px' }}><StatusBadge value={c.status} /></td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Link to={`/instructor/select?course=${c.id}`}>
                              <Button size="sm">{closed || archived ? 'ดูผลคัดเลือก' : 'ดูผู้สมัคร'}</Button>
                            </Link>
                            {archived ? (
                              <Button
                                size="sm" variant="outline"
                                loading={unarchiveMut.isPending && unarchiveMut.variables === c.id}
                                onClick={() => unarchiveMut.mutate(c.id)}
                              >
                                กู้คืน
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" title="แก้ไข" onClick={() => openEdit(c)}>
                                  <EditIcon />
                                </Button>
                                {closed ? (
                                  <>
                                    <Button
                                      size="sm" variant="outline"
                                      style={{ color: 'var(--green)', borderColor: 'var(--green)' }}
                                      loading={reopenMut.isPending && reopenMut.variables === c.id}
                                      disabled={isPastDeadline(c.deadline)}
                                      title={isPastDeadline(c.deadline) ? 'เลยวันปิดรับสมัครแล้ว แก้ไขวันที่ก่อนจึงเปิดรับใหม่ได้' : undefined}
                                      onClick={() => reopenMut.mutate(c.id)}
                                    >
                                      เปิดรับสมัคร
                                    </Button>
                                    <Button
                                      size="sm" variant="outline"
                                      title="เก็บเข้าคลัง"
                                      onClick={() => setArchiveTarget(c)}
                                    >
                                      <ArchiveIcon />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm" variant="outline" title="ปิดรับสมัคร"
                                    style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}
                                    onClick={() => setCloseTarget(c)}
                                  >
                                    <CloseIcon />
                                  </Button>
                                )}
                              </>
                            )}
                            <Button
                              size="sm" variant="outline" title="ลบประกาศ"
                              style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                              onClick={() => setDeleteTarget(c)}
                            >
                              <DeleteIcon />
                            </Button>
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

      {/* Archive Confirm Modal */}
      <Modal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="เก็บประกาศเข้าคลัง"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการเก็บประกาศ <strong>{archiveTarget?.code}</strong> เข้าคลังใช่หรือไม่?
            ประกาศจะถูกซ่อนจากรายการหลัก และสามารถกู้คืนได้ภายหลัง
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)}>ยกเลิก</Button>
            <Button
              loading={archiveMut.isPending}
              onClick={() => archiveTarget && archiveMut.mutate(archiveTarget.id)}
            >
              เก็บเข้าคลัง
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
            ต้องการลบประกาศ <strong>{deleteTarget?.code}</strong> ใช่หรือไม่?
            {(deleteTarget?.applicant_count ?? 0) > 0 && (
              <> ใบสมัครของผู้สมัคร <strong>{deleteTarget?.applicant_count}</strong> คนที่ยื่นไว้จะถูกลบทั้งหมด (ย้อนกลับไม่ได้)</>
            )}
            {' '}ตัววิชา/กลุ่มเรียนนี้จะยังคงอยู่ในระบบ (กลับไปเป็นฉบับร่าง) สามารถเลือกเปิดรับสมัครใหม่ได้อีกภายหลัง
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
