import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { staffApi } from '../../services/api'
import { buildCourseOffering, applyFilters } from './staffCourseUtils'
import { SummaryCards } from './components/SummaryCards'
import { CourseFilters, type FilterState } from './components/CourseFilters'
import { StaffCourseCard } from './components/StaffCourseCard'
import type { CourseOffering } from '../../types'

const DEFAULT_FILTERS: FilterState = {
  search: '',
  semester: '',
  academicYear: '',
  docStatus: '',
  instructor: '',
}

export default function StaffHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['staff-reviews'],
    queryFn: () => staffApi.listReviews(),
  })

  const { data: allDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  const loading = reviewsLoading || docsLoading

  // Build CourseOffering from FormReview + Document data
  const offerings = useMemo<CourseOffering[]>(
    () => reviews.map((r) => buildCourseOffering(r, allDocs)),
    [reviews, allDocs],
  )

  // Unique filter options derived from offerings
  const instructors = useMemo(
    () => [...new Set(offerings.flatMap((o) => o.instructors.map((i) => i.name)))].sort(),
    [offerings],
  )
  const semesters = useMemo(
    () => [...new Set(offerings.map((o) => o.semester))].sort(),
    [offerings],
  )
  const academicYears = useMemo(
    () => [...new Set(offerings.map((o) => String(o.academicYear)))].sort((a, b) => Number(b) - Number(a)),
    [offerings],
  )

  const filtered = useMemo(
    () => applyFilters(offerings, filters.search, filters.instructor, filters.semester, filters.academicYear, filters.docStatus),
    [offerings, filters],
  )

  function handleCourseAction(offering: CourseOffering) {
    navigate(`/staff/course/${offering.academicYear}/${offering.semester}/${offering.courseCode}/${offering.sectionNo}`)
  }

  return (
    <div>
      {/* Page header */}
      <div className="dashboard-banner" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              สวัสดี, {user?.full_name}
            </h1>
            <p style={{ fontSize: 13, opacity: 0.85 }}>
              ระบบจัดการงานเอกสารแยกตามรายวิชา — ภาควิชาคอมพิวเตอร์ มศก.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="/staff/docs"
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              เอกสารทั้งหมด
            </a>
            <a
              href="/staff/review"
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 600,
                borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                background: '#fff', color: 'var(--primary)',
                border: 'none', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              ตรวจสอบแบบฟอร์ม
            </a>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards offerings={filtered.length > 0 ? offerings : offerings} loading={loading} />

      {/* Filters */}
      <CourseFilters
        filters={filters}
        instructors={instructors}
        semesters={semesters}
        academicYears={academicYears}
        onChange={setFilters}
      />

      {/* Course cards grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              height: 260, background: '#fff', border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius-card)', padding: 20,
            }}>
              <div style={{ height: 16, width: '60%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 12 }} />
              <div style={{ height: 13, width: '80%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 20 }} />
              <div style={{ height: 13, width: '50%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 10 }} />
              <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 999 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '64px 24px', textAlign: 'center',
          background: '#fff', border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius-card)',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="2"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
            {offerings.length === 0 ? 'ยังไม่มีรายวิชาในระบบ' : 'ไม่พบรายวิชาที่ตรงกัน'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            {offerings.length === 0
              ? 'รายวิชาจะปรากฏเมื่ออาจารย์ส่งแบบฟอร์มแจ้งความประสงค์เข้ามา'
              : 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 12 }}>
            แสดง {filtered.length} รายวิชา{filtered.length !== offerings.length ? ` (จากทั้งหมด ${offerings.length})` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filtered.map((offering) => (
              <StaffCourseCard
                key={`${offering.academicYear}-${offering.semester}-${offering.courseCode}-${offering.sectionNo}`}
                offering={offering}
                onAction={handleCourseAction}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
