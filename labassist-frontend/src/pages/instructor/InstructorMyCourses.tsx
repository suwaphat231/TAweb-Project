import { useMemo, useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { instructorApi } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/reports/ReportIcons'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { useToast } from '../../hooks/useToast'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { Application, Course, CourseEditRequest, CourseRelation } from '../../types'
import { curriculumSuffixes, groupMyCourses, matchesMyCourse, sameTitleOtherCodes, sectionSlots, sectionsOf, type MyCourseGroup, type MySection, type MySlot } from '../../utils/myCourseGroups'
import { formatSchedule, THAI_DAY_NAMES } from '../../utils/schedule'
import { CourseEditRequestModal } from './CourseEditRequestModal'

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

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
  return detail ?? fallback
}

const currentYear = new Date().getFullYear() + 543

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mc-field">
      <span className="mc-field-label">{label}</span>
      <span className="mc-field-value">{value || '—'}</span>
    </div>
  )
}

// The latest edit request for a course — pending, rejected or approved.
function EditRequestStatus({ req, onCancel, cancelling }: { req: CourseEditRequest; onCancel: () => void; cancelling: boolean }) {
  const tone = {
    pending:  { bg: 'var(--primary-50)', border: 'var(--primary-100)', color: 'var(--primary-700)', text: 'คำขอแก้ไขรายละเอียดวิชากำลังรอแอดมินอนุมัติ' },
    rejected: { bg: 'var(--red-bg)', border: 'var(--red-line)', color: 'var(--red-ink)', text: 'แอดมินไม่อนุมัติคำขอแก้ไขล่าสุด' },
    approved: { bg: 'var(--green-bg)', border: 'var(--green-line)', color: 'var(--green-ink)', text: 'แอดมินอนุมัติคำขอแก้ไขล่าสุดแล้ว' },
  }[req.status]
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: '8px 12px',
    }}>
      <div style={{ fontSize: 13, color: tone.color }}>
        <div style={{ fontWeight: 600 }}>{tone.text}</div>
        {req.status === 'rejected' && req.reject_reason && (
          <div style={{ fontSize: 12, marginTop: 2 }}>เหตุผล: {req.reject_reason}</div>
        )}
      </div>
      {req.status === 'pending' && (
        <Button size="sm" variant="ghost" loading={cancelling} onClick={onCancel} style={{ color: tone.color }}>
          ยกเลิกคำขอ
        </Button>
      )}
    </div>
  )
}

