import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { courseApi, studentApi } from '../../services/api'
import { CourseCard } from '../../components/course/CourseCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { SkeletonCard } from '../../components/ui/Skeleton'
import type { Course, CourseStatus } from '../../types'

const chips = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'open', label: 'เปิดรับ' },
  { value: 'closing_soon', label: 'ใกล้ปิด' },
]

export default function StudentApply() {
  const [filter, setFilter] = useState('')
  const [applyTarget, setApplyTarget] = useState<{ course: Course; role: 'ta' | 'labboy' } | null>(null)
  const [motivation, setMotivation] = useState('')
  const qc = useQueryClient()

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      setApplyTarget(null)
      setMotivation('')
    },
  })

  function isApplied(courseId: number, role: 'ta' | 'labboy') {
    return myApps.some((a) => a.course_id === courseId && a.role_applied === role && a.status !== 'withdrawn')
  }

  function handleApply(course: Course, role: 'ta' | 'labboy') {
    setApplyTarget({ course, role })
  }

  function confirmApply() {
    if (!applyTarget) return
    applyMutation.mutate({ course_id: applyTarget.course.id, role_applied: applyTarget.role, motivation })
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>สมัคร TA / Lab Boy</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>เลือกวิชาที่คุณต้องการสมัคร</p>
      </div>

      <FilterChips chips={chips} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              showApply
              applied={{ ta: isApplied(course.id, 'ta'), labboy: isApplied(course.id, 'labboy') }}
              onApply={handleApply}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!applyTarget}
        onClose={() => setApplyTarget(null)}
        title={`สมัคร ${applyTarget?.role === 'ta' ? 'TA' : 'Lab Boy'} — ${applyTarget?.course.code}`}
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-700)' }}>
            <strong>{applyTarget?.course.title}</strong>
            <br />{applyTarget?.course.instructor_name}
          </div>
          <Textarea
            label="แรงจูงใจในการสมัคร (ไม่บังคับ)"
            placeholder="เล่าให้อาจารย์ทราบว่าทำไมคุณถึงอยากสมัครตำแหน่งนี้..."
            rows={4}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setApplyTarget(null)}>ยกเลิก</Button>
            <Button onClick={confirmApply} loading={applyMutation.isPending}>
              ยืนยันสมัคร (ติดเลย)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
