import { useMemo, useState } from 'react'
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
  const [search, setSearch] = useState('')
  const { openApply, modal } = useApplyLabboy()

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', filter],
    queryFn: () => courseApi.list({ status: filter as CourseStatus || undefined }),
  })

  // "ทั้งหมด" only ever means "every course actually accepting applications" —
  // draft/closed/archived courses are real academic courses not yet opened
  // for Lab Boy hiring, so students must never see them here.
  const visibleCourses = useMemo(() => filter === '' ? courses.filter((c) => c.status === 'open' || c.status === 'closing_soon') : courses, [courses, filter])

  // Each section an instructor teaches is its own Course row under the
  // hood (own schedule + own slot count), but students apply through one
  // combined post per course/instructor/term and pick a section inside it.
  const allGroups = useMemo(() => groupCourseSections(visibleCourses), [visibleCourses])

  const q = search.trim().toLowerCase()
  const groups = q === ''
    ? allGroups
    : allGroups.filter((g) =>
        g.code.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        (g.english_title ?? '').toLowerCase().includes(q) ||
        g.instructor_name.toLowerCase().includes(q)
      )

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

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัสวิชา / ชื่อวิชา / อาจารย์..."
          style={{
            padding: '7px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 13, color: 'var(--ink-900)', outline: 'none', minWidth: 240,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
      </div>
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>
          {q ? 'ไม่พบวิชาที่ตรงกับคำค้นหา' : 'ยังไม่มีวิชาเปิดรับสมัครในขณะนี้'}
        </Card>
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
