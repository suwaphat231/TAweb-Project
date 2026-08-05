import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { instructorApi, notificationApi } from '../../services/api'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
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
  const [search, setSearch]             = useState('')

  const [noteText, setNoteText]         = useState('')
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

  // Loaded once per opened applicant (not on every render) and shown as a
  // small clickable thumbnail — clicking it opens the same already-fetched
  // image full-size in a new tab instead of re-downloading it.
  const [gradeProofUrl, setGradeProofUrl] = useState<string | null>(null)

  useEffect(() => {
    // Nothing to fetch — leave any previous URL in state, harmless since the
    // render below always checks has_grade_proof before using it.
    if (!profileTarget?.has_grade_proof) return

    let cancelled = false
    let objectUrl: string | null = null
    instructorApi.gradeProof(profileTarget.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = window.URL.createObjectURL(blob)
        setGradeProofUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) showToast('ไม่สามารถโหลดรูปภาพเกรดได้', 'error')
      })
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
        data.sent > 0
          ? `ส่งแจ้งเตือนแล้ว ${data.sent} คน`
          : 'ไม่มีนักศึกษาที่ผ่านการคัดเลือก',
        data.sent > 0 ? 'success' : 'info',
      )
    },
    onError: () => showToast('ไม่สามารถส่งแจ้งเตือนได้ กรุณาลองใหม่', 'error'),
  })

  const acceptAllMut = useMutation({
    mutationFn: () =>
      instructorApi.bulkReview({
        application_ids: applicants.filter((a) => a.status === 'pending').map((a) => a.id),
        status: 'accepted',
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['applicants', courseId] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setShowAcceptAll(false)
      if (data.updated === 0) {
        showToast('ไม่มีที่ว่างเหลือ ไม่สามารถรับเพิ่มได้', 'info')
      } else if (data.skipped_full > 0) {
        showToast(`รับเข้าและแจ้งเตือนแล้ว ${data.updated} คน — เหลืออีก ${data.skipped_full} คนที่รอเพราะที่นั่งเต็ม`, 'success')
      } else {
        showToast(`รับเข้าและแจ้งเตือนแล้ว ${data.updated} คน`, 'success')
      }
    },
    onError: () => showToast('ไม่สามารถรับผู้สมัครทั้งหมดได้ กรุณาลองใหม่', 'error'),
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

  // Client-side filter + rank by GPA DESC (not shown in the UI, but used to
  // surface stronger applicants first)
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

  function openProfile(app: Application) {
    setNoteText('')
    setProfileTarget(app)
  }

  const columns = [
    {
      key: 'index', header: '#',
      render: (_: Application, i: number) => (
        <span style={{ fontSize: 13, color: 'var(--ink-400)', fontWeight: 500 }}>{i + 1}</span>
      ),
    },
    {
      key: 'student', header: 'นักศึกษา',
      render: (row: Application) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar initials={getInitials(row.student_name)} color="blue" size={34} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{row.student_name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{row.student_code || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'grade', header: 'เกรดวิชานี้',
      render: (row: Application) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{row.grade || '—'}</span>
      ),
    },
    {
      key: 'applied_at', header: 'วันที่สมัคร',
      render: (row: Application) => (
        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          {new Date(row.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
    { key: 'status', header: 'สถานะ', render: (row: Application) => <StatusBadge value={row.status} /> },
    {
      key: 'actions', header: '',
      render: (row: Application) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {(row.status === 'pending' || row.status === 'rejected') && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); openProfile(row) }}
              style={{ color: 'var(--green)', border: '1px solid var(--green)' }}
            >
              รับ
            </Button>
          )}
          {(row.status === 'pending' || row.status === 'accepted') && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); openProfile(row) }}
              style={{ color: 'var(--red)', border: '1px solid var(--red)' }}
            >
              ไม่รับ
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            onClick={(e) => { e.stopPropagation(); openProfile(row) }}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            ตรวจสอบ
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>คัดเลือกผู้สมัคร</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!!courseId && pendingCount > 0 && (
            <Button
              style={{ background: 'var(--green)', borderColor: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowAcceptAll(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              รับ Lab Boy ทั้งหมด ({pendingCount})
            </Button>
          )}
          {!!courseId && (
            <Button
              variant="outline"
              loading={notifyMut.isPending}
              onClick={() => notifyMut.mutate()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              ส่งแจ้งเตือนผู้ผ่านเกณฑ์
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
            onChange={(e) => { setParams({ course: e.target.value }); setStatusFilter(''); setSearch('') }}
            style={{ width: 320 }}
          />
        </div>
      </div>

      {!courseId ? (
        <EmptyState title="เลือกรายวิชา" description="กรุณาเลือกวิชาจาก dropdown ด้านบนเพื่อดูผู้สมัคร" icon="👆" />
      ) : (
        <>
          {/* Summary bar */}
          {selectedCourse && (
            <div style={{
              display: 'flex', gap: 24, padding: '14px 20px',
              background: '#fff', borderRadius: 12, marginBottom: 20,
              border: '1px solid var(--line)', flexWrap: 'wrap',
            }}>
              <SumItem label="ผู้สมัครทั้งหมด" value={`${applicants.length} คน`} color="var(--ink-900)" />
              <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
              <SumItem label="Lab Boy" value={`${selectedCourse.labboy_accepted} / ${selectedCourse.labboy_slots} คน`} color="#7C3AED" />
              {!!selectedCourse.section && (
                <>
                  <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
                  <SumItem
                    label="กำลังดู"
                    value={`Sec ${selectedCourse.section}${selectedCourse.schedule ? ` · ${selectedCourse.schedule}` : ''}`}
                    color="var(--ink-700)"
                  />
                </>
              )}
            </div>
          )}

          {/* Filters */}
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

          {/* Table with accepted row highlight */}
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-md)', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
                  {columns.map((col) => (
                    <th key={col.key} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {columns.map((col) => (
                      <td key={col.key} style={{ padding: '14px 16px' }}>
                        <div style={{ height: 14, borderRadius: 6, background: 'var(--line-soft)', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={columns.length}>
                      <EmptyState title="ไม่มีผู้สมัครในหมวดนี้" />
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      background: row.status === 'accepted' ? '#F2F6FE' : '#fff',
                      cursor: 'pointer',
                      transition: 'background .12s',
                    }}
                    onClick={() => openProfile(row)}
                    onMouseEnter={(e) => { if (row.status !== 'accepted') e.currentTarget.style.background = 'var(--bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = row.status === 'accepted' ? '#F2F6FE' : '#fff' }}
                  >
                    {columns.map((col) => (
                      <td key={col.key} style={{ padding: '12px 16px', fontSize: 14, color: 'var(--ink-700)', verticalAlign: 'middle' }}>
                        {(col as { render: (row: Application, i: number) => React.ReactNode }).render(row, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Accept All Confirm Modal */}
      <Modal
        isOpen={showAcceptAll}
        onClose={() => setShowAcceptAll(false)}
        title="รับ Lab Boy ทั้งหมด"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการรับผู้สมัครที่รอพิจารณาทั้งหมด <strong>{pendingCount}</strong> คน เข้าเป็น Lab Boy วิชา{' '}
            <strong>{selectedCourse?.code}</strong> ใช่หรือไม่? ระบบจะส่งแจ้งเตือนให้นักศึกษาที่ผ่านการคัดเลือกทันที
            {pendingCount > remainingSlots && (
              <> — ที่นั่งเหลือเพียง <strong>{remainingSlots}</strong> ที่ ผู้สมัครที่เกินจะยังคงสถานะรอพิจารณาไว้</>
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

      {/* Applicant Detail Modal */}
      <Modal
        isOpen={!!profileTarget}
        onClose={() => setProfileTarget(null)}
        title="ตรวจสอบรายละเอียดผู้สมัคร"
        size="md"
      >
        {profileTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Status banner */}
            {profileTarget.status === 'accepted' && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#15803D' }}>ผ่านการคัดเลือก</span>
              </div>
            )}
            {profileTarget.status === 'rejected' && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>❌</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#DC2626' }}>ไม่ผ่านการคัดเลือก</span>
              </div>
            )}
            {profileTarget.status === 'pending' && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>⏳</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#B45309' }}>รอการพิจารณา</span>
              </div>
            )}
            {profileTarget.status === 'withdrawn' && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>↩️</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-500)' }}>ถอนใบสมัครแล้ว</span>
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar initials={getInitials(profileTarget.student_name)} color="blue" size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{profileTarget.student_name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>{profileTarget.student_code || '—'}</div>
              </div>
            </div>

            {/* Info grid */}
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

            {/* Grade proof — only relevant for postings that require it */}
            {selectedCourse?.require_grade_proof && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 6 }}>รูปภาพเกรดยืนยัน</div>
                {!profileTarget.has_grade_proof ? (
                  <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>ยังไม่ได้แนบรูปภาพ</div>
                ) : gradeProofUrl ? (
                  <img
                    src={gradeProofUrl}
                    alt="รูปภาพเกรดยืนยัน — กดเพื่อดูภาพเต็ม"
                    title="กดเพื่อดูภาพเต็ม"
                    onClick={() => window.open(gradeProofUrl, '_blank')}
                    style={{
                      width: 72, height: 72, objectFit: 'cover', borderRadius: 8,
                      border: '1px solid var(--line)', cursor: 'pointer',
                    }}
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
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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

            {/* Actions — decide and submit right here, no separate confirm page */}
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

function SumItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
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
