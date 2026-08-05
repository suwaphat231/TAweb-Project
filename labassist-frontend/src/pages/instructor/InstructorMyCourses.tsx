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
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { Course } from '../../types'

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

function errorDetail(err: unknown, fallback: string): string {
  const detail = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
  return detail ?? fallback
}

const ADD_COURSE_FORM_EMPTY = {
  code: '', title: '', semester: '1', academic_year: 2569, labboy_slots: 0, deadline: '',
}

// This page is both the read-only "which courses do I teach, and who got in
// as Lab Boy" view, and — since it lists every course the instructor
// teaches regardless of posting status — the natural place to add a course
// that never made it into the admin's Excel import, or remove one entirely.
export default function InstructorMyCourses() {
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [addCourseForm, setAddCourseForm] = useState(ADD_COURSE_FORM_EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: allCourses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
  })

  // Draft rows are unopened sections from the Excel import — not really
  // "my course" yet. Deleting a course resets it back to draft on the
  // backend (so the section can be reopened later without re-importing),
  // so excluding drafts here is also what makes a deleted course actually
  // disappear from this page instead of reappearing as a draft.
  const courses = allCourses.filter((c) => c.status !== 'draft')

  const applicantQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-applicants', c.id],
      queryFn: () => instructorApi.applicants(c.id),
    })),
  })

  const createCourseMut = useMutation({
    mutationFn: () => instructorApi.createCourse({
      code: addCourseForm.code,
      title: addCourseForm.title,
      semester: addCourseForm.semester,
      academic_year: Number(addCourseForm.academic_year),
      labboy_slots: Number(addCourseForm.labboy_slots),
      deadline: addCourseForm.deadline || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setShowAddCourse(false)
      setAddCourseForm(ADD_COURSE_FORM_EMPTY)
      showToast('เพิ่มวิชาเรียบร้อยแล้ว บันทึกเป็นฉบับร่าง — เปิดรับสมัครได้จากหน้าจัดการประกาศ', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ไม่สามารถเพิ่มวิชาได้ กรุณาลองใหม่'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => instructorApi.deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
      setDeleteTarget(null)
      showToast('ลบวิชาเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถลบวิชาได้ กรุณาลองใหม่', 'error'),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>วิชาของฉัน</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>รายวิชาที่สอนทั้งหมด พร้อม Lab Boy ที่ผ่านการคัดเลือกในแต่ละวิชา</p>
        </div>
        <Button onClick={() => setShowAddCourse(true)}>+ เพิ่มวิชาเอง</Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={140} borderRadius={12} />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title="ยังไม่มีวิชาที่สอน"
          icon="📚"
          action={{ label: 'เพิ่มวิชาเอง', onClick: () => setShowAddCourse(true) }}
        />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {courses.map((c, i) => {
            const applicants = applicantQueries[i]?.data ?? []
            const accepted = applicants.filter((a) => a.status === 'accepted')
            return (
              <Card key={c.id} padding={0}>
                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                        {c.code}
                      </span>
                      {!!c.section && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                          Sec {c.section}
                        </span>
                      )}
                      <StatusBadge value={c.status} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{displayCourseTitle(c.title, c.english_title)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                      ภาค {c.semester}/{c.academic_year}
                      {c.schedule && <span> · 🕐 {c.schedule}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>
                      Lab Boy {c.labboy_accepted} / {c.labboy_slots} คน
                    </div>
                    <Button
                      size="sm" variant="outline" title="ลบวิชา"
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      onClick={() => setDeleteTarget(c)}
                    >
                      <DeleteIcon />
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  {accepted.length === 0 ? (
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

      {/* Add Own Course Modal — for a course that never made it into the
          admin's Excel import (or doesn't exist in the catalog at all) */}
      <Modal isOpen={showAddCourse} onClose={() => setShowAddCourse(false)} title="เพิ่มวิชาเอง" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); createCourseMut.mutate() }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            สำหรับวิชาที่ไม่มีอยู่ในไฟล์ Excel ที่แอดมินนำเข้า — วิชาจะถูกบันทึกเป็นฉบับร่างก่อน แอดมินจะเห็นวิชานี้ในระบบด้วย
          </p>
          <Input
            label="รหัสวิชา *" value={addCourseForm.code}
            onChange={(e) => setAddCourseForm((f) => ({ ...f, code: e.target.value }))}
            required
          />
          <Input
            label="ชื่อวิชา *" value={addCourseForm.title}
            onChange={(e) => setAddCourseForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select
              label="ภาคการศึกษา *" value={addCourseForm.semester}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, semester: e.target.value }))}
              options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
            />
            <Input
              label="ปีการศึกษา *" type="number" value={addCourseForm.academic_year}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, academic_year: Number(e.target.value) }))}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Lab Boy Slots" type="number" min="0" placeholder="เช่น 2"
              value={addCourseForm.labboy_slots || ''}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, labboy_slots: Number(e.target.value) }))}
            />
            <Input
              label="วันปิดรับสมัคร" type="date" value={addCourseForm.deadline}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, deadline: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowAddCourse(false)}>ยกเลิก</Button>
            <Button type="submit" loading={createCourseMut.isPending}>เพิ่มวิชา</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ลบวิชา"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
            ต้องการลบวิชา <strong>{deleteTarget?.code}</strong> ใช่หรือไม่?
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
              ลบวิชา
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
