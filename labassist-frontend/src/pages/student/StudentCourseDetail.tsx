import { useMemo } from 'react'
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
import { parseSchedule, THAI_DAY_NAMES } from '../../utils/schedule'
import { cleanCourseTitle } from '../../utils/courseTitle'
import type { Course } from '../../types'

// ── Timetable UI constants (matching /student/schedule) ────────────────────────
const HOUR_W = 90
const ROW_H = 66
const LABEL_W = 88
const GRID_START = 8
const GRID_END = 19
const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

const THAI_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
// Mon → Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface DayColor {
  strip: string
  bg: string
  border: string
  text: string
  rowBg: string
  badgeBg: string
}

// สีประจำวันตามแบบไทย (จันทร์=เหลือง, อังคาร=ชมพู, พุธ=เขียว, พฤหัส=ส้ม, ศุกร์=ฟ้า, เสาร์=ม่วง, อาทิตย์=แดง)
const DAY_COLORS: Record<number, DayColor> = {
  1: { // จันทร์ (Monday) - สีเหลือง
    strip: '#F59E0B',
    bg: '#FEF3C7',
    border: '#F59E0B',
    text: '#92400E',
    rowBg: 'rgba(245, 158, 11, 0.05)',
    badgeBg: '#FFFBEB',
  },
  2: { // อังคาร (Tuesday) - สีชมพู
    strip: '#EC4899',
    bg: '#FCE7F3',
    border: '#F472B6',
    text: '#9D174D',
    rowBg: 'rgba(236, 72, 153, 0.05)',
    badgeBg: '#FDF2F8',
  },
  3: { // พุธ (Wednesday) - สีเขียว
    strip: '#10B981',
    bg: '#D1FAE5',
    border: '#34D399',
    text: '#065F46',
    rowBg: 'rgba(16, 185, 129, 0.05)',
    badgeBg: '#F0FDF4',
  },
  4: { // พฤหัสบดี (Thursday) - สีส้ม
    strip: '#F97316',
    bg: '#FFEDD5',
    border: '#FB923C',
    text: '#9A3412',
    rowBg: 'rgba(249, 115, 22, 0.05)',
    badgeBg: '#FFF7ED',
  },
  5: { // ศุกร์ (Friday) - สีฟ้า
    strip: '#3B82F6',
    bg: '#DBEAFE',
    border: '#60A5FA',
    text: '#1E40AF',
    rowBg: 'rgba(59, 130, 246, 0.05)',
    badgeBg: '#EFF6FF',
  },
  6: { // เสาร์ (Saturday) - สีม่วง
    strip: '#8B5CF6',
    bg: '#EDE9FE',
    border: '#A78BFA',
    text: '#5B21B6',
    rowBg: 'rgba(139, 92, 246, 0.05)',
    badgeBg: '#F5F3FF',
  },
  0: { // อาทิตย์ (Sunday) - สีแดง
    strip: '#EF4444',
    bg: '#FEE2E2',
    border: '#F87171',
    text: '#991B1B',
    rowBg: 'rgba(239, 68, 68, 0.05)',
    badgeBg: '#FEF2F2',
  },
}

function parseMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function timeX(t: string): number {
  return ((parseMinutes(t) - GRID_START * 60) / 60) * HOUR_W
}

function timePx(start: string, end: string): number {
  return ((parseMinutes(end) - parseMinutes(start)) / 60) * HOUR_W
}

interface MeetingSlot {
  section: number
  dayIndex: number
  dayName: string
  dayShort: string
  start: string
  end: string
  room: string
  color: DayColor
}