export default function InstructorMyCourses() {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSemester, setPickerSemester] = useState('1')
  const [pickerYear, setPickerYear] = useState(currentYear)
  const [pickerSearch, setPickerSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CourseRelation | null>(null)
  const [editTarget, setEditTarget] = useState<Course | null>(null)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: relations = [], isLoading } = useQuery({
    queryKey: ['instructor-my-courses'],
    queryFn: () => instructorApi.myCourses(),
  })

  // Every course the instructor teaches is listed with its details — drafts
  // included, since the details are worth checking before recruiting opens.
  const displayRelations = relations

  // One card per course; each Sec the instructor holds is a line inside it.
  const groups = useMemo(() => groupMyCourses(relations), [relations])
  const visibleGroups = useMemo(() => {
    if (!search.trim()) return groups
    return groups.filter((g) => g.rels.some(({ course }) => matchesMyCourse(course, search)))
  }, [groups, search])
  const importedGroups = visibleGroups.filter((g) => g.source === 'imported')
  const selfAddedGroups = visibleGroups.filter((g) => g.source === 'self_added')

  // Cards whose details are expanded inline (group keys) — several at once.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set())
  const toggleOpen = (key: string) => setOpenKeys((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // A combined classlist code can represent 165 and 2560 sharing the same
  // schedule. Keep one card, and let the user switch the curriculum view.
  const [curriculumByGroup, setCurriculumByGroup] = useState<Record<string, string>>({})
  const selectCurriculum = (key: string, suffix: string) =>
    setCurriculumByGroup((prev) => ({ ...prev, [key]: suffix }))

  // Section panels inside an open course. A course with one or two Sections
  // opens them all — that is still short — while a longer one starts
  // collapsed so the page doesn't grow past a screen. Keys the user toggled
  // flip that default.
  const [secToggled, setSecToggled] = useState<Set<string>>(() => new Set())
  const isSecOpen = (key: string, sectionCount: number) => (sectionCount <= 2) !== secToggled.has(key)
  const toggleSec = (key: string) => setSecToggled((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const { data: editRequests = [] } = useQuery({
    queryKey: ['instructor-course-edit-requests'],
    queryFn: () => instructorApi.myCourseEditRequests(),
  })
  // The API lists newest first, so the first one seen per course is the latest.
  const latestRequest = new Map<number, CourseEditRequest>()
  for (const r of editRequests) if (!latestRequest.has(r.course_id)) latestRequest.set(r.course_id, r)

  const cancelRequestMut = useMutation({
    mutationFn: (id: number) => instructorApi.cancelCourseEditRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-course-edit-requests'] })
      showToast('ยกเลิกคำขอแก้ไขแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ยกเลิกคำขอไม่สำเร็จ'), 'error'),
  })

  // Only fetch applicants for 'imported' courses — self_added rows do not grant
  // management rights so the endpoint will 403 for those.
  const applicantQueries = useQueries({
    queries: displayRelations.map((r) => ({
      queryKey: ['course-applicants', r.course.id],
      queryFn: () => instructorApi.applicants(r.course.id),
      enabled: r.source === 'imported',
    })),
  })

  const { data: candidates = [], isFetching: candidatesLoading } = useQuery({
    queryKey: ['course-candidates', pickerSemester, pickerYear, pickerSearch],
    queryFn: () => instructorApi.courseCandidates({
      semester: pickerSemester,
      academic_year: pickerYear,
      q: pickerSearch || undefined,
    }),
    enabled: showPicker,
  })

  const addMut = useMutation({
    mutationFn: (courseId: number) => instructorApi.addMyCourse(courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-my-courses'] })
      qc.invalidateQueries({ queryKey: ['course-candidates'] })
      showToast('เพิ่มวิชาเรียบร้อยแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถเพิ่มวิชาได้'), 'error'),
  })

  const removeMut = useMutation({
    mutationFn: (relationId: number) => instructorApi.removeMyCourse(relationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-my-courses'] })
      setDeleteTarget(null)
      showToast('ยกเลิกการเชื่อมโยงวิชาแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถยกเลิกการเชื่อมโยงได้'), 'error'),
  })

  // Accepted Lab Boys per course id (imported courses only; see applicantQueries).
  const acceptedById = new Map<number, Application[]>()
  displayRelations.forEach((r, i) => {
    acceptedById.set(r.course.id, (applicantQueries[i]?.data ?? []).filter((a) => a.status === 'accepted'))
  })

  /** Accepted Lab Boys of a Sec, one entry per student even if they hold several days. */
  const acceptedOf = (rels: CourseRelation[]) => {
    const seen = new Set<number>()
    return rels.flatMap((r) => acceptedById.get(r.course.id) ?? [])
      .filter((a) => (seen.has(a.student_id) ? false : (seen.add(a.student_id), true)))
  }

  function renderGroup(g: MyCourseGroup) {
    const c = g.head
    const imported = g.source === 'imported'
    const open = openKeys.has(g.key)
    const panelId = `mc-panel-${g.rels[0].id}`
    const sectionCount = sectionsOf(g.rels).length
    const curricula = curriculumSuffixes(c.code)
    const combinedCurricula = curricula.length > 1
    const selectedCurriculum = curriculumByGroup[g.key] ?? curricula[0] ?? ''
    const firstSuffixIndex = c.code.search(/-\s*[0-9A-Za-z]+/)
    const baseCode = firstSuffixIndex >= 0 ? c.code.slice(0, firstSuffixIndex).trim() : c.code
    const displayCode = combinedCurricula ? `${baseCode}-${selectedCurriculum}` : c.code
    const twins = sameTitleOtherCodes(groups, g)
    const labBoyTotal = imported ? sectionsOf(g.rels).reduce((n, sec) => n + acceptedOf(sec.rels).length, 0) : 0
    const pendingCount = imported
      ? g.rels.filter((r) => latestRequest.get(r.course.id)?.status === 'pending').length
      : 0
    const rejectedCount = imported
      ? g.rels.filter((r) => latestRequest.get(r.course.id)?.status === 'rejected').length
      : 0
    return (
      <Card key={g.key} padding={0} className={`course-card ${imported ? 'is-imported' : 'is-self'}${open ? ' is-open' : ''}`}>
        <div className="mc-head">
          <div className="mc-head-main">
            {/* The code is the data's code, unchanged — the curriculum tabs only appear inside the details. */}
            <div className="mc-code">{c.code}</div>
            <h3 className="mc-title">{displayCourseTitle(c.title, c.english_title)}</h3>
            <div className="mc-sub">ภาคเรียนที่ {c.semester} · ปีการศึกษา {c.academic_year}</div>
            <div className="mc-chips">
              <Badge variant="gray">{sectionCount} Section</Badge>
              {imported
                ? <Badge variant={labBoyTotal > 0 ? 'blue' : 'gray'}>Lab Boy {labBoyTotal} คน</Badge>
                : <Badge variant="amber"><LockIcon /> เพิ่มเอง · ดูได้อย่างเดียว</Badge>}
            </div>
            {twins.length > 0 && (
              <div className="mc-twin">
                ชื่อวิชาเดียวกับรหัส {twins.join(' / ')} — แยกการ์ดตามรหัสวิชาในระบบ
              </div>
            )}
          </div>
          <Button
            size="sm" variant="outline"
            className="mc-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? 'ซ่อน' : 'แสดง'}รายละเอียดวิชา ${c.code}`}
            onClick={() => toggleOpen(g.key)}
          >
            รายละเอียด
            <svg className="mc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>
        </div>

        {(pendingCount > 0 || rejectedCount > 0) && (
          <div className="mc-note" role="status">
            {pendingCount > 0 && <>มีคำขอแก้ไขรออนุมัติ {pendingCount} รายการ</>}
            {pendingCount > 0 && rejectedCount > 0 && ' · '}
            {rejectedCount > 0 && <>คำขอแก้ไขไม่ได้รับอนุมัติ {rejectedCount} รายการ</>}
          </div>
        )}

        <div id={panelId} className="mc-collapse" data-open={open} inert={!open} aria-hidden={!open}>
          <div className="mc-collapse-inner">
            {renderDetail(g, displayCode)}
          </div>
        </div>
      </Card>
    )
  }

  function renderDetail(g: MyCourseGroup, displayCode: string) {
    const c = g.head
    const uid = g.rels[0].id
    const sections = sectionsOf(g.rels)
    const curricula = curriculumSuffixes(c.code)
    const combinedCurricula = curricula.length > 1
    const selectedCurriculum = curriculumByGroup[g.key] ?? curricula[0] ?? ''
    return (
      <div className="mc-detail">
        {combinedCurricula && (
          <div className="mc-curr-bar">
            <span className="mc-curr-label" id={`mc-curr-label-${uid}`}>หลักสูตร</span>
            <div className="mc-curricula" role="tablist" aria-labelledby={`mc-curr-label-${uid}`}>
              {curricula.map((x, i) => (
                <button
                  type="button"
                  key={x}
                  id={`mc-tab-${uid}-${x}`}
                  role="tab"
                  aria-selected={selectedCurriculum === x}
                  aria-controls={`mc-tabpanel-${uid}`}
                  tabIndex={selectedCurriculum === x ? 0 : -1}
                  className="mc-curriculum-tab"
                  onClick={() => selectCurriculum(g.key, x)}
                  onKeyDown={(e) => {
                    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                    const target = e.key === 'Home' ? 0 : e.key === 'End' ? curricula.length - 1
                      : step ? (i + step + curricula.length) % curricula.length : -1
                    if (target < 0) return
                    e.preventDefault()
                    selectCurriculum(g.key, curricula[target])
                    document.getElementById(`mc-tab-${uid}-${curricula[target]}`)?.focus()
                  }}
                >
                  -{x}
                </button>
              ))}
            </div>
            <span className="mc-curr-hint">ตารางเรียนและรายชื่อ Lab Boy ใช้ร่วมกันทั้งสองหลักสูตร</span>
          </div>
        )}
        <div
          className="mc-detail-body"
          {...(combinedCurricula
            ? { role: 'tabpanel', id: `mc-tabpanel-${uid}`, 'aria-labelledby': `mc-tab-${uid}-${selectedCurriculum}` }
            : {})}
        >
          <section className="mc-info" aria-labelledby={`mc-d-info-${uid}`}>
            <h4 id={`mc-d-info-${uid}`} className="mc-d-title">ข้อมูลวิชา</h4>
            <div className="mc-d-grid">
              <div className="mc-field mc-field-code">
                <span className="mc-field-label">รหัสวิชา</span>
                <span key={displayCode} className="mc-field-value mc-swap">{displayCode}</span>
              </div>
              <DetailRow label="ชื่อวิชา (อังกฤษ)" value={c.english_title} />
              <DetailRow label="หน่วยกิต" value={c.credits} />
            </div>
          </section>

          <section aria-labelledby={`mc-d-secs-${uid}`}>
            <h4 id={`mc-d-secs-${uid}`} className="mc-d-title">
              Section <span className="mc-muted">({sections.length})</span>
            </h4>
            <div className="mc-secs">
              {sections.map((sec) => renderSection(g, sec, sections.length, displayCode))}
            </div>
          </section>
        </div>
      </div>
    )
  }

  /** One Section: header (name · days · Lab Boy count) that opens its meeting times and Lab Boys. */
  function renderSection(g: MyCourseGroup, sec: MySection, sectionCount: number, displayCode: string) {
    const imported = g.source === 'imported'
    const key = `${g.key}|${sec.section ?? 'none'}`
    const open = isSecOpen(key, sectionCount)
    const domId = `mc-sec-${g.rels[0].id}-${sec.section ?? 'none'}`
    const name = sec.section ? `Section ${sec.section}` : 'ไม่ระบุ Section'
    const slots = sectionSlots(sec)
    const people = imported ? acceptedOf(sec.rels) : []
    const seats = sec.rels.reduce((n, r) => n + r.course.labboy_slots, 0)
    const filled = sec.rels.reduce((n, r) => n + r.course.labboy_accepted, 0)
    const days = Array.from(new Set(sec.meetings.map((m) => THAI_DAY_NAMES[m.dayIndex])))
    const daySummary = days.length > 0 ? days.join(' · ') : sec.raw.length > 0 ? 'ดูเวลาในรายละเอียด' : 'ยังไม่ระบุเวลา'
    return (
      <div key={key} className="mc-sec" data-open={open}>
        <h5 className="mc-sec-h">
          <button
            type="button"
            className="mc-sec-toggle"
            id={`${domId}-btn`}
            aria-expanded={open}
            aria-controls={`${domId}-panel`}
            onClick={() => toggleSec(key)}
          >
            <span className="mc-sec-name">
              {name}
              <span key={displayCode} className="mc-sec-code mc-swap">{displayCode}</span>
            </span>
            <span className="mc-sec-meta">
              <span className="mc-sec-days"><Icon name="calendar" size={13} /> {daySummary}</span>
              {imported && (
                <Badge variant={seats === 0 ? 'gray' : filled >= seats ? 'green' : 'blue'}>
                  {seats > 0 ? `Lab Boy ${filled}/${seats}` : 'ไม่เปิดรับ'}
                </Badge>
              )}
            </span>
            <svg className="mc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </h5>

        <div
          id={`${domId}-panel`} role="region" aria-labelledby={`${domId}-btn`}
          className="mc-collapse" data-open={open} inert={!open} aria-hidden={!open}
        >
          <div className="mc-collapse-inner">
            <div className="mc-sec-body">
              <div className="mc-sec-col">
                <div className="mc-sec-label">คาบเรียน</div>
                <ul className="mc-slots">
                  {slots.map((slot) => renderSlot(g, sec, slot, displayCode))}
                </ul>
              </div>
              <div className="mc-sec-col">
                <div className="mc-sec-label">Lab Boy</div>
                {!imported ? (
                  <div className="mc-readonly mc-empty"><LockIcon /> ดูได้เฉพาะวิชาจากตารางสอนจริง</div>
                ) : people.length === 0 ? (
                  <div className="mc-empty mc-muted">
                    <Icon name="users" size={16} />
                    {seats > 0 ? 'ยังไม่มี Lab Boy ที่ได้รับคัดเลือก' : 'Section นี้ไม่เปิดรับ Lab Boy'}
                  </div>
                ) : (
                  <ul className="mc-d-people">
                    {people.map((a) => (
                      <li key={a.id}>
                        <Avatar size={32} />
                        <div className="mc-person">
                          <div className="mc-d-name">{a.student_name}</div>
                          <div className="mc-person-code">{a.student_code || '—'}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** One meeting time of a Section, with the edit / unlink action for its row. */
  function renderSlot(g: MyCourseGroup, sec: MySection, slot: MySlot, displayCode: string) {
    const imported = g.source === 'imported'
    const rel = slot.rels[0]
    const req = imported ? slot.rels.map((r) => latestRequest.get(r.course.id)).find(Boolean) : undefined
    const pendingEdit = req?.status === 'pending'
    const when = slot.meetings.length > 0
      ? slot.meetings.map((m) => `${THAI_DAY_NAMES[m.dayIndex]} ${m.start}–${m.end}`).join(', ')
      : slot.raw ?? 'ยังไม่ระบุวันและเวลาเรียน'
    const label = [displayCode, sec.section ? `Section ${sec.section}` : '', when].filter(Boolean).join(' ')
    return (
      <li key={rel.id} className="mc-slot">
        <div className="mc-slot-main">
          <div className="mc-slot-text">
            {slot.meetings.length > 0 ? slot.meetings.map((m, i) => (
              <div key={i} className="mc-slot-line">
                <span className="mc-day">{THAI_DAY_NAMES[m.dayIndex]}</span>
                <span className="mc-time">{m.start}–{m.end}</span>
                {m.room && <span className="mc-room">ห้อง {m.room}</span>}
              </div>
            )) : (
              <div className={`mc-slot-line${slot.raw ? '' : ' mc-muted'}`}>{when}</div>
            )}
          </div>
          {imported ? (
            <Button
              size="sm" variant="ghost" disabled={pendingEdit}
              className="mc-slot-action"
              title={pendingEdit ? 'มีคำขอแก้ไขรออนุมัติอยู่' : 'ขอแก้ไขรายละเอียดวิชา (แอดมินเป็นผู้อนุมัติ)'}
              aria-label={`ขอแก้ไขรายละเอียด ${label}`}
              onClick={() => setEditTarget(rel.course)}
            >
              {pendingEdit ? 'รออนุมัติ' : 'ขอแก้ไข'}
            </Button>
          ) : (
            <Button
              size="sm" variant="ghost"
              className="mc-slot-action"
              title="เอาวิชานี้ออกจากรายการของคุณ (ข้อมูลวิชายังอยู่ในระบบ)"
              aria-label={`ยกเลิกการเชื่อมโยงวิชา ${label}`}
              style={{ color: 'var(--red)' }}
              onClick={() => setDeleteTarget(rel)}
            >
              <DeleteIcon />
            </Button>
          )}
        </div>
        {req && (
          <EditRequestStatus
            req={req}
            onCancel={() => cancelRequestMut.mutate(req.id)}
            cancelling={cancelRequestMut.isPending && cancelRequestMut.variables === req.id}
          />
        )}
      </li>
    )
  }

  return (
    <div>
      <ReportPageHeader
        title="วิชาของฉัน"
        subtitle="รายวิชาที่คุณรับผิดชอบ และ Lab Boy ที่ผ่านการคัดเลือกในแต่ละ Section"
        actions={<Button onClick={() => setShowPicker(true)} aria-label="เพิ่มวิชาที่ไม่อยู่ในตารางสอนของคุณด้วยตนเอง"><LinkIcon /> <span style={{ marginLeft: 6 }}>เพิ่มวิชาเอง</span></Button>}
      />

      {isLoading ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={120} borderRadius={12} />)}
        </div>
      ) : displayRelations.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายวิชา"
          description="วิชาที่คุณสอนตามตารางสอนจะแสดงที่นี่อัตโนมัติ หรือกด “เพิ่มวิชาเอง” เพื่อติดตามวิชาอื่น"
          icon={<Icon name="book" size={40} />}
          action={{ label: 'เพิ่มวิชาเอง', onClick: () => setShowPicker(true) }}
        />
      ) : (
        <>
          <div className="mc-search">
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อวิชา / รหัสวิชา / Section"
              aria-label="ค้นหาวิชาจากชื่อวิชา รหัสวิชา หรือ Section"
            />
          </div>

          {visibleGroups.length === 0 && (
            <EmptyState
              title={`ไม่พบวิชาที่ตรงกับ “${search.trim()}”`}
              description="ลองค้นหาด้วยชื่อวิชา รหัสวิชา หรือเลข Section เช่น “2” / “Sec 2”"
              icon={<Icon name="search" size={40} />}
              action={{ label: 'ล้างคำค้นหา', onClick: () => setSearch('') }}
            />
          )}

          {importedGroups.length > 0 && (
            <section aria-labelledby="mc-imported">
              <h2 id="mc-imported" className="mc-section-title">
                วิชาที่สอนตามตารางสอน <span>({importedGroups.length})</span>
              </h2>
              <div style={{ display: 'grid', gap: 14 }}>
                {importedGroups.map((g) => renderGroup(g))}
              </div>
            </section>
          )}

          {selfAddedGroups.length > 0 && (
            <section aria-labelledby="mc-self" style={{ marginTop: importedGroups.length > 0 ? 28 : 0 }}>
              <h2 id="mc-self" className="mc-section-title">
                วิชาที่เพิ่มเอง · ดูเท่านั้น <span>({selfAddedGroups.length})</span>
              </h2>
              <p className="mc-section-note">
                <LockIcon /> เพิ่มไว้เพื่อติดตามเท่านั้น — การดูผู้สมัคร อนุมัติใบสมัคร และแก้ไขประกาศ ทำได้เฉพาะวิชาจากตารางสอนจริง
              </p>
              <div style={{ display: 'grid', gap: 14 }}>
                {selfAddedGroups.map((g) => renderGroup(g))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Course Picker Modal — link to an existing course from the catalog */}
      <Modal isOpen={showPicker} onClose={() => setShowPicker(false)} title="เพิ่มวิชาเอง" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
            เลือกวิชาที่ต้องการติดตาม — วิชาที่เพิ่มด้วยตนเองจะปรากฏในรายการแต่
            <strong style={{ color: 'var(--amber-ink)' }}> ไม่ได้รับสิทธิ์จัดการ</strong> จนกว่าระบบจะยืนยันว่าเป็นวิชาที่สอนจริง
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select
              label="ภาคการศึกษา" value={pickerSemester}
              onChange={(e) => setPickerSemester(e.target.value)}
              options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
            />
            <Input
              label="ปีการศึกษา" type="number" value={pickerYear}
              onChange={(e) => setPickerYear(Number(e.target.value))}
            />
          </div>
          <Input
            label="ค้นหา (รหัสวิชา / ชื่อวิชา)"
            placeholder="เช่น 517122 หรือ Computer"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
          />

          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--line-soft)', borderRadius: 10 }}>
            {candidatesLoading ? (
              <div style={{ padding: 20, display: 'grid', gap: 8 }}>
                {[1, 2, 3].map((i) => <Skeleton key={i} height={52} borderRadius={8} />)}
              </div>
            ) : candidates.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)', fontSize: 14 }}>
                ไม่พบวิชาที่ยังไม่ได้เชื่อมโยง
              </div>
            ) : (
              <div style={{ display: 'grid' }}>
                {candidates.map((course: Course, idx: number) => (
                  <div
                    key={course.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', gap: 12,
                      borderBottom: idx < candidates.length - 1 ? '1px solid var(--line-soft)' : 'none',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{course.code}</span>
                        {!!course.section && <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Sec {course.section}</span>}
                        <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>ภาคเรียนที่ {course.semester}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayCourseTitle(course.title, course.english_title)}
                      </div>
                      {course.schedule && (
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}><Icon name="clock" size={13} style={{ verticalAlign: '-2px' }} /> {formatSchedule(course.schedule, { separator: ' / ' })}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      loading={addMut.isPending && addMut.variables === course.id}
                      onClick={() => addMut.mutate(course.id)}
                    >
                      เพิ่ม
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowPicker(false)}>ปิด</Button>
          </div>
        </div>
      </Modal>

      <CourseEditRequestModal key={editTarget?.id ?? 0} course={editTarget} onClose={() => setEditTarget(null)} />

      {/* Unlink Confirm Modal — only for self_added relations */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ยกเลิกการเชื่อมโยงวิชา"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการยกเลิกการเชื่อมโยงวิชา <strong>{deleteTarget?.course.code}</strong> ออกจากรายการวิชาของคุณใช่หรือไม่?
            {' '}ข้อมูลวิชาและประวัติรับสมัครจะยังคงอยู่ในระบบ
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button
              variant="danger"
              loading={removeMut.isPending}
              onClick={() => deleteTarget && removeMut.mutate(deleteTarget.id)}
            >
              ยืนยันการยกเลิก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
