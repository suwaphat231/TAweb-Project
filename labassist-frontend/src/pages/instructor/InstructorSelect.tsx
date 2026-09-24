import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { instructorApi, notificationApi } from '../../services/api'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { getInitials } from '../../utils/initials'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { Application } from '../../types'

const statusOptions = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอพิจารณา' },
  { value: 'accepted', label: 'ผ่าน' },
  { value: 'rejected', label: 'ไม่ผ่าน' },
  { value: 'withdrawn', label: 'ถอน' },
]

export default function InstructorSelect() {
  const [params, setParams] = useSearchParams()
  const courseId = Number(params.get('course')) || 0

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [noteText, setNoteText] = useState('')
  const [profileTarget, setProfileTarget] = useState<Application | null>(null)
  const [showAcceptAll, setShowAcceptAll] = useState(false)

  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [] } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
  })

  const { data: applicants = [], isLoading } = useQuery({
    queryKey: ['applicants', courseId],
    queryFn: () => instructorApi.applicants(courseId),
    enabled: !!courseId,
  })

  const [gradeProofUrl, setGradeProofUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!profileTarget?.has_grade_proof) return
    let cancelled = false
    let objectUrl: string | null = null
    instructorApi.gradeProof(profileTarget.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = window.URL.createObjectURL(blob)
        setGradeProofUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) showToast('ไม่สามารถโหลดรูปภาพเกรดได้', 'error') })
    return () => {
      cancelled = true
      if (objectUrl) window.URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTarget?.id, profileTarget?.has_grade_proof])

  const notifyMut = useMutation({
    mutationFn: () => notificationApi.notifyCourse(courseId),
    onSuccess: (data) => {
      showToast(
        data.sent > 0 ? `ส่งแจ้งเตือนแล้ว ${data.sent} คน` : 'ไม่มีนักศึกษาที่ผ่านการคัดเลือก',
        data.sent > 0 ? 'success' : 'info',
      )
    },
    onError: () => showToast('ไม่สามารถส่งแจ้งเตือนได้ กรุณาลองใหม่', 'error'),
  })

  const acceptAllMut = useMutation({
    mutationFn: () => instructorApi.bulkReview({
      application_ids: applicants.filter((a) => a.status === 'pending').map((a) => a.id),
      status: 'accepted',
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['applicants', courseId] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setShowAcceptAll(false)
      setSelectedIds(new Set())
      if (data.updated === 0) showToast('ไม่มีที่ว่างเหลือ ไม่สามารถรับเพิ่มได้', 'info')
      else if (data.skipped_full > 0) showToast(`รับเข้าและแจ้งเตือนแล้ว ${data.updated} คน — เหลืออีก ${data.skipped_full} คนที่รอเพราะที่นั่งเต็ม`, 'success')
      else showToast(`รับเข้าและแจ้งเตือนแล้ว ${data.updated} คน`, 'success')
    },
    onError: () => showToast('ไม่สามารถรับผู้สมัครทั้งหมดได้ กรุณาลองใหม่', 'error'),
  })

  const bulkReviewMut = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: 'accepted' | 'rejected' }) =>
      instructorApi.bulkReview({ application_ids: ids, status }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants', courseId] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setSelectedIds(new Set())
      if (vars.status === 'accepted') {
        if (data.skipped_full > 0) showToast(`รับแล้ว ${data.updated} คน — ${data.skipped_full} คนที่นั่งเต็ม`, 'success')
        else showToast(`รับเข้าแล้ว ${data.updated} คน`, 'success')
      } else {
        showToast(`ปฏิเสธแล้ว ${data.updated} คน`, 'info')
      }
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'accepted' | 'rejected' }) =>
      instructorApi.review(id, { status, note: noteText }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants', courseId] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setProfileTarget(null)
      setNoteText('')
      showToast(vars.status === 'accepted' ? 'รับผู้สมัครและแจ้งเตือนนักศึกษาเรียบร้อยแล้ว' : 'ปฏิเสธผู้สมัครเรียบร้อยแล้ว', 'success')
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      showToast(err?.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const filtered = useMemo(() => {
    let list = [...applicants].sort((a, b) => (b.student_gpa ?? 0) - (a.student_gpa ?? 0))
    if (statusFilter) list = list.filter((a) => a.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.student_name.toLowerCase().includes(q) ||
        (a.student_code ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [applicants, statusFilter, search])

  const selectedCourse = courses.find((c) => c.id === courseId)
  const pendingCount = applicants.filter((a) => a.status === 'pending').length
  const remainingSlots = selectedCourse ? Math.max(0, selectedCourse.labboy_slots - selectedCourse.labboy_accepted) : 0
  const slotFill = selectedCourse && selectedCourse.labboy_slots > 0
    ? selectedCourse.labboy_accepted / selectedCourse.labboy_slots
    : 0
  const previewFill = selectedCourse && selectedCourse.labboy_slots > 0
    ? (selectedCourse.labboy_accepted + selectedIds.size) / selectedCourse.labboy_slots
    : 0
  const previewCount = selectedCourse
    ? Math.min(selectedCourse.labboy_accepted + selectedIds.size, selectedCourse.labboy_slots)
    : 0

  // Multi-select — only pending rows can be selected
  const selectablePending = filtered.filter((a) => a.status === 'pending')
  const allPendingSelected = selectablePending.length > 0 && selectablePending.every((a) => selectedIds.has(a.id))
  const someSelected = selectedIds.size > 0

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectablePending.map((a) => a.id)))
    }
  }

  function openProfile(app: Application) {
    setNoteText('')
    setGradeProofUrl(null)
    setProfileTarget(app)
  }

  return (
    <div style={{ paddingBottom: someSelected ? 88 : 0, transition: 'padding-bottom .2s' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>คัดเลือกผู้สมัคร</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!!courseId && pendingCount > 0 && (
            <Button
              style={{ background: 'var(--green)', borderColor: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowAcceptAll(true)}
            >
              <CheckIcon /> รับทั้งหมด ({pendingCount})
            </Button>
          )}
          {!!courseId && (
            <Button variant="outline" loading={notifyMut.isPending} onClick={() => notifyMut.mutate()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BellIcon /> แจ้งเตือนผู้ผ่าน
            </Button>
          )}
          <Select
            options={[
              { value: '', label: 'เลือกรายวิชา...' },
              ...courses.map((c) => ({
                value: String(c.id),
                label: `[${c.code}${c.section ? ` sec ${c.section}` : ''}] ${displayCourseTitle(c.title, c.english_title)} — ${c.applicant_count ?? 0} ผู้สมัคร`,
              })),
            ]}
            value={String(courseId)}
            onChange={(e) => {
              setParams({ course: e.target.value })
              setStatusFilter('')
              setSearch('')
              setSelectedIds(new Set())
            }}
            style={{ width: 320 }}
          />
        </div>
      </div>

      {!courseId ? (
        <EmptyState title="เลือกรายวิชา" description="กรุณาเลือกวิชาจาก dropdown ด้านบนเพื่อดูผู้สมัคร" icon="👆" />
      ) : (
        <>
          {/* ── Summary bar ── */}
          {selectedCourse && (
            <div style={{
              display: 'flex', gap: 24, padding: '16px 20px',
              background: '#fff', borderRadius: 14, marginBottom: 20,
              border: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center',
            }}>
              {/* Applicant count */}
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600, marginBottom: 2 }}>ผู้สมัครทั้งหมด</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>{applicants.length} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-400)' }}>คน</span></div>
              </div>

              <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />

              {/* Slot progress */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600 }}>Lab Boy ที่รับแล้ว</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: slotFill >= 1 ? 'var(--green)' : 'var(--primary-700)',
                    }}>
                      {selectedCourse.labboy_accepted} / {selectedCourse.labboy_slots} คน
                    </span>
                    {selectedIds.size > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--primary)',
                        background: 'var(--primary-50)',
                        border: '1px solid var(--primary-100)',
                        borderRadius: 99,
                        padding: '2px 8px',
                        transition: 'opacity .2s',
                      }}>
                        +{selectedIds.size}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: 'var(--line-soft)', overflow: 'hidden', position: 'relative' }}>
                  {/* Ghost preview segment — shows potential fill if selection is accepted */}
                  {selectedIds.size > 0 && (
                    <div style={{
                      position: 'absolute', left: 0, top: 0,
                      height: '100%',
                      width: `${Math.min(100, previewFill * 100)}%`,
                      borderRadius: 99,
                      background: 'var(--primary-100)',
                      transition: 'width .3s cubic-bezier(.4,0,.2,1)',
                    }} />
                  )}
                  {/* Accepted fill */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0,
                    height: '100%',
                    width: `${Math.min(100, slotFill * 100)}%`,
                    borderRadius: 99,
                    background: slotFill >= 1 ? 'var(--green)' : 'var(--primary)',
                    transition: 'width .4s cubic-bezier(.4,0,.2,1)',
                  }} />
                </div>
                <div style={{ fontSize: 11, marginTop: 5, fontWeight: slotFill >= 1 ? 600 : 400,
                  color: slotFill >= 1 ? 'var(--green)' : selectedIds.size > 0 ? 'var(--primary)' : 'var(--ink-400)',
                }}>
                  {slotFill >= 1
                    ? 'รับครบโควต้าแล้ว'
                    : selectedIds.size > 0
                      ? `ถ้ารับที่เลือก: ${previewCount} / ${selectedCourse.labboy_slots} คน`
                      : `ยังรับได้อีก ${remainingSlots} คน`
                  }
                </div>
              </div>

              {!!selectedCourse.section && (
                <>
                  <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 600, marginBottom: 2 }}>กำลังดู</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>
                      Sec {selectedCourse.section}{selectedCourse.schedule ? ` · ${selectedCourse.schedule}` : ''}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Filters ── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <FilterChips options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
                style={{
                  width: '100%', padding: '7px 12px',
                  border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
                  fontSize: 13, color: 'var(--ink-900)', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
              />
            </div>
          </div>

          {/* ── Table ── */}
          <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,.07)', background: '#fff', border: '1px solid var(--line)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--line-soft)', borderBottom: '1.5px solid var(--line)' }}>
                  {/* Select-all checkbox */}
                  <th style={{ padding: '11px 14px', width: 44 }}>
                    {selectablePending.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAll}
                        title="เลือก/ยกเลิกทุกรายการที่รอพิจารณา"
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                    )}
                  </th>
                  <th style={{ padding: '11px 10px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', width: 36 }}>#</th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>นักศึกษา</th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>เกรด / GPA</th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>วันที่สมัคร</th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>สถานะ</th>
                  <th style={{ padding: '11px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {[0,1,2,3,4,5,6].map((col) => (
                      <td key={col} style={{ padding: '16px 16px' }}>
                        <div style={{ height: 13, borderRadius: 6, background: 'var(--line-soft)', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title="ไม่มีผู้สมัครในหมวดนี้" />
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.map((row, i) => {
                  const isPending  = row.status === 'pending'
                  const isAccepted = row.status === 'accepted'
                  const isSelected = selectedIds.has(row.id)

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        background: isSelected
                          ? 'var(--primary-50)'
                          : isAccepted ? '#F0FDF4' : '#fff',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isAccepted) e.currentTarget.style.background = 'var(--line-soft)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isSelected
                          ? 'var(--primary-50)'
                          : isAccepted ? '#F0FDF4' : '#fff'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '14px 14px', width: 44 }}>
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(row.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                          />
                        )}
                        {isAccepted && (
                          <span title="ผ่านการคัดเลือก" style={{ fontSize: 14 }}>✅</span>
                        )}
                      </td>

                      {/* # */}
                      <td style={{ padding: '14px 10px' }}>
                        <span style={{ fontSize: 13, color: 'var(--ink-400)', fontWeight: 500 }}>{i + 1}</span>
                      </td>

                      {/* Student */}
                      <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => openProfile(row)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar initials={getInitials(row.student_name)} color="blue" size={34} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{row.student_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{row.student_code || '—'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Grade / GPA */}
                      <td style={{ padding: '14px 16px' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)' }}>{row.grade || '—'}</div>
                          {row.student_gpa != null && (
                            <div style={{
                              fontSize: 11, fontWeight: 600, marginTop: 2,
                              color: row.student_gpa >= 3.5 ? 'var(--green)'
                                : row.student_gpa >= 3.0 ? 'var(--primary)' : 'var(--ink-400)',
                            }}>
                              GPA {row.student_gpa.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Applied date */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                          {new Date(row.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge value={row.status} />
                      </td>

                      {/* ── Actions ── */}
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>

                          {/* Accept — green solid pill */}
                          {(row.status === 'pending' || row.status === 'rejected') && (
                            <ActionBtn
                              color="green"
                              onClick={(e) => { e.stopPropagation(); reviewMut.mutate({ id: row.id, status: 'accepted' }) }}
                              disabled={reviewMut.isPending}
                              icon={<CheckIcon size={11} />}
                              label="รับ"
                            />
                          )}

                          {/* Reject — red soft pill */}
                          {(row.status === 'pending' || row.status === 'accepted') && (
                            <ActionBtn
                              color="red"
                              onClick={(e) => { e.stopPropagation(); reviewMut.mutate({ id: row.id, status: 'rejected' }) }}
                              disabled={reviewMut.isPending}
                              icon={<XIcon size={11} />}
                              label="ไม่รับ"
                            />
                          )}

                          {/* Detail */}
                          <button
                            onClick={(e) => { e.stopPropagation(); openProfile(row) }}
                            title="ดูรายละเอียด"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 32, height: 32, borderRadius: 8,
                              border: '1.5px solid var(--line)', background: '#fff',
                              cursor: 'pointer', color: 'var(--ink-400)',
                              transition: 'border-color .15s, color .15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-400)' }}
                          >
                            <EyeIcon size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Floating bulk action bar ── */}
      {someSelected && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          background: '#1E2235',
          borderRadius: 16, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,.28)',
          zIndex: 200,
          animation: 'slideUp .2s ease',
          whiteSpace: 'nowrap',
        }}>
          {/* Count badge */}
          <div style={{
            background: 'var(--primary)', color: '#fff',
            borderRadius: 99, padding: '3px 10px',
            fontSize: 12, fontWeight: 700,
          }}>
            {selectedIds.size} คน
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />

          {/* Bulk accept */}
          <button
            onClick={() => bulkReviewMut.mutate({ ids: [...selectedIds], status: 'accepted' })}
            disabled={bulkReviewMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: 'var(--green)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: bulkReviewMut.isPending ? 0.6 : 1,
              transition: 'opacity .15s, transform .1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = bulkReviewMut.isPending ? '0.6' : '1')}
          >
            <CheckIcon size={12} /> รับที่เลือก
          </button>

          {/* Bulk reject */}
          <button
            onClick={() => bulkReviewMut.mutate({ ids: [...selectedIds], status: 'rejected' })}
            disabled={bulkReviewMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: '#EF4444', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: bulkReviewMut.isPending ? 0.6 : 1,
              transition: 'opacity .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = bulkReviewMut.isPending ? '0.6' : '1')}
          >
            <XIcon size={12} /> ไม่รับที่เลือก
          </button>

          {/* Deselect all */}
          <button
            onClick={() => setSelectedIds(new Set())}
            title="ยกเลิกการเลือก"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)',
              cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
          >
            <XIcon size={12} />
          </button>
        </div>
      )}

      {/* ── Accept All Confirm Modal ── */}
      <Modal isOpen={showAcceptAll} onClose={() => setShowAcceptAll(false)} title="รับ Lab Boy ทั้งหมด" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0, lineHeight: 1.7 }}>
            ต้องการรับผู้สมัครที่รอพิจารณาทั้งหมด <strong>{pendingCount}</strong> คน เข้าเป็น Lab Boy วิชา{' '}
            <strong>{selectedCourse?.code}</strong> ใช่หรือไม่?
            ระบบจะส่งแจ้งเตือนให้นักศึกษาที่ผ่านการคัดเลือกทันที
            {pendingCount > remainingSlots && (
              <> — ที่นั่งเหลือเพียง <strong style={{ color: 'var(--amber)' }}>{remainingSlots}</strong> ที่ ผู้สมัครที่เกินจะยังคงสถานะรอพิจารณาไว้</>
            )}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowAcceptAll(false)}>ยกเลิก</Button>
            <Button
              style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
              loading={acceptAllMut.isPending}
              onClick={() => acceptAllMut.mutate()}
            >
              รับเข้าทั้งหมด
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Applicant Detail Modal ── */}
      <Modal isOpen={!!profileTarget} onClose={() => setProfileTarget(null)} title="ตรวจสอบรายละเอียดผู้สมัคร" size="md">
        {profileTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Status banner */}
            {profileTarget.status === 'accepted' && <StatusBanner color="#F0FDF4" border="#BBF7D0" icon="✅" text="ผ่านการคัดเลือก" textColor="#15803D" />}
            {profileTarget.status === 'rejected' && <StatusBanner color="#FEF2F2" border="#FECACA" icon="❌" text="ไม่ผ่านการคัดเลือก" textColor="#DC2626" />}
            {profileTarget.status === 'pending'  && <StatusBanner color="#FFFBEB" border="#FDE68A" icon="⏳" text="รอการพิจารณา" textColor="#B45309" />}
            {profileTarget.status === 'withdrawn'&& <StatusBanner color="var(--bg)" border="var(--line)" icon="↩️" text="ถอนใบสมัครแล้ว" textColor="var(--ink-500)" />}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar initials={getInitials(profileTarget.student_name)} color="blue" size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{profileTarget.student_name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>{profileTarget.student_code || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ProfileInfo label="อีเมล" value={profileTarget.student_email || '—'} />
              <ProfileInfo label="ชั้นปี" value={profileTarget.student_year ? `ปีที่ ${profileTarget.student_year}` : '—'} />
              <ProfileInfo label="ภาควิชา" value={profileTarget.student_faculty || '—'} />
              <ProfileInfo label="เกรดที่เคยได้ในวิชานี้" value={profileTarget.grade || '—'} />
              <ProfileInfo
                label="Sec / เวลาเรียนที่สมัคร"
                value={profileTarget.course_section ? `Sec ${profileTarget.course_section}${profileTarget.course_schedule ? ` · ${profileTarget.course_schedule}` : ''}` : '—'}
              />
              <ProfileInfo label="วันที่สมัคร" value={new Date(profileTarget.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>

            {/* Grade proof */}
            {selectedCourse?.require_grade_proof && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 6 }}>รูปภาพเกรดยืนยัน</div>
                {!profileTarget.has_grade_proof ? (
                  <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>ยังไม่ได้แนบรูปภาพ</div>
                ) : gradeProofUrl ? (
                  <img
                    src={gradeProofUrl} alt="รูปภาพเกรดยืนยัน"
                    onClick={() => window.open(gradeProofUrl, '_blank')}
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer' }}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>กำลังโหลด...</div>
                )}
              </div>
            )}

            {/* Review result */}
            {(profileTarget.reviewed_at || profileTarget.note) && (
              <div style={{ background: '#F8F9FB', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ผลการพิจารณา</div>
                {profileTarget.reviewed_by_name && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>พิจารณาโดย</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>{profileTarget.reviewed_by_name}</span>
                    {profileTarget.reviewed_at && (
                      <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                        · {new Date(profileTarget.reviewed_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
                {profileTarget.note && (
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.6, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>
                    {profileTarget.note}
                  </div>
                )}
              </div>
            )}

            {/* Modal action buttons */}
            {profileTarget.status !== 'withdrawn' && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
                {(profileTarget.status === 'pending' || profileTarget.status === 'accepted') && (
                  <Button
                    variant="ghost"
                    style={{ color: 'var(--red)', border: '1px solid var(--red)' }}
                    loading={reviewMut.isPending && reviewMut.variables?.status === 'rejected'}
                    onClick={() => reviewMut.mutate({ id: profileTarget.id, status: 'rejected' })}
                  >
                    ไม่รับ
                  </Button>
                )}
                {(profileTarget.status === 'pending' || profileTarget.status === 'rejected') && (
                  <Button
                    style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
                    loading={reviewMut.isPending && reviewMut.variables?.status === 'accepted'}
                    onClick={() => reviewMut.mutate({ id: profileTarget.id, status: 'accepted' })}
                  >
                    รับเข้า
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Tiny sub-components ──────────────────────────────────────────────────────

function ActionBtn({
  color, onClick, disabled, icon, label,
}: {
  color: 'green' | 'red'
  onClick: React.MouseEventHandler<HTMLButtonElement>
  disabled: boolean
  icon: React.ReactNode
  label: string
}) {
  const bg     = color === 'green' ? 'var(--green-bg)' : 'var(--red-bg)'
  const bgHov  = color === 'green' ? '#d1fae5' : '#fee2e2'
  const text   = color === 'green' ? 'var(--green)' : 'var(--red)'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 8, border: 'none',
        background: bg, color: text,
        fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1, transition: 'opacity .15s, background .15s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = bgHov }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg }}
    >
      {icon}{label}
    </button>
  )
}

function StatusBanner({ color, border, icon, text, textColor }: { color: string; border: string; icon: string; text: string; textColor: string }) {
  return (
    <div style={{ background: color, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{text}</span>
    </div>
  )
}

function ProfileInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-900)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

// ── SVG icon helpers ─────────────────────────────────────────────────────────

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  )
}

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  )
}

function BellIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
