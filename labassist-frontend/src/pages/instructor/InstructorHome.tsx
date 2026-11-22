import { useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/reports/ReportIcons'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { isAxiosError } from 'axios'
import { instructorApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { Modal } from '../../components/ui/Modal'
import { CourseFormModal } from './CourseFormModal'
import { COURSE_FORM_EMPTY, splitRequirements, joinRequirements } from './_courseFormShared'
import { displayCourseTitle } from '../../utils/courseDisplay'
import { groupCourseSections, groupSectionsByTime } from '../../utils/courseGrouping'
import type { CreateCoursePayload, Course } from '../../types'
import { formatSchedule } from '../../utils/schedule'
import { deadlineInfo } from '../../utils/postingDeadline'
import { useInstructorTasks } from '../../hooks/useInstructorTasks'

// One row per course: every time slot the instructor opened for it is its own
// Course row underneath, but they're managed together here — the per-time
// breakdown lives on the applicants page (InstructorSelect).
interface Posting {
  key: string
  /** Headline row — the most "open" time, used for code/title/status. */
  course: Course
  /** Every opened time of this course, in day order. */
  sections: Course[]
  slots: number
  accepted: number
  applied: number
  /** Applicants not yet accepted/rejected. */
  pending: number
}

const ids = (p: Posting) => p.sections.map((s) => s.id)

/** "Sec 1" / "Sec 1, 2" — every section number among a posting's times. */
function secList(sections: Course[]): string {
  const secs = Array.from(new Set(sections.map((s) => s.section).filter((n): n is number => !!n))).sort((a, b) => a - b)
  return secs.length ? `Sec ${secs.join(', ')}` : ''
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

/** Search by course code, Thai/English title, or section ("1", "sec 1"). */
function matchesPosting(p: Posting, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const c = p.course
  if (c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || (c.english_title ?? '').toLowerCase().includes(q)) return true
  const sec = /^(?:sec(?:tion)?\.?\s*|กลุ่ม\s*)?(\d+)$/.exec(q)
  return !!sec && p.sections.some((s) => s.section === Number(sec[1]))
}

function DeadlineChip({ deadline, status }: { deadline?: string; status: Course['status'] }) {
  const info = deadlineInfo(deadline, status)
  if (!info || info.tone === 'closed' || info.tone === 'ok') return null
  return (
    <span className={`deadline-chip is-${info.tone}`}>
      <Icon name="alert" size={12} /> {info.label}
    </span>
  )
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
  return detail ?? fallback
}

/** The posting key carried over from a redirected ?posting= link, if any. */
function removedPostingKeyOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('removedPostingKey' in state)) return null
  const key = state.removedPostingKey
  return typeof key === 'string' && key ? key : null
}

export default function InstructorHome() {
  const [search, setSearch] = useState('')
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [form, setForm] = useState<CreateCoursePayload>(COURSE_FORM_EMPTY)
  const [minGrade, setMinGrade] = useState('')
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [editIds, setEditIds] = useState<number[]>([])
  const [editSectionLabel, setEditSectionLabel] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Posting | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Posting | null>(null)
  const [closeTarget, setCloseTarget] = useState<Posting | null>(null)
  // The posting detail page (?posting=<key>) was removed; old bookmarks and
  // links land back on this list with a notice (see legacyNotice below).
  const location = useLocation()
  const navigate = useNavigate()
  const legacyPostingKey = new URLSearchParams(location.search).get('posting')
  const removedPostingKey = removedPostingKeyOf(location.state)
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
    mutationFn: async ({ ids, data }: { ids: number[]; data: Partial<CreateCoursePayload> }) => {
      await Promise.all(ids.map((id) => instructorApi.updateCourse(id, data)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      closeModal()
      showToast('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถบันทึกได้ กรุณาลองใหม่'), 'error'),
  })

  const archiveMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => instructorApi.updateCourseStatus(id, 'archived')))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setArchiveTarget(null)
      showToast('เก็บประกาศเข้าคลังแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถเก็บเข้าคลังได้ กรุณาลองใหม่', 'error'),
  })

  const unarchiveMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => instructorApi.updateCourseStatus(id, 'closed')))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      showToast('กู้คืนประกาศแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถกู้คืนได้ กรุณาลองใหม่', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => instructorApi.deleteCourse(id)))
    },
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
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => instructorApi.updateCourseStatus(id, 'closed')))
    },
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
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => instructorApi.updateCourseStatus(id, 'open')))
    },
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
    setEditIds([])
    setShowCourseModal(true)
  }

  function closeModal() { setShowCourseModal(false); setForm(COURSE_FORM_EMPTY); setMinGrade(''); setSectionIds([]); setEditIds([]) }

  function openEdit(posting: Posting) {
    const course = posting.course
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
      schedule: groupSectionsByTime(posting.sections).map((o) => o.schedule).join('\n'),
      require_grade_proof: course.require_grade_proof,
    })
    setMinGrade(grade)
    setEditIds(ids(posting))
    setEditSectionLabel(secList(posting.sections))
    setShowCourseModal(true)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.labboy_slots < 0) {
      showToast('จำนวน Lab Boy ต้องไม่น้อยกว่า 0', 'error')
      return
    }
    const data = { ...form, requirements: joinRequirements(minGrade, form.requirements ?? '') }
    if (editIds.length === 1) {
      updateMut.mutate({ ids: editIds, data })
    } else if (editIds.length > 1) {
      // Several times share these posting settings; leave each row's own
      // section/schedule alone.
      const { labboy_slots, status, deadline, description, requirements, require_grade_proof } = data
      updateMut.mutate({ ids: editIds, data: { labboy_slots, status, deadline, description, requirements, require_grade_proof } })
    } else {
      if (sectionIds.length === 0) return
      const { labboy_slots, auto_labboy_slots, status, deadline, description, requirements, require_grade_proof } = data
      openSectionsMut.mutate({ ids: sectionIds, data: { labboy_slots, auto_labboy_slots, status, deadline, description, requirements, require_grade_proof } })
    }
  }

  const appliedById = useMemo(() => {
    const m = new Map<number, number>()
    courses.forEach((c, i) => {
      const applicants = applicantQueries[i]?.data ?? []
      m.set(c.id, applicants.filter((a) => a.status !== 'withdrawn').length)
    })
    return m
  }, [courses, applicantQueries])

  const pendingById = useMemo(() => {
    const m = new Map<number, number>()
    courses.forEach((c, i) => {
      m.set(c.id, (applicantQueries[i]?.data ?? []).filter((a) => a.status === 'pending').length)
    })
    return m
  }, [courses, applicantQueries])

  const toPostings = useMemo(() => (rows: Course[]): Posting[] =>
    groupCourseSections(rows).map((g) => {
      const sections = groupSectionsByTime(g.sections).flatMap((o) => o.sections)
      return {
        key: g.key,
        course: sections.find((s) => s.status === g.status) ?? sections[0],
        sections,
        slots: g.totalSlots,
        accepted: g.totalAccepted,
        applied: sections.reduce((n, s) => n + (appliedById.get(s.id) ?? 0), 0),
        pending: sections.reduce((n, s) => n + (pendingById.get(s.id) ?? 0), 0),
      }
    }), [appliedById, pendingById])

  // Draft rows are just unopened sections from the Excel import — the
  // instructor picks among them via SectionCatalogPicker when creating a
  // posting, so they don't need to also clutter this list until opened.
  const activePostings = useMemo(() => toPostings(courses.filter((c) => c.status !== 'archived' && c.status !== 'draft')), [courses, toPostings])
  const archivedPostings = useMemo(() => toPostings(courses.filter((c) => c.status === 'archived')), [courses, toPostings])

  const filtered = useMemo(() => {
    const base = showArchived ? archivedPostings : activePostings
    return base.filter((p) => matchesPosting(p, search))
  }, [activePostings, archivedPostings, showArchived, search])

  const { tasks } = useInstructorTasks()
  const deleteApplicants = deleteTarget?.sections.reduce((n, x) => n + (x.applicant_count ?? 0), 0) ?? 0

  const openCount = activePostings.filter((p) => p.course.status === 'open' || p.course.status === 'closing_soon').length
  const totalApplied = activePostings.reduce((s, p) => s + p.applied, 0)
  const totalAccepted = activePostings.reduce((s, p) => s + p.accepted, 0)

  // A link to the removed detail page: say so, and point at the row that
  // still manages that posting when the key is still valid.
  const removedPosting = removedPostingKey
    ? [...activePostings, ...archivedPostings].find((p) => p.key === removedPostingKey) ?? null
    : null
  const dismissLegacyNotice = () => navigate(location.pathname, { replace: true, state: null })
  const showRemovedPosting = (p: Posting) => {
    setShowArchived(p.course.status === 'archived')
    setSearch(p.course.code)
    dismissLegacyNotice()
  }
  const postingByKey = new Map([...activePostings, ...archivedPostings].map((p) => [p.key, p]))

  if (legacyPostingKey) {
    return <Navigate to="/instructor/home" replace state={{ removedPostingKey: legacyPostingKey }} />
  }

  return (
    <div>
      <ReportPageHeader
        title="หน้าหลัก"
        subtitle="ภาพรวมประกาศรับสมัคร Lab Boy ของคุณ"
        actions={<Button onClick={openCreate} aria-label="สร้างประกาศรับสมัคร Lab Boy ใหม่">+ สร้างประกาศ</Button>}
      />

      {removedPostingKey && !isLoading && (
        <div className="legacy-posting-notice" role="status">
          <Icon name="alert" size={16} />
          <div className="legacy-posting-text">
            หน้ารายละเอียดประกาศถูกนำออกจากระบบแล้ว
            {removedPosting
              ? <> — ประกาศ <strong>{removedPosting.course.code}</strong> ยังจัดการได้จากแถวในตารางด้านล่าง (ดูผู้สมัคร แก้ไข ปิดรับ ลบ)</>
              : ' — ไม่พบประกาศจากลิงก์เดิม ประกาศอาจถูกลบไปแล้ว'}
          </div>
          <div className="legacy-posting-actions">
            {removedPosting && (
              <Button size="sm" variant="outline" onClick={() => showRemovedPosting(removedPosting)}>แสดงประกาศนี้</Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismissLegacyNotice}>ปิด</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard label="ประกาศของฉัน" value={activePostings.length} icon={<Icon name="file" size={22} />} iconColor="var(--primary)" />
          <StatCard label="เปิดรับอยู่" value={openCount} icon={<Icon name="clock" size={22} />} iconColor="var(--green)" />
          <StatCard label="รวมผู้สมัคร" value={totalApplied} icon={<Icon name="users" size={22} />} iconColor="var(--accent)" />
          <StatCard label="คัดเลือกแล้ว" value={totalAccepted} icon={<Icon name="check" size={22} />} iconColor="var(--amber)" />
        </div>
      )}

      {!isLoading && !showArchived && tasks.length > 0 && (
          <Card className="task-card" style={{ padding: '14px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="task-card-icon"><Icon name="alert" size={15} /></span> งานที่ต้องทำ ({tasks.length})
            </div>
            <div style={{ marginTop: 4 }}>
              {tasks.map((t) => (
                <div key={t.key} className="task-row">
                  <div style={{ minWidth: 0, fontSize: 13, color: 'var(--ink-800)' }}>
                    <strong>{t.code}</strong> {t.title}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {t.deadline && <span className={`deadline-chip is-${t.deadline.tone}`}>{t.deadline.label}</span>}
                      {t.pending > 0 && <span className="deadline-chip is-soon">มีผู้สมัครรอคัดเลือก {t.pending} คน</span>}
                    </div>
                  </div>
                  <div className="task-row-actions">
                    {t.pending > 0 && (
                      <Link to={`/instructor/select?course=${t.courseId}`}>
                        <Button size="sm" aria-label={`คัดเลือกผู้สมัคร ${t.code}`}>คัดเลือก</Button>
                      </Link>
                    )}
                    {t.deadline && postingByKey.has(t.key) && (
                      <Button
                        size="sm" variant="outline" aria-label={`แก้ไขประกาศ ${t.code}`}
                        onClick={() => { const p = postingByKey.get(t.key); if (p) openEdit(p) }}
                      >
                        <EditIcon /> <span style={{ marginLeft: 5 }}>แก้ไข</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
      )}

      <Card padding={0}>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
              {showArchived ? 'ประกาศที่เก็บถาวร' : 'ประกาศของฉัน'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>เรียงตามวันที่ล่าสุด</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อวิชา / รหัสวิชา / Section"
              aria-label="ค้นหาประกาศจากชื่อวิชา รหัสวิชา หรือ Section"
              style={{ width: 'min(280px, 100%)' }}
            />
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
              title={search ? `ไม่พบประกาศที่ตรงกับ “${search.trim()}”` : showArchived ? 'ยังไม่มีประกาศที่เก็บถาวร' : 'ยังไม่มีประกาศ'}
              description={
                search ? 'ลองค้นหาด้วยชื่อวิชา รหัสวิชา หรือเลข Section เช่น “2” / “Sec 2” หรือล้างคำค้นหา'
                : showArchived ? 'ประกาศที่เก็บเข้าคลังจะแสดงที่นี่ และกู้คืนได้ภายหลัง'
                : 'สร้างประกาศรับสมัครวิชาแรกของคุณ เพื่อเริ่มรับสมัคร Lab Boy'
              }
              icon={<Icon name="file" size={40} />}
              action={search ? { label: 'ล้างคำค้นหา', onClick: () => setSearch('') } : !showArchived ? { label: 'สร้างประกาศ', onClick: openCreate } : undefined}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table posting-table">
                <thead>
                  <tr>
                    {['รายวิชา', 'ปิดรับสมัคร', 'ความคืบหน้า', 'สถานะ', 'การดำเนินการ'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'การดำเนินการ' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const c = p.course
                    const closed = c.status === 'closed'
                    const archived = c.status === 'archived'
                    const secLabel = secList(p.sections)
                    const deadline = p.sections.map((s) => s.deadline).filter((d): d is string => !!d).sort()[0]
                    const openIds = p.sections.filter((s) => s.status === 'open' || s.status === 'closing_soon').map((s) => s.id)
                    const closedIds = p.sections.filter((s) => s.status === 'closed').map((s) => s.id)
                    const pct = p.slots > 0 ? Math.min(100, Math.round((p.accepted / p.slots) * 100)) : 0
                    return (
                      <tr key={p.key}>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                              {c.code}
                            </span>
                            {secLabel && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                                {secLabel}
                              </span>
                            )}
                          </div>
                          <div className="posting-title">{displayCourseTitle(c.title, c.english_title)}</div>
                          {groupSectionsByTime(p.sections).filter((o) => o.schedule).map((o) => (
                            <div key={o.key} style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2, whiteSpace: 'pre-line' }}>{formatSchedule(o.schedule)}</div>
                          ))}
                          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>ภาคเรียนที่ {c.semester}</div>
                        </td>
                        <td data-label="ปิดรับสมัคร">
                          {deadline ? (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)', whiteSpace: 'nowrap' }}>
                                {new Date(deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </div>
                              <div style={{ marginTop: 4 }}><DeadlineChip deadline={deadline} status={c.status} /></div>
                            </>
                          ) : (
                            <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>ไม่กำหนด</span>
                          )}
                        </td>
                        <td data-label="ความคืบหน้า" style={{ minWidth: 170 }}>
                          <div style={{ fontSize: 13, color: 'var(--ink-800)' }}>
                            รับ <strong>{p.slots}</strong> · สมัคร <strong>{p.applied}</strong> · คัดเลือก <strong>{p.accepted}</strong>
                          </div>
                          <div
                            className="progress-track" role="progressbar"
                            aria-label={`คัดเลือกแล้ว ${p.accepted} จาก ${p.slots} คน`}
                            aria-valuemin={0} aria-valuemax={p.slots} aria-valuenow={Math.min(p.accepted, p.slots)}
                          >
                            <div className={`progress-fill${pct >= 100 ? ' is-full' : ''}`} style={{ width: `${pct}%` }} />
                          </div>
                          {p.pending > 0 && !archived && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber-ink)', marginTop: 4 }}>รอคัดเลือก {p.pending} คน</div>
                          )}
                        </td>
                        <td data-label="สถานะ"><StatusBadge value={c.status} /></td>
                        <td>
                          <div className="posting-actions">
                            <Link to={`/instructor/select?course=${p.sections[0].id}`}>
                              <Button size="sm" aria-label={`${closed || archived ? 'ดูผลคัดเลือก' : 'ดูผู้สมัคร'} ${c.code}`}>{closed || archived ? 'ดูผลคัดเลือก' : 'ดูผู้สมัคร'}</Button>
                            </Link>
                            {archived ? (
                              <Button
                                size="sm" variant="outline"
                                aria-label={`กู้คืนประกาศ ${c.code}`}
                                loading={unarchiveMut.isPending && unarchiveMut.variables?.[0] === p.sections[0].id}
                                onClick={() => unarchiveMut.mutate(ids(p))}
                              >
                                กู้คืน
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" title="แก้ไขรายละเอียดประกาศ" aria-label={`แก้ไขประกาศ ${c.code}`} onClick={() => openEdit(p)}>
                                  <EditIcon /> <span style={{ marginLeft: 5 }}>แก้ไข</span>
                                </Button>
                                {closed ? (
                                  <>
                                    <Button
                                      size="sm" variant="outline"
                                      style={{ color: 'var(--green)', borderColor: 'var(--green)' }}
                                      aria-label={`เปิดรับสมัครอีกครั้ง ${c.code}`}
                                      loading={reopenMut.isPending && reopenMut.variables?.[0] === closedIds[0]}
                                      disabled={isPastDeadline(deadline)}
                                      title={isPastDeadline(deadline) ? 'เลยวันปิดรับสมัครแล้ว แก้ไขวันที่ก่อนจึงเปิดรับใหม่ได้' : 'เปิดรับสมัครอีกครั้ง'}
                                      onClick={() => reopenMut.mutate(closedIds)}
                                    >
                                      เปิดรับสมัคร
                                    </Button>
                                    <Button
                                      size="sm" variant="outline"
                                      title="เก็บประกาศเข้าคลัง (กู้คืนได้)" aria-label={`เก็บประกาศ ${c.code} เข้าคลัง`}
                                      onClick={() => setArchiveTarget(p)}
                                    >
                                      <ArchiveIcon /> <span style={{ marginLeft: 5 }}>เก็บเข้าคลัง</span>
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm" variant="outline" title="ปิดรับสมัคร — นักศึกษาจะสมัครไม่ได้อีก" aria-label={`ปิดรับสมัคร ${c.code}`}
                                    style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}
                                    disabled={openIds.length === 0}
                                    onClick={() => setCloseTarget(p)}
                                  >
                                    <CloseIcon /> <span style={{ marginLeft: 5 }}>ปิดรับ</span>
                                  </Button>
                                )}
                              </>
                            )}
                            <Button
                              size="sm" variant="outline" title="ลบประกาศ (ต้องยืนยันก่อน)" aria-label={`ลบประกาศ ${c.code}`}
                              style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                              onClick={() => setDeleteTarget(p)}
                            >
                              <DeleteIcon /> <span style={{ marginLeft: 5 }}>ลบ</span>
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
        editId={editIds[0] ?? null}
        editSectionLabel={editSectionLabel}
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
            ต้องการเก็บประกาศ <strong>{archiveTarget?.course.code}</strong> เข้าคลังใช่หรือไม่?
            ประกาศจะถูกซ่อนจากรายการหลัก และสามารถกู้คืนได้ภายหลัง
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)}>ยกเลิก</Button>
            <Button
              loading={archiveMut.isPending}
              onClick={() => archiveTarget && archiveMut.mutate(ids(archiveTarget))}
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
            ต้องการลบประกาศ <strong>{deleteTarget?.course.code}</strong> ใช่หรือไม่?
            {deleteApplicants > 0 && (
              <> ใบสมัครของผู้สมัคร <strong>{deleteApplicants}</strong> คนที่ยื่นไว้จะถูกลบทั้งหมด (ย้อนกลับไม่ได้)</>
            )}
            {' '}ตัววิชา/กลุ่มเรียนนี้จะยังคงอยู่ในระบบ (กลับไปเป็นฉบับร่าง) สามารถเลือกเปิดรับสมัครใหม่ได้อีกภายหลัง
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(ids(deleteTarget))}
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
            ต้องการปิดรับสมัครประกาศ <strong>{closeTarget?.course.code}</strong> ใช่หรือไม่?
            นักศึกษาจะเห็นว่าวิชานี้ปิดรับสมัครแล้วและจะสมัครไม่ได้อีก
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setCloseTarget(null)}>ยกเลิก</Button>
            <Button
              loading={closeMut.isPending}
              onClick={() => closeTarget && closeMut.mutate(closeTarget.sections.filter((x) => x.status === 'open' || x.status === 'closing_soon').map((x) => x.id))}
            >
              ปิดรับสมัคร
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
