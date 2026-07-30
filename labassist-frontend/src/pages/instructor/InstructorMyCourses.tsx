import { useQuery, useQueries } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { displayCourseTitle } from '../../utils/courseDisplay'

// Read-only view: just "which courses do I teach, and who got in as Lab Boy
// for each" — no posting/status management here, that lives on the
// ภาพรวม/จัดการประกาศ pages.
export default function InstructorMyCourses() {
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
  })

  const applicantQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-applicants', c.id],
      queryFn: () => instructorApi.applicants(c.id),
    })),
  })

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>วิชาของฉัน</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>รายวิชาที่สอน พร้อม Lab Boy ที่ผ่านการคัดเลือกในแต่ละวิชา</p>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={140} borderRadius={12} />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState title="ยังไม่มีวิชาที่สอน" icon="📚" />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {courses.map((c, i) => {
            const applicants = applicantQueries[i]?.data ?? []
            const accepted = applicants.filter((a) => a.status === 'accepted')
            return (
              <Card key={c.id} padding={0}>
                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                        {c.code}
                      </span>
                      {!!c.section && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--bg)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>
                          Sec {c.section}
                        </span>
                      )}
                      <StatusBadge value={c.status} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{displayCourseTitle(c.title, c.english_title)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                      ภาค {c.semester}/{c.academic_year}
                      {c.schedule && <span> · 🕐 {c.schedule}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>
                    Lab Boy {c.labboy_accepted} / {c.labboy_slots} คน
                  </div>
                </CardHeader>
                <CardBody>
                  {accepted.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีผู้ผ่านการคัดเลือก</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                      {accepted.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line-soft)', borderRadius: 10 }}>
                          <Avatar initials={getInitials(a.student_name)} color="purple" size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.student_name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.student_code || '—'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
