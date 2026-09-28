import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
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

  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-courses', filter],
    queryFn: () => studentApi.courses({ status: filter as CourseStatus || undefined }),
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

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <svg
          width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัสวิชา ชื่อวิชา หรืออาจารย์..."
          style={{
            width: '100%', padding: '11px 16px 11px 42px',
            border: '1.5px solid var(--line)', borderRadius: 10,
            fontSize: 14, color: 'var(--ink-900)', outline: 'none',
            background: 'var(--bg-card)',
            boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
            transition: 'border-color .15s, box-shadow .15s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)'
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-100)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--line)'
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.06)'
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-400)', fontSize: 18, lineHeight: 1, padding: '2px 4px', borderRadius: 4,
            }}
            aria-label="ล้างการค้นหา"
          >×</button>
        )}
      </div>

      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : isError ? (
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 6 }}>
            โหลดข้อมูลไม่สำเร็จ
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>
            เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              color: '#fff', background: 'var(--primary)',
              border: 'none', borderRadius: 'var(--radius-btn)',
              cursor: 'pointer',
            }}
          >
            ลองใหม่
          </button>
        </Card>
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
