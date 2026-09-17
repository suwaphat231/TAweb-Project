import { useQuery } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card } from '../../components/ui/Card'
import { cleanCourseTitle } from '../../utils/courseTitle'
import type { WorkSession } from '../../types'

// Groups sessions by "MMMM YYYY" (Buddhist Era) for display.
function groupByMonth(sessions: WorkSession[]): [string, WorkSession[]][] {
  const map = new Map<string, WorkSession[]>()
  for (const s of sessions) {
    const [year, month] = s.session_date.split('-').map(Number)
    const key = new Date(year, month - 1, 1).toLocaleDateString('th-TH', {
      month: 'long',
      year: 'numeric',
    })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries())
}

function formatSessionDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function isPast(isoDate: string): boolean {
  const [year, month, day] = isoDate.split('-').map(Number)
  const session = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return session < today
}

export default function StudentSchedule() {
  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['work-schedule'],
    queryFn: studentApi.workSchedule,
  })

  const grouped = groupByMonth(sessions)
  const upcoming = sessions.filter((s) => !isPast(s.session_date)).length
  const total = sessions.length

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
          ตารางปฏิบัติงาน
        </h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>
          วันที่ต้องปฏิบัติงาน Lab Boy ทั้งหมดของคุณ
        </p>
      </div>

      {!isLoading && !isError && total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{
            background: 'var(--primary-soft, #eef2ff)',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13,
            color: 'var(--primary)',
            fontWeight: 600,
          }}>
            {upcoming} วันที่กำลังจะมาถึง
          </div>
          <div style={{
            background: 'var(--line-soft)',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 13,
            color: 'var(--ink-500)',
            fontWeight: 600,
          }}>
            {total} วันทั้งหมด
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={72} borderRadius={12} />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="ยังไม่มีตารางปฏิบัติงาน"
          description="ตารางจะแสดงเมื่อคุณได้รับการคัดเลือกและเจ้าหน้าที่สร้างเอกสารแล้ว"
          icon="📅"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouped.map(([month, items]) => (
            <div key={month}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--ink-400)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
              }}>
                {month}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((s, idx) => {
                  const past = isPast(s.session_date)
                  return (
                    <Card
                      key={`${s.document_id}-${s.session_date}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '14px 20px',
                        opacity: past ? 0.6 : 1,
                      }}
                    >
                      {/* Date badge */}
                      <div style={{
                        flexShrink: 0,
                        width: 44,
                        textAlign: 'center',
                        background: past ? 'var(--line-soft)' : 'var(--primary-soft, #eef2ff)',
                        borderRadius: 10,
                        padding: '6px 0',
                      }}>
                        <div style={{
                          fontSize: 20,
                          fontWeight: 700,
                          lineHeight: 1,
                          color: past ? 'var(--ink-400)' : 'var(--primary)',
                        }}>
                          {s.session_date.split('-')[2].replace(/^0/, '')}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: past ? 'var(--ink-400)' : 'var(--primary)',
                          marginTop: 2,
                        }}>
                          {new Date(
                            Number(s.session_date.split('-')[0]),
                            Number(s.session_date.split('-')[1]) - 1,
                            1
                          ).toLocaleDateString('th-TH', { month: 'short' })}
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: past ? 'var(--ink-500)' : 'var(--primary)',
                          }}>
                            {s.course_code}
                          </span>
                          {s.course_section > 0 && (
                            <span style={{
                              fontSize: 11,
                              color: 'var(--ink-400)',
                              background: 'var(--line-soft)',
                              borderRadius: 4,
                              padding: '1px 6px',
                            }}>
                              กลุ่ม {s.course_section}
                            </span>
                          )}
                          {past && (
                            <span style={{
                              fontSize: 11,
                              color: 'var(--ink-400)',
                              background: 'var(--line-soft)',
                              borderRadius: 4,
                              padding: '1px 6px',
                            }}>
                              ผ่านแล้ว
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cleanCourseTitle(s.course_title)}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                          {formatSessionDate(s.session_date)}
                        </div>
                      </div>

                      {/* Time */}
                      {(s.work_time_start || s.work_time_end) && (
                        <div style={{
                          flexShrink: 0,
                          textAlign: 'right',
                          fontSize: 13,
                          color: past ? 'var(--ink-400)' : 'var(--ink-700)',
                        }}>
                          <div style={{ fontWeight: 600 }}>
                            {s.work_time_start}{s.work_time_end ? `–${s.work_time_end}` : ''}
                          </div>
                          {s.hours_per_session > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                              {s.hours_per_session} ชม.
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
