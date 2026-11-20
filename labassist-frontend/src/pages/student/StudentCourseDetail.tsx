import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { studentApi, coursesAPI } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge, Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useApplyLabboy } from '../../hooks/useApplyLabboy'
import { groupCourseSections, getAppliedSections, scheduleDayLabel } from '../../utils/courseGrouping'
import { parseSchedule } from '../../utils/schedule'
import { cleanCourseTitle } from '../../utils/courseTitle'
import { splitRequirements } from '../instructor/_courseFormShared'
import type { Course } from '../../types'

const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

// สีประจำวันแบบไทย — ใช้แค่จุดสี/แถบเล็ก ๆ เพื่อไม่ให้หน้าดูรก
const DAY_TINT: Record<number, { dot: string; bg: string; text: string }> = {
  1: { dot: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  2: { dot: '#EC4899', bg: '#FCE7F3', text: '#9D174D' },
  3: { dot: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  4: { dot: '#F97316', bg: '#FFEDD5', text: '#9A3412' },
  5: { dot: '#3B82F6', bg: '#DBEAFE', text: '#1E40AF' },
  6: { dot: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  0: { dot: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
}
const FALLBACK_TINT = { dot: 'var(--ink-400)', bg: 'var(--line-soft)', text: 'var(--ink-600)' }

interface MeetingRow {
  key: string
  sectionId: number
  section: number
  dayIndex: number | null
  dayLabel: string
  time: string
  start?: string
  end?: string
  room: string
}

const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', margin: 0,
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span
        aria-hidden
        style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: 'var(--primary-50)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-800, var(--ink-900))', overflowWrap: 'anywhere' }}>{value}</div>
      </div>
    </div>
  )
}

