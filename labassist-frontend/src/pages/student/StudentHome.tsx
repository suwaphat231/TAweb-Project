import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { studentApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card } from '../../components/ui/Card'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'

export default function StudentHome() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: studentApi.dashboard,
  })

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>
          สวัสดี, {user?.full_name} 👋
        </h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 4 }}>
          ภาคเรียน 1 / 2567 · {user?.student_id || 'นักศึกษา'}
          {user?.gpa && ` · GPA ${user.gpa.toFixed(2)}`}
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={88} radius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard label="การสมัครทั้งหมด" value={data?.stats.total ?? 0} color="var(--primary)" icon="📋" />
          <StatCard label="รับแล้ว" value={data?.stats.accepted ?? 0} color="var(--green)" icon="✅" />
          <StatCard label="ไม่รับ" value={data?.stats.rejected ?? 0} color="var(--red)" icon="❌" />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)' }}>การสมัครล่าสุด</h2>
        <Link to="/student/apply"><Button size="sm">+ สมัครวิชาใหม่</Button></Link>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24 }}><Skeleton count={4} height={20} gap={14} /></div>
        ) : (data?.applications.length ?? 0) === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--ink-400)', marginBottom: 16 }}>ยังไม่มีการสมัครใดๆ</p>
            <Link to="/student/apply"><Button size="sm">สมัครเลย</Button></Link>
          </div>
        ) : (
          data!.applications.slice(0, 5).map((app, i, arr) => (
            <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{app.course_code}</span>
                  <Badge value={app.role_applied} />
                  <Badge value={app.status} />
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink-700)' }}>{app.course_title}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>
                {new Date(app.applied_at).toLocaleDateString('th-TH')}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
