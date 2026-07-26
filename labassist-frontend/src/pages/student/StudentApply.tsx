import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { courseApi, studentApi } from '../../services/api'
import { CourseCard } from '../../components/course/CourseCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import type { CourseStatus } from '../../types'

const filterOptions = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'open', label: 'เปิดรับ' },
  { value: 'closing_soon', label: 'ใกล้ปิด' },
]

export default function StudentApply() {
  const [filter, setFilter] = useState('')
  const [applyTarget, setApplyTarget] = useState<{ courseId: number; role: 'ta' | 'labboy' } | null>(null)
  const [selectedRole, setSelectedRole] = useState<'ta' | 'labboy'>('ta')
  const [motivation, setMotivation] = useState('')
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', filter],
    queryFn: () => courseApi.list({ status: filter as CourseStatus || undefined }),
  })

  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const applyMutation = useMutation({
    mutationFn: studentApi.apply,
    onSuccess: (app) => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      const roleLabel = app.role_applied === 'ta' ? 'TA' : 'Lab Boy'
      const code = applyTargetCourse?.code ?? ''
      showToast(`ส่งใบสมัคร ${roleLabel} วิชา ${code} เรียบร้อย รออาจารย์พิจารณา`, 'success')
      setApplyTarget(null)
      setMotivation('')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  function getCourseApp(courseId: number) {
    return myApps.find((a) => a.course_id === courseId && a.status !== 'withdrawn')
  }

  function openModal(courseId: number, role: 'ta' | 'labboy') {
    setSelectedRole(role)
    setMotivation('')
    setApplyTarget({ courseId, role })
  }

  function confirmApply() {
    if (!applyTarget) return
    applyMutation.mutate({ course_id: applyTarget.courseId, role_applied: selectedRole, motivation })
  }

  const applyTargetCourse = applyTarget ? courses.find((c) => c.id === applyTarget.courseId) : null

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>สมัคร TA / Lab Boy</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>เลือกวิชาที่คุณต้องการสมัคร</p>
      </div>

      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {courses.map((course) => {
            const app = getCourseApp(course.id)
            return (
              <CourseCard
                key={course.id}
                course={course}
                isApplied={!!app}
                appliedRole={app?.role_applied as 'ta' | 'labboy' | undefined}
                onApply={(courseId, role) => openModal(courseId, role)}
              />
            )
          })}
        </div>
      )}

      <Modal
        isOpen={!!applyTarget}
        onClose={() => setApplyTarget(null)}
        title={`สมัครตำแหน่ง — ${applyTargetCourse?.code ?? ''}`}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {applyTargetCourse && (
            <div style={{ fontSize: 14, color: 'var(--ink-700)' }}>
              <strong>{applyTargetCourse.title}</strong>
              <br />{applyTargetCourse.instructor_name}
            </div>
          )}

          {/* Role radio cards */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>เลือกตำแหน่ง</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(['ta', 'labboy'] as const).map((role) => {
                const isTA = role === 'ta'
                const accepted = isTA ? (applyTargetCourse?.ta_accepted ?? 0) : (applyTargetCourse?.labboy_accepted ?? 0)
                const slots = isTA ? (applyTargetCourse?.ta_slots ?? 0) : (applyTargetCourse?.labboy_slots ?? 0)
                const isFull = accepted >= slots && slots > 0
                const isSelected = selectedRole === role
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={isFull}
                    onClick={() => !isFull && setSelectedRole(role)}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                      background: isSelected ? 'var(--primary-50)' : isFull ? '#F5F5F5' : '#fff',
                      cursor: isFull ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: isFull ? 0.5 : 1,
                      transition: 'border .15s, background .15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--ink-900)', marginBottom: 4 }}>
                      {isTA ? 'TA' : 'Lab Boy'}
                      {isFull && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--red)' }}>เต็มแล้ว</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>
                      {accepted} / {slots} คน
                    </div>
                    <div style={{
                      marginTop: 6, height: 4, borderRadius: 999,
                      background: 'var(--line-soft)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        background: isFull ? 'var(--red)' : isSelected ? 'var(--primary)' : 'var(--ink-400)',
                        width: slots > 0 ? `${Math.min(100, (accepted / slots) * 100)}%` : '0%',
                        transition: 'width .3s',
                      }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <Textarea
            label="แรงจูงใจในการสมัคร (ไม่บังคับ)"
            placeholder="เล่าให้อาจารย์ทราบว่าทำไมคุณถึงอยากสมัครตำแหน่งนี้..."
            rows={3}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setApplyTarget(null)}>ยกเลิก</Button>
            <Button onClick={confirmApply} loading={applyMutation.isPending}>
              ยืนยันสมัคร
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
