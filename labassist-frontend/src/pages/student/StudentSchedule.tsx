import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { cleanCourseTitle } from '../../utils/courseTitle'
import type { WorkSession } from '../../types'

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayNum(iso: string) {
  return iso.split('-')[2].replace(/^0/, '')
}

function fmtMonthShort(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short' })
}

function fmtDayShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { weekday: 'short' })
}

function fmtFull(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtSubtitle(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function groupByMonth(sessions: WorkSession[]): [string, WorkSession[]][] {
  const map = new Map<string, WorkSession[]>()
  for (const s of sessions) {
    const [y, mo] = s.session_date.split('-').map(Number)
    const key = new Date(y, mo - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries())
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentSchedule() {
  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['work-schedule'],
    queryFn: studentApi.workSchedule,
  })

  const today = todayISO()
  const upcoming = sessions.filter((s) => s.session_date >= today)
  const past     = sessions.filter((s) => s.session_date < today)
  const totalHours = sessions.reduce((n, s) => n + (s.hours_per_session || 0), 0)
  const nextSession = upcoming[0] ?? null
  const grouped = useMemo(() => groupByMonth(sessions), [sessions])

  return (
    <div>
      {/* ── Hero banner ── */}
      <div style={{
        background: 'var(--brand-gradient)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Lab Boy
            </p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>ตารางปฏิบัติงาน</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
              วันที่คุณต้องปฏิบัติงานทั้งหมดในฐานะ Lab Boy
            </p>
          </div>
          {!isLoading && !isError && sessions.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatPill value={upcoming.length} label="ที่กำลังจะมา" />
              <StatPill value={past.length} label="ผ่านแล้ว" dim />
              {totalHours > 0 && <StatPill value={totalHours} label="ชม. รวม" />}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={80} borderRadius={14} />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="ยังไม่มีตารางปฏิบัติงาน"
          description="ตารางจะแสดงเมื่อคุณได้รับการคัดเลือกและอาจารย์ยืนยันตารางแล้ว"
          icon="📅"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── Next session spotlight ── */}
          {nextSession && (
            <section>
              <SectionLabel text={nextSession.session_date === today ? '🔔 วันนี้' : 'ครั้งถัดไป'} />
              <NextCard session={nextSession} today={today} />
            </section>
          )}

          {/* ── Full timeline ── */}
          <section>
            {nextSession && <SectionLabel text="ตารางทั้งหมด" />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {grouped.map(([month, items]) => (
                <MonthGroup key={month} month={month} items={items} today={today} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: 'var(--ink-400)',
      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
    }}>
      {text}
    </div>
  )
}

function StatPill({ value, label, dim }: { value: number; label: string; dim?: boolean }) {
  return (
    <div style={{
      background: dim ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.2)',
      borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 68,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: dim ? 'rgba(255,255,255,0.7)' : '#fff', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

function NextCard({ session, today }: { session: WorkSession; today: string }) {
  const isToday = session.session_date === today
  return (
    <div style={{
      background: isToday
        ? 'linear-gradient(135deg, #16A34A, #15803D)'
        : 'linear-gradient(135deg, var(--primary), var(--navy))',
      borderRadius: 14, padding: '20px 24px', color: '#fff',
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      boxShadow: isToday
        ? '0 4px 20px rgba(22,163,74,0.25)'
        : '0 4px 20px rgba(56,65,157,0.22)',
    }}>
      {/* Date block */}
      <div style={{
        flexShrink: 0,
        background: 'rgba(255,255,255,0.18)', borderRadius: 12,
        padding: '12px 18px', textAlign: 'center', minWidth: 68,
      }}>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>
          {dayNum(session.session_date)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, fontWeight: 600 }}>
          {fmtMonthShort(session.session_date)}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
          {fmtDayShort(session.session_date)}
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 150 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '3px 10px',
          }}>
            {session.course_code}{session.course_section > 0 ? ` · กลุ่ม ${session.course_section}` : ''}
          </span>
          {isToday && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#fff', color: '#15803D', borderRadius: 6, padding: '3px 8px' }}>
              วันนี้
            </span>
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35, marginBottom: 6 }}>
          {cleanCourseTitle(session.course_title)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          {fmtFull(session.session_date)}
        </div>
      </div>

      {/* Time */}
      {(session.work_time_start || session.work_time_end) && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(255,255,255,0.15)', borderRadius: 10,
          padding: '10px 18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>
            {session.work_time_start}
          </div>
          {session.work_time_end && (
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
              ถึง {session.work_time_end}
            </div>
          )}
          {session.hours_per_session > 0 && (
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
              {session.hours_per_session} ชม.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MonthGroup({ month, items, today }: { month: string; items: WorkSession[]; today: string }) {
  return (
    <div>
      {/* Month header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--ink-500)',
          letterSpacing: '0.05em', flexShrink: 0,
        }}>
          {month.toUpperCase()}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--primary)',
          background: 'var(--primary-50)', borderRadius: 99,
          padding: '2px 8px', border: '1px solid var(--primary-100)', flexShrink: 0,
        }}>
          {items.length} ครั้ง
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s, i) => (
          <SessionRow
            key={`${s.document_id}-${s.session_date}-${i}`}
            session={s}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}

function SessionRow({ session, today }: { session: WorkSession; today: string }) {
  const past    = session.session_date < today
  const isToday = session.session_date === today

  const dateBg     = isToday ? '#DCFCE7' : past ? 'var(--line-soft)' : 'var(--primary-50)'
  const dateBorder = isToday ? '#BBF7D0' : past ? 'var(--line)' : 'var(--primary-100)'
  const dateColor  = isToday ? 'var(--green)' : past ? 'var(--ink-400)' : 'var(--primary)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 18px', borderRadius: 12,
      background: isToday ? 'var(--green-bg)' : past ? '#FAFAFA' : '#fff',
      border: `1.5px solid ${isToday ? 'var(--green)' : past ? 'var(--line-soft)' : 'var(--line)'}`,
      opacity: past ? 0.72 : 1,
      boxShadow: isToday
        ? '0 0 0 3px rgba(22,163,74,0.08)'
        : past ? 'none' : '0 1px 3px rgba(15,23,42,0.04)',
    }}>
      {/* Date badge */}
      <div style={{
        flexShrink: 0, width: 50, textAlign: 'center',
        background: dateBg, borderRadius: 10, padding: '7px 0',
        border: `1px solid ${dateBorder}`,
      }}>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: dateColor }}>
          {dayNum(session.session_date)}
        </div>
        <div style={{ fontSize: 10, color: dateColor, marginTop: 2, fontWeight: 600 }}>
          {fmtMonthShort(session.session_date)}
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: dateColor }}>
            {session.course_code}
          </span>
          {session.course_section > 0 && (
            <span style={{
              fontSize: 10, color: 'var(--ink-400)',
              background: 'var(--line-soft)', borderRadius: 4, padding: '1px 5px',
            }}>
              กลุ่ม {session.course_section}
            </span>
          )}
          {isToday && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: '#DCFCE7', borderRadius: 4, padding: '1px 6px' }}>
              วันนี้
            </span>
          )}
          {past && (
            <span style={{ fontSize: 10, color: 'var(--ink-400)', background: 'var(--line-soft)', borderRadius: 4, padding: '1px 5px' }}>
              ผ่านแล้ว
            </span>
          )}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: past ? 'var(--ink-500)' : 'var(--ink-900)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {cleanCourseTitle(session.course_title)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
          {fmtSubtitle(session.session_date)}
        </div>
      </div>

      {/* Time */}
      {(session.work_time_start || session.work_time_end) && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: isToday ? 'var(--green)' : past ? 'var(--ink-400)' : 'var(--ink-700)',
          }}>
            {session.work_time_start}{session.work_time_end ? `–${session.work_time_end}` : ''}
          </div>
          {session.hours_per_session > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
              {session.hours_per_session} ชม.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