export default function StudentCourseDetail() {
  const { id } = useParams<{ id: string }>()
  const courseId = Number(id)
  const navigate = useNavigate()
  const { openApply, modal } = useApplyLabboy()

  // Load course details
  const { data: course, isLoading, isError, refetch } = useQuery({
    queryKey: ['course-detail', courseId],
    queryFn: () => coursesAPI.getById(courseId),
    enabled: !!courseId,
  })

  // Load student courses list (with sibling sections)
  const { data: studentCourses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => studentApi.courses(),
  })

  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  // Sibling sections
  const siblingCourses = useMemo(
    () => course ? studentCourses.filter((c: Course) =>
      c.code === course.code &&
      c.semester === course.semester &&
      c.academic_year === course.academic_year &&
      c.instructor_id === course.instructor_id
    ) : [],
    [course, studentCourses],
  )

  // Combined group
  const group = useMemo(() => {
    const list = siblingCourses.length > 0 ? siblingCourses : (course ? [course] : [])
    const groups = groupCourseSections(list)
    return groups[0] ?? null
  }, [siblingCourses, course])

  const deadline = group?.deadline
    ? new Date(group.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const appliedSections = group ? getAppliedSections(group, myApps) : []
  const scheduleMissing = group?.sections.some((section) => section.schedule_missing) ?? false
  const conflictingSections = group?.sections.filter((section) => section.conflict_day) ?? []
  const allSectionsConflict = Boolean(
    group && group.sections.length > 0 && conflictingSections.length === group.sections.length,
  )

  // Structured meeting slots (สีตามวัน: จันทร์=เหลือง, อังคาร=ชมพู, พุธ=เขียว, พฤหัส=ส้ม, ศุกร์=ฟ้า, เสาร์=ม่วง, อาทิตย์=แดง)
  const allMeetings = useMemo<MeetingSlot[]>(() => {
    if (!group) return []
    const meetings: MeetingSlot[] = []

    group.sections.forEach((sec) => {
      const parsed = parseSchedule(sec.schedule)
      if (parsed && parsed.length > 0) {
        for (const m of parsed) {
          const color = DAY_COLORS[m.dayIndex] || DAY_COLORS[1]
          meetings.push({
            section: sec.section ?? 0,
            dayIndex: m.dayIndex,
            dayName: THAI_DAY_NAMES[m.dayIndex],
            dayShort: THAI_DAYS_SHORT[m.dayIndex],
            start: m.start,
            end: m.end,
            room: m.room || '—',
            color,
          })
        }
      } else if (sec.schedule?.trim()) {
        // Fallback for custom schedule text
        const color = DAY_COLORS[1]
        meetings.push({
          section: sec.section ?? 0,
          dayIndex: 1, // default Monday for view
          dayName: 'ตามระบุ',
          dayShort: 'ตามระบุ',
          start: '09:00',
          end: '12:00',
          room: sec.schedule,
          color,
        })
      }
    })

    const dayOrder = (d: number) => (d + 6) % 7
    return meetings.sort((a, b) => dayOrder(a.dayIndex) - dayOrder(b.dayIndex) || a.section - b.section)
  }, [group])

  // Map slots by dayIndex for the timetable grid
  const slotsByDay = useMemo(() => {
    const map = new Map<number, MeetingSlot[]>()
    for (const m of allMeetings) {
      if (!map.has(m.dayIndex)) map.set(m.dayIndex, [])
      map.get(m.dayIndex)!.push(m)
    }
    return map
  }, [allMeetings])

  const totalGridW = HOURS.length * HOUR_W

  if (isLoading) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
        <div style={{ width: 120, marginBottom: 20 }}>
          <Skeleton height={28} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Skeleton height={140} borderRadius={12} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Skeleton height={100} borderRadius={12} />
          <Skeleton height={100} borderRadius={12} />
        </div>
      </div>
    )
  }

  if (isError || !course) {
    return (
      <Card style={{ padding: 0, maxWidth: 960, margin: '0 auto' }}>
        <ErrorState title="ไม่พบข้อมูลรายวิชา" onRetry={refetch} />
      </Card>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: 'var(--primary)', fontWeight: 600,
          padding: 0, marginBottom: 20,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        กลับ
      </button>

      {/* Course header with Action Button */}
      <Card style={{ marginBottom: 20, padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: 'var(--primary)', background: 'var(--primary-50)',
                padding: '3px 12px', borderRadius: 'var(--radius-pill)',
              }}>
                {course.code}
              </span>
              {group && group.sections.length > 1 ? (
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--ink-500)', background: 'var(--bg)',
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                }}>
                  {group.sections.length} Sec ให้เลือก
                </span>
              ) : course.section ? (
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--ink-500)', background: 'var(--bg)',
                  padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                }}>
                  Sec {course.section}
                </span>
              ) : null}
              <StatusBadge value={course.status} />
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.35, margin: 0 }}>
              {cleanCourseTitle(course.title)}
            </h1>
            {course.english_title && (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-500)', textTransform: 'uppercase', marginTop: 4 }}>
                {course.english_title}
              </div>
            )}
          </div>

          {/* Action button at the top */}
          {group && (course.status === 'open' || course.status === 'closing_soon') && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingTop: 4 }}>
              {appliedSections.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Badge variant="green" wrap>
                    สมัครแล้ว ({appliedSections.map((s) => scheduleDayLabel(s.schedule) || `Sec ${s.section}`).join(', ')})
                  </Badge>
                  <Link to="/student/status" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                    ดูสถานะการสมัคร →
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {group.totalSlots > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                      ว่าง <strong style={{ color: 'var(--primary)' }}>{Math.max(0, group.totalSlots - group.totalAccepted)}</strong> ตำแหน่ง
                    </span>
                  )}
                  {scheduleMissing ? (
                    <Link to="/student/profile" style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      ไปกรอกตารางเรียนก่อน →
                    </Link>
                  ) : allSectionsConflict ? (
                    <span style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600, maxWidth: 250, textAlign: 'right' }}>
                      เวลาเรียนของคุณชนกับเวลาปฏิบัติงาน ไม่สามารถสมัครได้
                    </span>
                  ) : (
                    <Button size="md" onClick={() => openApply(group)}>
                      สมัคร Lab Boy
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Info grid: อาจารย์ผู้สอน & วันปิดรับสมัคร */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>

        {/* Instructor */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            อาจารย์ผู้สอน
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--primary-50)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-800)' }}>
                {course.instructor_name}
              </div>
              {course.credits && (
                <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2 }}>
                  หน่วยกิต {course.credits}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Deadline */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            วันปิดรับสมัคร
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: deadline ? 'var(--amber-50, #FFF7ED)' : 'var(--bg)',
              color: deadline ? 'var(--amber, #D97706)' : 'var(--ink-400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: deadline ? 'var(--ink-800)' : 'var(--ink-400)' }}>
                {deadline ?? 'ไม่ระบุวันปิดรับสมัคร'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2 }}>
                ภาคการศึกษา {course.semester}/{course.academic_year}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Timetable Section (เหมือนหน้า /student/schedule) ── */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        {/* Timetable Header Bar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--primary-50)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
                ตารางบอกเวลาปฏิบัติงาน
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>
                ตารางเวลาเรียนและช่วงปฏิบัติงานของรายวิชา
              </p>
            </div>
          </div>

          {/* Legend Badges for Sections with day colors */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {allMeetings.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: m.color.bg,
                  border: `1px solid ${m.color.border}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: m.color.text,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color.strip }} />
                Sec {m.section} ({m.dayName})
              </div>
            ))}
          </div>
        </div>

        {/* ── Timetable Grid Layout (Fixed Left Day Labels + Scrollable Hours) ── */}
        <div style={{ display: 'flex', overflow: 'hidden' }}>
          {/* Left fixed day column */}
          <div style={{ flexShrink: 0, width: LABEL_W, zIndex: 2 }}>
            {/* Corner header cell */}
            <div style={{
              height: 38,
              borderBottom: '1px solid var(--line)',
              borderRight: '1px solid var(--line)',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--ink-500)',
              letterSpacing: '0.04em',
            }}>
              วัน / เวลา
            </div>

            {/* Day rows */}
            {DAY_ORDER.map((di) => {
              const hasSlots = slotsByDay.has(di)
              const dayColor = DAY_COLORS[di]
              return (
                <div
                  key={di}
                  style={{
                    height: ROW_H,
                    borderBottom: '1px solid var(--line-soft)',
                    borderRight: '1px solid var(--line)',
                    background: hasSlots ? dayColor.rowBg : '#FAFAFA',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px 0 14px',
                    gap: 6,
                  }}
                >
                  {hasSlots && (
                    <div style={{ width: 3, height: 26, borderRadius: 2, background: dayColor.strip, flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: hasSlots ? 700 : 500,
                      color: hasSlots ? dayColor.text : 'var(--ink-400)',
                    }}>
                      {THAI_DAYS_FULL[di]}
                    </div>
                    <div style={{ fontSize: 10, color: hasSlots ? dayColor.strip : 'var(--ink-300)', marginTop: 1, fontWeight: hasSlots ? 600 : 400 }}>
                      {THAI_DAYS_SHORT[di]}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right scrollable timeline grid */}
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
            {/* Hour ruler header */}
            <div style={{
              display: 'flex',
              width: totalGridW,
              height: 38,
              borderBottom: '1px solid var(--line)',
              background: '#F8FAFC',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    width: HOUR_W,
                    flexShrink: 0,
                    borderLeft: h === GRID_START ? 'none' : '1px solid var(--line-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink-500)',
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day rows with event blocks */}
            {DAY_ORDER.map((di, rowIdx) => {
              const slots = slotsByDay.get(di) ?? []
              const hasSlots = slots.length > 0
              const dayColor = DAY_COLORS[di]
              return (
                <div
                  key={di}
                  style={{
                    position: 'relative',
                    width: totalGridW,
                    height: ROW_H,
                    borderBottom: rowIdx < DAY_ORDER.length - 1 ? '1px solid var(--line-soft)' : 'none',
                    background: hasSlots ? dayColor.rowBg : 'transparent',
                  }}
                >
                  {/* Hour vertical grid lines */}
                  {HOURS.map((h, hi) => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        left: hi * HOUR_W,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        background: hi === 0 ? 'transparent' : 'var(--line-soft)',
                      }}
                    />
                  ))}

                  {/* Render meeting blocks on this day */}
                  {slots.map((sl, si) => {
                    const x = timeX(sl.start)
                    const w = timePx(sl.start, sl.end)
                    const cl = sl.color
                    if (w <= 0) return null

                    return (
                      <div
                        key={si}
                        title={`Sec ${sl.section} (${sl.start}–${sl.end}) ${sl.room !== '—' ? 'ห้อง ' + sl.room : ''}`}
                        style={{
                          position: 'absolute',
                          left: Math.max(0, x + 3),
                          width: Math.max(w - 6, 50),
                          top: 6,
                          bottom: 6,
                          borderRadius: 10,
                          background: cl.bg,
                          border: `1.5px solid ${cl.border}`,
                          padding: '5px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          cursor: 'default',
                          boxShadow: `0 1px 4px ${cl.border}33`,
                          transition: 'all .15s ease',
                          zIndex: 2,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = `0 4px 12px ${cl.border}55`
                          e.currentTarget.style.transform = 'translateY(-1px)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = `0 1px 4px ${cl.border}33`
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                      >
                        <div style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: cl.text,
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {sl.section ? `Sec ${sl.section}` : course.code}
                        </div>
                        <div style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: cl.text,
                          opacity: 0.85,
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {sl.start} – {sl.end}
                        </div>
                        {sl.room !== '—' && (
                          <div style={{
                            fontSize: 10,
                            color: cl.text,
                            opacity: 0.75,
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            ห้อง {sl.room}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Schedule List Details (Summary Table) */}
        {allMeetings.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line-soft)', padding: '16px 20px', background: '#FAFAFA' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 10 }}>
              สรุปช่วงเวลาและห้องเรียน
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {allMeetings.map((m, i) => (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    border: '1px solid var(--line-soft)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: m.color.bg,
                      color: m.color.text,
                      border: `1px solid ${m.color.border}`,
                    }}>
                      Sec {m.section}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>
                      {m.dayName}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-600)', textAlign: 'right' }}>
                    <div>{m.start}–{m.end}</div>
                    {m.room !== '—' && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>ห้อง {m.room}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slots & Positions */}
      {group && (
        <Card style={{ padding: '22px 26px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 16px 0' }}>
            จำนวนรับสมัคร
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div style={{ padding: '14px 18px', background: 'var(--bg-subtle, #f9fafb)', borderRadius: 10 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)' }}>{group.totalSlots || '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>ตำแหน่งทั้งหมด</div>
            </div>
            <div style={{ padding: '14px 18px', background: 'var(--bg-subtle, #f9fafb)', borderRadius: 10 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green, #16A34A)' }}>{group.totalAccepted}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>รับแล้ว</div>
            </div>
            <div style={{ padding: '14px 18px', background: 'var(--bg-subtle, #f9fafb)', borderRadius: 10 }}>
              <div style={{
                fontSize: 26, fontWeight: 700,
                color: group.totalSlots > 0 && group.totalAccepted >= group.totalSlots ? 'var(--red, #DC2626)' : 'var(--ink-800)',
              }}>
                {group.totalSlots > 0 ? Math.max(0, group.totalSlots - group.totalAccepted) : '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>เหลือว่าง</div>
            </div>
          </div>
        </Card>
      )}

      {/* Description / Requirements */}
      {(course.description || course.requirements) && (
        <Card style={{ padding: '22px 26px', marginBottom: 20 }}>
          {course.description && (
            <div style={{ marginBottom: course.requirements ? 18 : 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 8px 0' }}>
                รายละเอียด
              </h2>
              <div style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {course.description}
              </div>
            </div>
          )}
          {course.requirements && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 8px 0' }}>
                คุณสมบัติที่ต้องการ
              </h2>
              <div style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {course.requirements}
              </div>
            </div>
          )}
        </Card>
      )}

      {modal}
    </div>
  )
}
