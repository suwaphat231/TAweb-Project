import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../services/api'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { PageLoading } from '../../components/ui/PageLoading'
import { ReportStatusBadge } from '../../components/reports/ReportStatusBadge'
import { ReportFormModal } from '../../components/reports/ReportFormModal'
import type { ReportTarget } from '../../components/reports/ReportFormModal'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { Icon } from '../../components/reports/ReportIcons'
import { categoryLabel, formatDate } from '../../components/reports/reportLabels'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { LabBoyReport } from '../../types'

// One course the student is a Lab Boy of: the other Lab Boys there, the
// reports this student already sent about each, and a button to report one
// to the course's instructor.
export default function StudentReportCourse() {
  const { courseKey = '' } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [target, setTarget] = useState<ReportTarget | null>(null)

  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-report-courses'],
    queryFn: reportsApi.studentCourses,
  })
  // A student files only a handful of reports, so one 100-row page covers it.
  const { data: filed } = useQuery({
    queryKey: ['student-filed-reports', { limit: 100 }],
    queryFn: () => reportsApi.studentFiled({ limit: 100 }),
  })

  const course = courses.find((c) => c.key === courseKey)
  const peers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (course?.peers ?? [])
      .filter((p) => !q || p.student_name.toLowerCase().includes(q) || p.student_code.toLowerCase().includes(q))
  }, [course, search])
  const reportsByApp = useMemo(() => {
    const m = new Map<number, LabBoyReport[]>()
    for (const r of filed?.data ?? []) m.set(r.application_id, [...(m.get(r.application_id) ?? []), r])
    return m
  }, [filed])

  if (isLoading) return <PageLoading />
  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (!course) {
    return <EmptyState title="ไม่พบรายวิชา" description="รายวิชานี้ไม่อยู่ในรายวิชาที่คุณเป็น Lab Boy" action={{ label: 'กลับไปหน้ารายวิชา', onClick: () => navigate('/student/reports') }} />
  }

  const title = displayCourseTitle(course.course_title, course.english_title)
  const multiSection = new Set(course.peers.map((p) => p.section)).size > 1 || course.my_sections.length > 1

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <ReportPageHeader
        crumbs={[{ label: 'รายงาน / Blacklist', to: '/student/reports' }, { label: course.course_code }]}
        title={<><span style={{ color: 'var(--primary)' }}>{course.course_code}</span> {title}</>}
        subtitle={`ภาค ${course.semester}/${course.academic_year} · คุณเป็น Lab Boy Sec ${course.my_sections.join(', ')} · กด "รายงาน" ที่ชื่อเพื่อนเพื่อส่งเรื่องให้อาจารย์ประจำวิชา ผู้ถูกรายงานจะไม่เห็นชื่อคุณ`}
      />

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-card)', border: '1.5px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', flex: 1 }}>
            รายชื่อ Lab Boy คนอื่น ({course.peers.length})
          </h2>
          <div style={{ position: 'relative', width: 'min(100%, 260px)' }}>
            <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / รหัสนักศึกษา"
              aria-label="ค้นหานักศึกษา"
              style={{ padding: '8px 12px 8px 34px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)', fontSize: 14, color: 'var(--ink-900)', outline: 'none', width: '100%', background: '#fff' }}
            />
          </div>
        </div>

        {peers.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 14, color: 'var(--ink-400)' }}>
            {search ? 'ไม่พบนักศึกษาที่ค้นหา' : 'ยังไม่มี Lab Boy คนอื่นในรายวิชานี้'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {peers.map((p, i) => {
              const reports = reportsByApp.get(p.application_id) ?? []
              const open = expanded === p.application_id
              const panelId = `my-reports-${p.application_id}`
              return (
                <li key={p.application_id} style={{ borderBottom: i < peers.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
                    <Avatar size={40} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-900)' }}>{p.student_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 1 }}>
                        {p.student_code || '—'}{multiSection ? ` · Sec ${p.section || '-'}` : ''}
                      </div>
                    </div>
                    {reports.length > 0 && (
                      <button
                        onClick={() => setExpanded(open ? null : p.application_id)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 999, padding: '4px 12px', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                      >
                        <Icon name="file" size={14} /> ฉันรายงานแล้ว {reports.length} รายการ
                        <Icon name="chevron-right" size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      </button>
                    )}
                    <Button
                      variant="outline"
                      icon={<Icon name="flag" size={14} />}
                      style={{ minHeight: 40 }}
                      onClick={() => setTarget({
                        applicationId: p.application_id, studentName: p.student_name, studentCode: p.student_code,
                        courseLabel: `${course.course_code} ${title} · Sec ${p.section || '-'} (${course.semester}/${course.academic_year})`,
                      })}
                    >
                      รายงาน
                    </Button>
                  </div>
                  {open && (
                    <div id={panelId} style={{ padding: '0 18px 16px 72px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reports.map((r) => (
                        <button key={r.id} className="report-row-link" onClick={() => navigate(`/reports/${r.id}`)}>
                          <Icon name="calendar" size={14} style={{ color: 'var(--ink-400)' }} />
                          <span style={{ fontSize: 13, color: 'var(--ink-600)', minWidth: 76 }}>{formatDate(r.incident_date)}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', flex: 1, minWidth: 160 }}>{categoryLabel[r.category]}</span>
                          <ReportStatusBadge status={r.status} />
                          <Icon name="chevron-right" size={16} style={{ color: 'var(--ink-400)' }} />
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {target && (
        <ReportFormModal
          as="student"
          target={target}
          onClose={() => setTarget(null)}
          onSaved={() => { setExpanded(target.applicationId); setTarget(null) }}
        />
      )}
    </div>
  )
}
