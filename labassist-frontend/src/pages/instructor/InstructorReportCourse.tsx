import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { instructorApi, reportsApi } from '../../services/api'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { PageLoading } from '../../components/ui/PageLoading'
import { Skeleton } from '../../components/ui/Skeleton'
import { ReportStatusBadge } from '../../components/reports/ReportStatusBadge'
import { ReportFormModal } from '../../components/reports/ReportFormModal'
import type { ReportTarget } from '../../components/reports/ReportFormModal'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { Icon } from '../../components/reports/ReportIcons'
import { useReportCourses } from '../../components/reports/useReportCourses'
import { categoryLabel, formatDate } from '../../components/reports/reportLabels'
import { displayCourseTitle } from '../../utils/courseDisplay'
import type { Application, LabBoyReport, ReportStatus } from '../../types'

const IN_PROGRESS: ReportStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_RESPONSE']

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone, marginTop: 4, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

// One course (all its sections): every Lab Boy the instructor accepted, the
// reports already filed about each, and a button to file a new one.
export default function InstructorReportCourse() {
  const { courseId } = useParams()
  const id = Number(courseId) || 0
  const navigate = useNavigate()
  const { data: groups = [], isLoading: groupsLoading, isError: groupsError } = useReportCourses()
  const group = groups.find((g) => g.sections.some((s) => s.id === id))
  const sections = group?.sections ?? []

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [target, setTarget] = useState<ReportTarget | null>(null)

  const applicantQueries = useQueries({
    queries: sections.map((s) => ({
      queryKey: ['applicants', s.id],
      queryFn: () => instructorApi.applicants(s.id),
    })),
  })
  // Reports this instructor filed per section; a course rarely has more than
  // a handful, so one 100-row page per section covers it.
  const reportQueries = useQueries({
    queries: sections.map((s) => ({
      queryKey: ['instructor-reports', { course_id: s.id, limit: 100 }],
      queryFn: () => reportsApi.mine({ course_id: s.id, limit: 100 }),
    })),
  })

  const loading = applicantQueries.some((q) => q.isLoading) || reportQueries.some((q) => q.isLoading)
  const failed = applicantQueries.some((q) => q.isError) || reportQueries.some((q) => q.isError)

  const allLabBoys = useMemo(() =>
    applicantQueries.flatMap((r) => r.data ?? [])
      .filter((a: Application) => a.status === 'accepted')
      .sort((a, b) => a.student_name.localeCompare(b.student_name, 'th')),
  [applicantQueries])

  const labBoys = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allLabBoys.filter((a) => !q || a.student_name.toLowerCase().includes(q) || a.student_code.toLowerCase().includes(q))
  }, [allLabBoys, search])

  const allReports = useMemo(() => reportQueries.flatMap((q) => q.data?.data ?? []), [reportQueries])
  const reportsByApp = useMemo(() => {
    const m = new Map<number, LabBoyReport[]>()
    for (const r of allReports) m.set(r.application_id, [...(m.get(r.application_id) ?? []), r])
    return m
  }, [allReports])

  if (groupsLoading) return <PageLoading />
  if (groupsError) return <ErrorState />
  if (!group) {
    return <EmptyState title="ไม่พบรายวิชา" description="รายวิชานี้ไม่อยู่ในรายวิชาที่ท่านเป็นผู้สอน" action={{ label: 'กลับไปหน้ารายวิชา', onClick: () => navigate('/instructor/reports') }} />
  }

  const title = displayCourseTitle(group.title, group.english_title)
  const courseLabel = (a: Application) => `${group.code} ${title} · Sec ${a.course_section ?? '-'} (${group.semester}/${group.academic_year})`

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <ReportPageHeader
        crumbs={[{ label: 'รายวิชาทั้งหมด', to: '/instructor/reports' }, { label: group.code }]}
        title={<><span style={{ color: 'var(--primary)' }}>{group.code}</span> {title}</>}
        subtitle={`ภาค ${group.semester}/${group.academic_year} · กด "รายงานพฤติกรรม" ที่ชื่อนักศึกษาเพื่อบันทึกเหตุการณ์พร้อมเหตุผล`}
      />

      <div className="report-stats">
        <Stat label="Lab Boy ในรายวิชา" value={allLabBoys.length} tone="var(--ink-900)" />
        <Stat label="รายงานที่บันทึก" value={allReports.length} tone="var(--primary)" />
        <Stat label="อยู่ระหว่างตรวจสอบ" value={allReports.filter((r) => IN_PROGRESS.includes(r.status)).length} tone="var(--amber)" />
        <Stat label="ยืนยันแล้ว" value={allReports.filter((r) => r.status === 'CONFIRMED').length} tone="var(--primary-700)" />
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-card)', border: '1.5px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', flex: 1 }}>รายชื่อ Lab Boy</h2>
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

        {failed ? (
          <ErrorState compact onRetry={() => { applicantQueries.forEach((q) => q.refetch()); reportQueries.forEach((q) => q.refetch()) }} />
        ) : loading ? (
          <div style={{ padding: 24 }}><Skeleton lines={4} height={14} /></div>
        ) : labBoys.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 14, color: 'var(--ink-400)' }}>
            {search ? 'ไม่พบนักศึกษาที่ค้นหา' : 'ยังไม่มี Lab Boy ที่ได้รับคัดเลือกในรายวิชานี้'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {labBoys.map((a, i) => {
              const reports = reportsByApp.get(a.id) ?? []
              const open = expanded === a.id
              const panelId = `reports-${a.id}`
              return (
                <li key={a.id} style={{ borderBottom: i < labBoys.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
                    <Avatar size={40} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-900)' }}>{a.student_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 1 }}>
                        {a.student_code || '—'}{sections.length > 1 && a.course_section ? ` · Sec ${a.course_section}` : ''}
                      </div>
                    </div>
                    {reports.length > 0 ? (
                      <button
                        onClick={() => setExpanded(open ? null : a.id)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 999, padding: '4px 12px', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                      >
                        <Icon name="file" size={14} /> รายงาน {reports.length} รายการ
                        <Icon name="chevron-right" size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      </button>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีรายงาน</span>
                    )}
                    <Button
                      variant="outline"
                      icon={<Icon name="flag" size={14} />}
                      style={{ minHeight: 40 }}
                      onClick={() => setTarget({ applicationId: a.id, studentName: a.student_name, studentCode: a.student_code, courseLabel: courseLabel(a) })}
                    >
                      รายงานพฤติกรรม
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
          target={target}
          onClose={() => setTarget(null)}
          onSaved={() => { setExpanded(target.applicationId); setTarget(null) }}
        />
      )}
    </div>
  )
}
