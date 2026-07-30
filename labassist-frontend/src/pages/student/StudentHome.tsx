import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { studentApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton, SkeletonCard } from '../../components/ui/Skeleton'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { CourseCard } from '../../components/course/CourseCard'
import { useApplyLabboy } from '../../hooks/useApplyLabboy'
import { groupCourseSections, getAppliedSection } from '../../utils/courseGrouping'

export default function StudentHome() {
  const { user } = useAuth()
  const { openApply, modal } = useApplyLabboy()
  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: studentApi.dashboard,
  })
  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const bannerInfo = [
    user?.student_id,
    user?.gpa !== undefined && `GPA ${user.gpa.toFixed(2)}`,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      {/* Welcome banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1B4FD8 0%, #4F46E5 100%)',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        color: '#fff',
      }}>
        <Avatar initials={getInitials(user?.full_name ?? '?')} color="blue" size={64}
          style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>สวัสดี, {user?.full_name}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
            {bannerInfo}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard label="วิชาที่เปิดรับ" value={data?.stats.open_courses ?? 0} iconColor="var(--primary)" icon="📚" />
          <StatCard label="สมัครแล้ว" value={data?.stats.applied ?? 0} iconColor="var(--green)" icon="✅" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        {/* Recent courses */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>วิชาที่เปิดรับสมัคร</h2>
            <Link to="/student/apply" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
          </div>
          {isLoading ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {[1,2,3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : (data?.recent_courses?.length ?? 0) === 0 ? (
            <Card style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)' }}>ยังไม่มีวิชาเปิดรับสมัคร</Card>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {groupCourseSections(data!.recent_courses).map((group) => (
                <CourseCard
                  key={group.key}
                  group={group}
                  appliedSection={getAppliedSection(group, myApps)}
                  onApply={openApply}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent applications */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>การสมัครล่าสุด</h2>
            <Link to="/student/status" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>ดูทั้งหมด →</Link>
          </div>
          <Card style={{ overflow: 'hidden' }}>
            {isLoading ? (
              <div style={{ padding: 20 }}><Skeleton lines={4} height={18} /></div>
            ) : (data?.recent_applications?.length ?? 0) === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                <p style={{ color: 'var(--ink-400)', fontSize: 14, marginBottom: 14 }}>ยังไม่มีการสมัคร</p>
                <Link to="/student/apply"><Button size="sm">สมัครเลย</Button></Link>
              </div>
            ) : (
              data!.recent_applications.map((app, i, arr) => (
                <div key={app.id} style={{
                  padding: '12px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none',
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{app.course_code}</span>
                    <StatusBadge value={app.role_applied} />
                    <StatusBadge value={app.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.course_title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                    {new Date(app.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      {modal}
    </div>
  )
}
