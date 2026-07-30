import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { courseApi, studentApi } from '../../services/api'
import { CourseCard } from '../../components/course/CourseCard'
import { Card } from '../../components/ui/Card'
import { FilterChips } from '../../components/ui/FilterChips'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { useApplyLabboy } from '../../hooks/useApplyLabboy'
import { groupCourseSections, getAppliedSection } from '../../utils/courseGrouping'
import type { CourseStatus } from '../../types'

const filterOptions = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'open', label: 'เปิดรับ' },
  { value: 'closing_soon', label: 'ใกล้ปิด' },
]

export default function StudentApply() {
  const [filter, setFilter] = useState('')
  const { openApply, modal } = useApplyLabboy()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', filter],
    queryFn: () => courseApi.list({ status: filter as CourseStatus || undefined }),
  })

  // "ทั้งหมด" only ever means "every course actually accepting applications" —
  // draft/closed/archived courses are real academic courses not yet opened
  // for Lab Boy hiring, so students must never see them here.
  const visibleCourses = filter === '' ? courses.filter((c) => c.status === 'open' || c.status === 'closing_soon') : courses

  // Each section an instructor teaches is its own Course row under the
  // hood (own schedule + own slot count), but students apply through one
  // combined post per course/instructor/term and pick a section inside it.
  const groups = groupCourseSections(visibleCourses)

  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>สมัคร Lab Boy</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>เลือกวิชาที่คุณต้องการสมัคร</p>
      </div>

      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>ยังไม่มีวิชาเปิดรับสมัครในขณะนี้</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {groups.map((group) => (
            <CourseCard
              key={group.key}
              group={group}
              appliedSection={getAppliedSection(group, myApps)}
              onApply={openApply}
            />
          ))}
        </div>
      )}

      {modal}
    </div>
  )
}
