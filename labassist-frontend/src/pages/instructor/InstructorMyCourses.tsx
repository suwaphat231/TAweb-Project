import { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { instructorApi } from '../../services/api'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { getInitials } from '../../utils/initials'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { Course, CourseRelation } from '../../types'

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

function SourceBadge({ source }: { source: CourseRelation['source'] }) {
  const isImported = source === 'imported'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600,
      color: isImported ? 'var(--ink-500)' : '#92400E',
      background: isImported ? 'var(--bg)' : '#FFFBEB',
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid ${isImported ? 'var(--line-soft)' : '#FDE68A'}`,
    }}>
      {!isImported && <LockIcon />}
      {isImported ? 'จากตารางสอน' : 'ดูเท่านั้น'}
    </span>
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

export default function InstructorMyCourses() {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSemester, setPickerSemester] = useState('1')
  const [pickerYear, setPickerYear] = useState(currentYear)
  const [pickerSearch, setPickerSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CourseRelation | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: relations = [], isLoading } = useQuery({
    queryKey: ['instructor-my-courses'],
    queryFn: () => instructorApi.myCourses(),
  })

  // Only courses that have opened recruitment — a draft has never been opened
  // so there are no Lab Boys to show yet. Closed rounds stay listed because
  // their accepted Lab Boys are what this page is for.
  const displayRelations = relations.filter((r) => r.course.status !== 'draft')

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>วิชาของฉัน</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>รายวิชาที่สอนทั้งหมด พร้อม Lab Boy ที่ผ่านการคัดเลือกในแต่ละวิชา</p>
        </div>
        <Button onClick={() => setShowPicker(true)}><LinkIcon /> <span style={{ marginLeft: 6 }}>เพิ่มวิชาเอง</span></Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={140} borderRadius={12} />)}
        </div>
      ) : displayRelations.length === 0 ? (
        <EmptyState
          title="ยังไม่มีวิชาที่เปิดรับสมัคร"
          icon="📚"
          action={{ label: 'เพิ่มวิชาเอง', onClick: () => setShowPicker(true) }}
        />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {displayRelations.map((rel, i) => {
            const c = rel.course
            const applicants = applicantQueries[i]?.data ?? []
            const accepted = applicants.filter((a) => a.status === 'accepted')
            return (
              <Card key={rel.id} padding={0} style={rel.source === 'self_added' ? { borderColor: '#FDE68A' } : undefined}>
                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                        {c.code}
                      </span>
                      {!!c.section && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                          Sec {c.section}
                        </span>
                      )}
                      <StatusBadge value={c.status} />
                      <SourceBadge source={rel.source} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{displayCourseTitle(c.title, c.english_title)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                      ภาค {c.semester}/{c.academic_year}
                      {c.schedule && <span> · 🕐 {c.schedule}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {rel.source === 'imported' && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-700)' }}>
                        Lab Boy {c.labboy_accepted} / {c.labboy_slots} คน
                      </div>
                    )}
                    {rel.source === 'self_added' && (
                      <Button
                        size="sm" variant="outline" title="ยกเลิกการเชื่อมโยงวิชา"
                        style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                        onClick={() => setDeleteTarget(rel)}
                      >
                        <DeleteIcon />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardBody>
                  {rel.source === 'self_added' ? (
                    <div style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 10,
                      padding: '12px 16px',
                    }}>
                      <svg style={{ flexShrink: 0, marginTop: 1, color: '#D97706' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 3 }}>
                          ไม่มีสิทธิ์จัดการวิชานี้
                        </div>
                        <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.6 }}>
                          วิชาที่เพิ่มด้วยตนเองแสดงในรายการเพื่อติดตามเท่านั้น
                          การดูผู้สมัคร อนุมัติใบสมัคร และแก้ไขประกาศ
                          ต้องใช้บัญชีที่ผูกกับตารางสอนจริงในระบบ
                        </div>
                      </div>
                    </div>
                  ) : accepted.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีผู้ผ่านการคัดเลือก</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                      {accepted.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line-soft)', borderRadius: 10 }}>
                          <Avatar initials={getInitials(a.student_name)} color="purple" size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.student_name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.student_code || '—'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* Course Picker Modal — link to an existing course from the catalog */}
      <Modal isOpen={showPicker} onClose={() => setShowPicker(false)} title="เพิ่มวิชาเอง" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
            เลือกวิชาที่ต้องการติดตาม — วิชาที่เพิ่มด้วยตนเองจะปรากฏในรายการแต่
            <strong style={{ color: '#92400E' }}> ไม่ได้รับสิทธิ์จัดการ</strong> จนกว่าระบบจะยืนยันว่าเป็นวิชาที่สอนจริง
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
                        <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>ภาค {course.semester}/{course.academic_year}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayCourseTitle(course.title, course.english_title)}
                      </div>
                      {course.schedule && (
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>🕐 {course.schedule}</div>
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
