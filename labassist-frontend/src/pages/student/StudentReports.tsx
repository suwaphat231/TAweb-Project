import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../services/api'
import { FilterChips } from '../../components/ui/FilterChips'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { Icon } from '../../components/reports/ReportIcons'
import { displayCourseTitle } from '../../utils/courseDisplay'

type Tab = 'courses' | 'about' | 'filed'

const TABS = [
  { value: 'courses', label: 'รายวิชาของฉัน' },
  { value: 'about', label: 'รายงานเกี่ยวกับฉัน' },
  { value: 'filed', label: 'รายงานที่ฉันส่ง' },
]

const ABOUT_STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'SUBMITTED,UNDER_REVIEW,AWAITING_RESPONSE', label: 'รออาจารย์พิจารณา' },
  { value: 'CONFIRMED', label: 'Blacklist' },
  { value: 'NOT_SUBSTANTIATED', label: 'ยกรายงาน' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
]

const FILED_STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'DRAFT', label: 'ฉบับร่าง' },
  ...ABOUT_STATUS_OPTIONS.slice(1),
]

// MyCourses is the menu of courses the student works in as a Lab Boy; each
// opens the list of fellow Lab Boys there, who are the only ones a student
// may report.
function MyCourses() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-report-courses'],
    queryFn: reportsApi.studentCourses,
  })
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => c.course_code.toLowerCase().includes(q)
      || displayCourseTitle(c.course_title, c.english_title).toLowerCase().includes(q))
  }, [courses, search])

  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (courses.length === 0) {
    return <EmptyState title="ยังไม่มีรายวิชา" description="รายวิชาที่คุณได้รับคัดเลือกเป็น Lab Boy จะแสดงที่นี่ พร้อมรายชื่อ Lab Boy คนอื่นในวิชานั้น" />
  }
  return (
    <>
      <div style={{ position: 'relative', width: 'min(100%, 300px)', marginBottom: 16 }}>
        <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัสวิชา / ชื่อวิชา"
          aria-label="ค้นหารายวิชา"
          style={{
            padding: '9px 12px 9px 34px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 14, color: 'var(--ink-900)', outline: 'none', width: '100%', background: '#fff',
          }}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบรายวิชา" description="ลองค้นหาด้วยรหัสหรือชื่อวิชาอื่น" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map((c) => (
            <button key={c.key} className="report-card-link" onClick={() => navigate(`/student/reports/courses/${encodeURIComponent(c.key)}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--primary-50)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="book" size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>{c.course_code}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>ภาค {c.semester}/{c.academic_year}</div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: 'var(--ink-400)' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.45, minHeight: 40 }}>
                {displayCourseTitle(c.course_title, c.english_title)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-600)' }}>
                  <Icon name="users" size={14} /> Lab Boy คนอื่น {c.peers.length} คน
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>ฉันอยู่ Sec {c.my_sections.join(', ')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function StudentReports() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'about' || tabParam === 'filed' ? tabParam : 'courses'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <ReportPageHeader
        title="รายงาน / Blacklist"
        subtitle="เลือกรายวิชาที่คุณเป็น Lab Boy เพื่อดูรายชื่อ Lab Boy คนอื่นและรายงานพฤติกรรมให้อาจารย์ประจำวิชาพิจารณา ผู้ถูกรายงานจะไม่เห็นชื่อคุณ — รายงานเกี่ยวกับคุณที่ยังรอพิจารณาไม่ใช่ข้อสรุป คุณส่งคำชี้แจงได้ และหากถูก Blacklist ยื่นอุทธรณ์ได้ภายใน 15 วันที่แท็บ &quot;รายงานเกี่ยวกับฉัน&quot;"
      />

      <div style={{ marginBottom: 16 }}>
        <FilterChips options={TABS} value={tab} onChange={(v) => setParams(v === 'courses' ? {} : { tab: v }, { replace: true })} />
      </div>

      {tab === 'courses' ? (
        <MyCourses />
      ) : tab === 'filed' ? (
        <ReportList
          key="filed"
          queryKey="student-filed-reports"
          fetchPage={reportsApi.studentFiled}
          statusOptions={FILED_STATUS_OPTIONS}
          showSearch={false}
          emptyText="คุณยังไม่เคยส่งรายงาน"
        />
      ) : (
        <ReportList
          key="about"
          queryKey="student-reports"
          fetchPage={reportsApi.studentReports}
          statusOptions={ABOUT_STATUS_OPTIONS}
          showSearch={false}
          showStudent={false}
          emptyText="ไม่มีรายงานที่เกี่ยวข้องกับคุณ"
        />
      )}
    </div>
  )
}