// ── ตารางเวลาแบบสัปดาห์ (แสดงเฉพาะ จ–ศ + วันหยุดที่มีคาบ, ช่วงเวลาพอดีกับคาบ) ──
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function WeekTimetable({ meetings, showSection, fallbackLabel }: {
  meetings: (MeetingRow & { dayIndex: number })[]
  showSection: boolean
  fallbackLabel: string
}) {
  const earliest = Math.min(...meetings.map((m) => toMin(m.start!)))
  const latest = Math.max(...meetings.map((m) => toMin(m.end!)))
  const startH = Math.min(8, Math.floor(earliest / 60))
  const endH = Math.max(17, Math.ceil(latest / 60))
  const span = (endH - startH) * 60
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i)
  const days = WEEK_ORDER.filter((d) => (d >= 1 && d <= 5) || meetings.some((m) => m.dayIndex === d))
  const pct = (min: number) => ((min - startH * 60) / span) * 100
  const LABEL_W = 84
  const ROW_H = 60

  return (
    <div style={{ padding: '10px 28px 8px', overflowX: 'auto' }}>
      <div style={{
        minWidth: 620, borderRadius: 12, border: '1px solid var(--line)',
        background: '#fff', overflow: 'hidden',
      }}>
        {/* hour ruler */}
        <div style={{ display: 'flex', height: 34, background: '#F7F8FC', borderBottom: '1px solid var(--line)' }}>
          <div style={{
            width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: 'var(--ink-400)',
          }}>
            วัน / เวลา
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            {hours.map((h, i) => (
              <span
                key={h}
                style={{
                  position: 'absolute', top: '50%',
                  left: `${(i / (hours.length - 1)) * 100}%`,
                  transform: `translate(${i === 0 ? '4px' : i === hours.length - 1 ? 'calc(-100% - 4px)' : '-50%'}, -50%)`,
                  fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
        </div>

        {days.map((d, i) => {
          const tint = DAY_TINT[d]
          const slots = meetings.filter((m) => m.dayIndex === d)
          const active = slots.length > 0
          return (
            <div key={d} style={{ display: 'flex', height: ROW_H, borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{
                width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
                background: active ? tint.bg : 'transparent',
              }}>
                <span aria-hidden style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: active ? tint.dot : 'var(--line)',
                }} />
                <span style={{
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? tint.text : 'var(--ink-400)',
                }}>
                  {THAI_DAYS_FULL[d]}
                </span>
              </div>
              <div style={{ position: 'relative', flex: 1, background: active ? `${tint.bg}55` : 'transparent' }}>
                {/* hour guide lines */}
                {hours.slice(1, -1).map((h, hi) => (
                  <span key={h} aria-hidden style={{
                    position: 'absolute', top: 0, bottom: 0, width: 1,
                    left: `${((hi + 1) / (hours.length - 1)) * 100}%`,
                    background: 'var(--line-soft)',
                  }} />
                ))}
                {slots.map((m) => {
                  const left = pct(toMin(m.start!))
                  const width = pct(toMin(m.end!)) - left
                  return (
                    <div
                      key={m.key}
                      title={`${m.dayLabel} ${m.time}${m.room ? ` · ห้อง ${m.room}` : ''}`}
                      style={{
                        position: 'absolute', top: 7, bottom: 7,
                        left: `calc(${left}% + 3px)`, width: `calc(${width}% - 6px)`,
                        background: `linear-gradient(135deg, ${tint.bg}, #fff)`,
                        border: `1px solid ${tint.dot}55`, borderLeft: `4px solid ${tint.dot}`,
                        borderRadius: 8, boxShadow: `0 2px 6px ${tint.dot}26`,
                        padding: '0 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        overflow: 'hidden', whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: tint.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {showSection ? `Sec ${m.section}` : fallbackLabel}
                        <span style={{ fontWeight: 500, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
                      </span>
                      {m.room && (
                        <span style={{ fontSize: 11, color: tint.text, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          ห้อง {m.room}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ICON_PROPS = {
  width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export default function StudentCourseDetail() {
  const { id } = useParams<{ id: string }>()
  const courseId = Number(id)
  const navigate = useNavigate()
  const { openApply, modal } = useApplyLabboy()

  const { data: course, isLoading, isError, refetch } = useQuery({
    queryKey: ['course-detail', courseId],
    queryFn: () => coursesAPI.getById(courseId),
    enabled: !!courseId,
  })

  const { data: studentCourses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => studentApi.courses(),
  })

  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const siblingCourses = useMemo(
    () => course ? studentCourses.filter((c: Course) =>
      c.code === course.code &&
      c.semester === course.semester &&
      c.academic_year === course.academic_year &&
      c.instructor_id === course.instructor_id
    ) : [],
    [course, studentCourses],
  )

  const group = useMemo(() => {
    const list = siblingCourses.length > 0 ? siblingCourses : (course ? [course] : [])
    return groupCourseSections(list)[0] ?? null
  }, [siblingCourses, course])

  const deadline = group?.deadline
    ? new Date(group.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const appliedSections = group ? getAppliedSections(group, myApps) : []
  const appliedIds = new Set(appliedSections.map((s) => s.id))
  const { minGrade, rest: requirementsText } = splitRequirements(group?.requirements ?? course?.requirements ?? '')
  const scheduleMissing = group?.sections.some((section) => section.schedule_missing) ?? false
  const conflictingSections = group?.sections.filter((section) => section.conflict_day) ?? []
  const allSectionsConflict = Boolean(
    group && group.sections.length > 0 && conflictingSections.length === group.sections.length,
  )
  const isOpen = course?.status === 'open' || course?.status === 'closing_soon'

  const meetings = useMemo<MeetingRow[]>(() => {
    if (!group) return []
    const rows: MeetingRow[] = []
    for (const sec of group.sections) {
      const parsed = parseSchedule(sec.schedule)
      if (parsed && parsed.length > 0) {
        parsed.forEach((m, i) => rows.push({
          key: `${sec.id}-${i}`,
          sectionId: sec.id,
          section: sec.section ?? 0,
          dayIndex: m.dayIndex,
          dayLabel: THAI_DAYS_FULL[m.dayIndex],
          time: `${m.start}–${m.end}`,
          start: m.start,
          end: m.end,
          room: m.room || '',
        }))
      } else if (sec.schedule?.trim()) {
        rows.push({
          key: `${sec.id}-raw`,
          sectionId: sec.id,
          section: sec.section ?? 0,
          dayIndex: null,
          dayLabel: 'ตามที่ระบุ',
          time: sec.schedule.trim(),
          room: '',
        })
      }
    }
    const order = (d: number | null) => (d === null ? 99 : (d + 6) % 7)
    return rows.sort((a, b) => order(a.dayIndex) - order(b.dayIndex) || a.section - b.section)
  }, [group])

  const timedMeetings = meetings.filter((m): m is MeetingRow & { dayIndex: number } => m.dayIndex !== null && !!m.start)
  const conflictIds = new Set(conflictingSections.map((s) => s.id))
  const showSection = (group?.sections.length ?? 0) > 1

  if (isLoading) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 40 }}>
        <div style={{ width: 80, marginBottom: 16 }}><Skeleton height={20} /></div>
        <div style={{ marginBottom: 16 }}><Skeleton height={220} borderRadius={12} /></div>
        <Skeleton height={160} borderRadius={12} />
      </div>
    )
  }

  if (isError || !course) {
    return (
      <Card style={{ padding: 0, maxWidth: 820, margin: '0 auto' }}>
        <ErrorState title="ไม่พบข้อมูลรายวิชา" onRetry={refetch} />
      </Card>
    )
  }

  // ── CTA (ปุ่มสมัคร / สถานะ) ──────────────────────────────────────────────
  let cta: ReactNode = null
  if (group && isOpen) {
    if (appliedSections.length > 0) {
      cta = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Badge variant="green" wrap showDot>
            สมัครแล้ว{showSection ? ` (${appliedSections.map((s) => scheduleDayLabel(s.schedule) || `Sec ${s.section}`).join(', ')})` : ''}
          </Badge>
          <Link to="/student/status" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            ดูสถานะการสมัคร →
          </Link>
        </div>
      )
    } else if (scheduleMissing) {
      cta = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 260 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-500)', textAlign: 'right' }}>
            ต้องบันทึกตารางเรียนก่อนจึงจะสมัครได้
          </span>
          <Link
            to="/student/profile"
            style={{
              textDecoration: 'none', fontSize: 14, fontWeight: 600, color: 'var(--primary)',
              border: '1px solid var(--primary-100)', background: 'var(--primary-50)',
              borderRadius: 'var(--radius-btn)', padding: '10px 20px', minHeight: 44,
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            ไปกรอกตารางเรียน →
          </Link>
        </div>
      )
    } else if (allSectionsConflict) {
      cta = (
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--amber)', background: 'var(--amber-bg)',
          padding: '8px 12px', borderRadius: 8, maxWidth: 280, textAlign: 'right',
        }}>
          เวลาเรียนของคุณชนกับเวลาปฏิบัติงานทุกช่วง จึงสมัครไม่ได้
        </span>
      )
    } else {
      cta = (
        <Button size="md" onClick={() => openApply(group)} style={{ minHeight: 44, padding: '10px 28px' }}>
          สมัคร Lab Boy
        </Button>
      )
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 40 }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: 'var(--ink-500)', fontWeight: 600,
          padding: '6px 0', marginBottom: 12,
        }}
      >
        <svg {...ICON_PROPS} width={18} height={18}><polyline points="15 18 9 12 15 6" /></svg>
        กลับ
      </button>

      {/* ── Hero: ชื่อวิชา + ข้อมูลสำคัญ + ปุ่มสมัคร ─────────────────────── */}
      <Card style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px 20px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
              color: 'var(--primary)', background: 'var(--primary-50)',
              padding: '3px 12px', borderRadius: 'var(--radius-pill)',
            }}>
              {course.code}
            </span>
            <StatusBadge value={course.status} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.35, margin: 0 }}>
            {cleanCourseTitle(course.title)}
          </h1>
          {course.english_title && (
            <div style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>
              {course.english_title}
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16, marginTop: 22,
          }}>
            <MetaItem
              label="อาจารย์ผู้สอน"
              value={course.instructor_name || '—'}
              icon={<svg {...ICON_PROPS}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
            />
            <MetaItem
              label="ปิดรับสมัคร"
              value={deadline ?? 'ไม่ระบุ'}
              icon={<svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
            />
            <MetaItem
              label="ภาคการศึกษา"
              value={`${course.semester}/${course.academic_year}`}
              icon={<svg {...ICON_PROPS}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>}
            />
            {minGrade && (
              <MetaItem
                label="เกรดเฉลี่ยขั้นต่ำ"
                value={minGrade}
                icon={<svg {...ICON_PROPS}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
              />
            )}
          </div>
        </div>

        {/* Footer: CTA */}
        {cta && (
          <div style={{
            borderTop: '1px solid var(--line-soft)', background: '#FAFBFE',
            padding: '14px 28px', display: 'flex', justifyContent: 'flex-end',
          }}>
            {cta}
          </div>
        )}
      </Card>

      {/* ── ช่วงเวลาปฏิบัติงาน ─────────────────────────────────────────── */}
      <Card style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '18px 28px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={sectionTitle}>ช่วงเวลาปฏิบัติงาน</h2>
          {showSection && (
            <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>
              เลือกสมัครได้ {group?.sections.length} ช่วงเวลา
            </span>
          )}
        </div>

        {timedMeetings.length > 0 && (
          <WeekTimetable meetings={timedMeetings} showSection={showSection} fallbackLabel={course.code} />
        )}

        {meetings.length === 0 ? (
          <div style={{ padding: '12px 28px 22px', fontSize: 14, color: 'var(--ink-400)' }}>
            ยังไม่ได้ระบุเวลาปฏิบัติงาน
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '6px 16px 14px' }}>
            {meetings.map((m) => {
              const tint = m.dayIndex === null ? FALLBACK_TINT : DAY_TINT[m.dayIndex]
              const conflict = conflictIds.has(m.sectionId)
              const applied = appliedIds.has(m.sectionId)
              return (
                <li
                  key={m.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '12px', borderRadius: 10,
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    minWidth: 104, fontSize: 14, fontWeight: 700, color: tint.text,
                  }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: tint.dot, flexShrink: 0 }} />
                    {m.dayLabel}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums' }}>
                    {m.time}
                  </span>
                  {m.room && (
                    <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>ห้อง {m.room}</span>
                  )}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {showSection && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>Sec {m.section}</span>
                    )}
                    {applied && <Badge variant="green">สมัครแล้ว</Badge>}
                    {!applied && conflict && <Badge variant="amber">ชนเวลาเรียน</Badge>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* ── รายละเอียด / คุณสมบัติ ─────────────────────────────────────── */}
      {(course.description || requirementsText) && (
        <Card style={{ padding: '20px 28px' }}>
          {course.description && (
            <section style={{ marginBottom: requirementsText ? 20 : 0 }}>
              <h2 style={{ ...sectionTitle, marginBottom: 8 }}>รายละเอียด</h2>
              <p style={{ fontSize: 14, color: 'var(--ink-600)', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 }}>
                {course.description}
              </p>
            </section>
          )}
          {requirementsText && (
            <section>
              <h2 style={{ ...sectionTitle, marginBottom: 8 }}>คุณสมบัติที่ต้องการ</h2>
              <p style={{ fontSize: 14, color: 'var(--ink-600)', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 }}>
                {requirementsText}
              </p>
            </section>
          )}
        </Card>
      )}

      {modal}
    </div>
  )
}
