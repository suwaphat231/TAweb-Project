import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { instructorApi } from '../../services/api'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import type { Application } from '../../types'

const roleOptions  = [
  { value: '', label: 'ทุกตำแหน่ง' },
  { value: 'ta', label: 'TA' },
  { value: 'labboy', label: 'Lab Boy' },
]
const statusOptions = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'accepted', label: 'ผ่าน' },
  { value: 'rejected', label: 'ไม่ผ่าน' },
  { value: 'withdrawn', label: 'ถอน' },
]

export default function InstructorSelect() {
  const [params, setParams] = useSearchParams()
  const courseId = Number(params.get('course')) || 0

  const [roleFilter, setRoleFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]             = useState('')

  // review action state (shared between table row and profile modal)
  const [reviewAction, setReviewAction] = useState<{ app: Application; targetStatus: 'accepted' | 'rejected' } | null>(null)
  const [noteText, setNoteText]         = useState('')
  const [profileTarget, setProfileTarget] = useState<Application | null>(null)

  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [] } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: instructorApi.courses,
  })

  const { data: applicants = [], isLoading } = useQuery({
    queryKey: ['applicants', courseId],
    queryFn: () => instructorApi.applicants(courseId),
    enabled: !!courseId,
  })

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'accepted' | 'rejected' }) =>
      instructorApi.review(id, { status, note: noteText }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants', courseId] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setReviewAction(null)
      setProfileTarget(null)
      setNoteText('')
      showToast(vars.status === 'accepted' ? 'รับผู้สมัครเรียบร้อยแล้ว' : 'ปฏิเสธผู้สมัครเรียบร้อยแล้ว', 'success')
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      showToast(err?.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  // Client-side filter + sort by GPA DESC
  const filtered = useMemo(() => {
    let list = [...applicants].sort((a, b) => (b.student_gpa ?? 0) - (a.student_gpa ?? 0))
    if (roleFilter)   list = list.filter((a) => a.role_applied === roleFilter)
    if (statusFilter) list = list.filter((a) => a.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.student_name.toLowerCase().includes(q) ||
        (a.student_code ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [applicants, roleFilter, statusFilter, search])

  const selectedCourse = courses.find((c) => c.id === courseId)

  function openReview(app: Application, targetStatus: 'accepted' | 'rejected') {
    setNoteText('')
    setReviewAction({ app, targetStatus })
    setProfileTarget(null)
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
      key: 'gpa', header: 'GPA',
      render: (row: Application) => (
        <span style={{ fontWeight: 700, fontSize: 14, color: row.student_gpa >= 3.5 ? 'var(--green)' : row.student_gpa >= 3.0 ? 'var(--primary)' : 'var(--ink-700)' }}>
          {row.student_gpa ? row.student_gpa.toFixed(2) : '—'}
        </span>
      ),
    },
    { key: 'role', header: 'ตำแหน่ง', render: (row: Application) => <StatusBadge value={row.role_applied} /> },
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
          {row.status === 'accepted' && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); openReview(row, 'rejected') }}
              style={{ color: 'var(--red)', border: '1px solid var(--red)' }}
            >
              ไม่รับ
            </Button>
          )}
          {row.status === 'rejected' && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); openReview(row, 'accepted') }}
              style={{ color: 'var(--green)', border: '1px solid var(--green)' }}
            >
              รับ
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            onClick={(e) => { e.stopPropagation(); setProfileTarget(row) }}
          >
            โปรไฟล์
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>คัดเลือกผู้สมัคร</h1>
        <Select
          options={[
            { value: '', label: 'เลือกรายวิชา...' },
            ...courses.map((c) => ({
              value: String(c.id),
              label: `[${c.code}] ${c.title} — ${c.applicant_count ?? 0} ผู้สมัคร`,
            })),
          ]}
          value={String(courseId)}
          onChange={(e) => { setParams({ course: e.target.value }); setRoleFilter(''); setStatusFilter(''); setSearch('') }}
          style={{ width: 320 }}
        />
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
              <SumItem label="TA" value={`${selectedCourse.ta_accepted} / ${selectedCourse.ta_slots} คน`} color="var(--primary)" />
              <SumItem label="Lab Boy" value={`${selectedCourse.labboy_accepted} / ${selectedCourse.labboy_slots} คน`} color="#7C3AED" />
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <FilterChips options={roleOptions} value={roleFilter} onChange={setRoleFilter} />
            <div style={{ width: 1, height: 28, background: 'var(--line)' }} />
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
                    onClick={() => setProfileTarget(row)}
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

      {/* Note / Confirm Modal */}
      <Modal
        isOpen={!!reviewAction}
        onClose={() => setReviewAction(null)}
        title={reviewAction?.targetStatus === 'accepted' ? 'ยืนยันรับผู้สมัคร' : 'ยืนยันไม่รับผู้สมัคร'}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-700)' }}>
            {reviewAction?.targetStatus === 'accepted' ? 'รับ' : 'ปฏิเสธ'} <strong>{reviewAction?.app.student_name}</strong> เข้าเป็น <strong>{reviewAction?.app.role_applied === 'ta' ? 'TA' : 'Lab Boy'}</strong>?
          </p>
          <Textarea
            label="หมายเหตุ (ไม่บังคับ)"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="เหตุผลหรือหมายเหตุเพิ่มเติม..."
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setReviewAction(null)}>ยกเลิก</Button>
            <Button
              variant={reviewAction?.targetStatus === 'accepted' ? 'primary' : 'danger'}
              loading={reviewMut.isPending}
              onClick={() => reviewAction && reviewMut.mutate({ id: reviewAction.app.id, status: reviewAction.targetStatus })}
            >
              {reviewAction?.targetStatus === 'accepted' ? 'ยืนยันรับ' : 'ยืนยันไม่รับ'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Applicant Profile Modal */}
      <Modal
        isOpen={!!profileTarget}
        onClose={() => setProfileTarget(null)}
        title="โปรไฟล์ผู้สมัคร"
        size="md"
      >
        {profileTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar initials={getInitials(profileTarget.student_name)} color="blue" size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{profileTarget.student_name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>{profileTarget.student_code || '—'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <StatusBadge value={profileTarget.role_applied} />
                  <StatusBadge value={profileTarget.status} />
                </div>
              </div>
            </div>

            {/* GPA bar */}
            {profileTarget.student_gpa > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>GPA</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{profileTarget.student_gpa.toFixed(2)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    background: profileTarget.student_gpa >= 3.5 ? 'var(--green)' : 'var(--primary)',
                    width: `${Math.min(100, (profileTarget.student_gpa / 4) * 100)}%`,
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 2, textAlign: 'right' }}>จาก 4.00</div>
              </div>
            )}

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ProfileInfo label="อีเมล" value={profileTarget.student_email || '—'} />
              <ProfileInfo label="ชั้นปี" value={profileTarget.student_year ? `ปีที่ ${profileTarget.student_year}` : '—'} />
              <ProfileInfo label="คณะ / ภาควิชา" value={profileTarget.student_faculty || '—'} />
              <ProfileInfo label="วันที่สมัคร" value={new Date(profileTarget.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>

            {/* Motivation */}
            {profileTarget.motivation && (
              <div style={{ background: '#F8F9FB', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 6 }}>แรงจูงใจในการสมัคร</div>
                <div style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.7 }}>{profileTarget.motivation}</div>
              </div>
            )}

            {/* Actions */}
            {profileTarget.status !== 'withdrawn' && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
                {profileTarget.status === 'accepted' && (
                  <Button
                    variant="ghost"
                    style={{ color: 'var(--red)', border: '1px solid var(--red)' }}
                    onClick={() => openReview(profileTarget, 'rejected')}
                  >
                    ไม่รับ
                  </Button>
                )}
                {profileTarget.status === 'rejected' && (
                  <Button
                    variant="ghost"
                    style={{ color: 'var(--green)', border: '1px solid var(--green)' }}
                    onClick={() => openReview(profileTarget, 'accepted')}
                  >
                    รับ
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
