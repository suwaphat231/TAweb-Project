import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { reportsApi } from '../../services/api'
import { FilterChips } from '../../components/ui/FilterChips'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ReportList } from '../../components/reports/ReportList'
import { useReportCourses } from '../../components/reports/useReportCourses'
import { displayCourseTitle } from '../../utils/courseDisplay'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { Icon } from '../../components/reports/ReportIcons'

const TABS = [
  { value: 'courses', label: 'รายวิชาของฉัน' },
  { value: 'review', label: 'รายงานจากนักศึกษา' },
  { value: 'all', label: 'รายงานทั้งหมดที่ส่ง' },
]

const REVIEW_STATUS_OPTIONS = [
  { value: 'SUBMITTED', label: 'รอตรวจสอบ' },
  { value: 'CONFIRMED', label: 'ยืนยันแล้ว' },
  { value: 'NOT_SUBSTANTIATED', label: 'ไม่รับรายงาน' },
  { value: 'WITHDRAWN', label: 'ผู้ส่งถอนแล้ว' },
  { value: '', label: 'ทั้งหมด' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'DRAFT', label: 'ฉบับร่าง' },
  { value: 'CONFIRMED', label: 'รายงานแล้ว' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
]

export default function InstructorReports() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab = tabParam === 'all' || tabParam === 'review' ? tabParam : 'courses'
  const [search, setSearch] = useState('')
  const { data: groups = [], isLoading, isError, refetch } = useReportCourses()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.code.toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
  }, [groups, search])

  const courseOptions = groups.flatMap((g) => g.sections.map((s) => ({
    value: s.id,
    label: `${g.code} Sec ${s.section ?? '-'} (ภาคเรียนที่ ${g.semester})`,
  })))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ReportPageHeader
        title="บันทึกการปฏิบัติงาน Lab Boy"
        subtitle="เลือกรายวิชาเพื่อดูรายชื่อ Lab Boy และรายงานพฤติกรรมการปฏิบัติงาน — รายงานของท่านส่งแล้วมีผลทันที ส่วนรายงานที่นักศึกษาส่งมาต้องให้ท่านยืนยันก่อน อาจารย์รายวิชาอื่นจะเห็นว่านักศึกษาถูกรายงาน ผู้ถูกรายงานไม่เห็น และไม่ตัดสิทธิ์การสมัคร"
      />

      <div style={{ marginBottom: 16 }}>
        <FilterChips options={TABS} value={tab} onChange={(v) => setParams(v === 'courses' ? {} : { tab: v }, { replace: true })} />
      </div>

      {tab === 'review' ? (
        <>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 12px' }}>
            รายงานที่นักศึกษา Lab Boy ส่งมาเกี่ยวกับเพื่อนในรายวิชาที่ท่านสอน — ยังไม่มีผลจนกว่าท่านจะเปิดรายงานแล้วกดยืนยัน หรือไม่รับรายงานพร้อมเหตุผล
          </p>
          <ReportList
            queryKey="instructor-review-reports"
            fetchPage={reportsApi.reviewList}
            statusOptions={REVIEW_STATUS_OPTIONS}
            courseOptions={courseOptions}
            showReporter
            emptyText="ไม่มีรายงานจากนักศึกษา"
          />
        </>
      ) : tab === 'all' ? (
        <ReportList
          queryKey="instructor-reports"
          fetchPage={reportsApi.mine}
          statusOptions={STATUS_OPTIONS}
          courseOptions={courseOptions}
          emptyText="ยังไม่มีรายงาน"
        />
      ) : (
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
                fontSize: 14, color: 'var(--ink-900)', outline: 'none', width: '100%', background: 'var(--bg-card)',
              }}
            />
          </div>
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบรายวิชา" description="รายวิชาที่ท่านเป็นผู้สอนตามรายชื่อของภาควิชาจะแสดงที่นี่" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {filtered.map((g) => (
                <button key={g.key} className="report-card-link" onClick={() => navigate(`/instructor/reports/courses/${g.sections[0].id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--primary-50)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>{g.code}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>ภาคเรียนที่ {g.semester}</div>
                    </div>
                    <Icon name="chevron-right" size={18} style={{ color: 'var(--ink-400)' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.45, minHeight: 40 }}>
                    {displayCourseTitle(g.title, g.english_title)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-600)' }}>
                      <Icon name="users" size={14} /> Lab Boy {g.totalAccepted} คน
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>·</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>{g.sections.length} section</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
