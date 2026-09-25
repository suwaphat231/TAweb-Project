import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { cleanCourseTitle } from '../../utils/courseTitle'
import type { WorkSession, LabBoyAssignment } from '../../types'

// ── Timetable constants ───────────────────────────────────────────────────────

const HOUR_W   = 96   // px per hour column
const ROW_H    = 72   // px per day row
const LABEL_W  = 88   // px for day-name left column
const GRID_START = 8  // 08:00
const GRID_END   = 19 // 19:00 (exclusive)
const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

const THAI_DAYS_FULL  = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
// Display order: Mon → Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

// English day abbreviations (classlist import format: Mo, Tu, We, Th, Fr, Sa, Su)
const EN_DAY_TO_INDEX: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
}
// Thai day abbreviations (manually-entered instructor format: จ, อ, พ, พฤ, ศ, ส, อา)
const THAI_DAY_ABBR_TO_INDEX: Record<string, number> = {
  'อา': 0, 'จ': 1, 'อ': 2, 'พ': 3, 'พฤ': 4, 'ศ': 5, 'ส': 6,
}

// Try to parse Thai comma-separated day format: "จ,พ,ศ 09:00-12:00" or "อ,พฤ 13:00-16:00"
// Returns null when the string doesn't match this format.
function tryParseThaiDayFormat(schedule: string): {dayIndex: number; timeStart: string; timeEnd: string}[] | null {
  const trimmed = schedule.trim()
  // Match: <Thai-chars and commas> <SPACE> <HH:MM>-<HH:MM>  (whole string — no room info)
  const m = trimmed.match(/^([฀-๿,]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/)
  if (!m) return null
  const timeStart = m[2], timeEnd = m[3]
  const parts: {dayIndex: number; timeStart: string; timeEnd: string}[] = []
  for (const abbr of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
    const idx = THAI_DAY_ABBR_TO_INDEX[abbr]
    if (idx === undefined) return null
    parts.push({ dayIndex: idx, timeStart, timeEnd })
  }
  return parts.length > 0 ? parts : null
}

// Parse a schedule string that may be:
//   • Thai comma-day format (single line): "จ,พ,ศ 09:00-12:00"
//   • English multi-line classlist format: "Mo 10:20 - 12:05 1239 ว.1\nTu 13:00 - 16:35 ..."
// Returns one TimetableSlot per day/time combination found; [] if nothing parseable.
function parseScheduleLines(
  schedule: string,
  courseCode: string,
  courseTitle: string,
  courseSection: number,
): TimetableSlot[] {
  if (!schedule?.trim()) return []
  const out: TimetableSlot[] = []

  // Try Thai format first (applies to single-line manually-entered schedules)
  const thaiParsed = tryParseThaiDayFormat(schedule.trim())
  if (thaiParsed) {
    for (const { dayIndex, timeStart, timeEnd } of thaiParsed) {
      out.push({ dayIndex, timeStart, timeEnd, courseCode, courseTitle, courseSection })
    }
    return out
  }

  // Fall back to English multi-line classlist format
  for (const raw of schedule.split('\n')) {
    const m = raw.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m) continue
    out.push({
      dayIndex: EN_DAY_TO_INDEX[m[1]],
      timeStart: m[2],
      timeEnd: m[3],
      courseCode,
      courseTitle,
      courseSection,
    })
  }
  return out
}

// Summarise schedule string to human-readable Thai day+time for AssignmentCard.
function formatScheduleDisplay(schedule: string): string {
  if (!schedule?.trim()) return 'ไม่ระบุเวลา'
  const slots = parseScheduleLines(schedule, '', '', 0)
  if (slots.length > 0) {
    return slots.map(s => `${THAI_DAYS_SHORT[s.dayIndex]} ${s.timeStart}–${s.timeEnd}`).join('  /  ')
  }
  return schedule.split('\n')[0]
}

const SESSION_PALETTE = [
  { bg: '#FFF9E6', border: '#F59E0B', text: '#92400E' },
  { bg: '#F0FDF4', border: '#22C55E', text: '#14532D' },
  { bg: '#EFF6FF', border: '#3B82F6', text: '#1E3A8A' },
  { bg: '#FFF1F2', border: '#F43F5E', text: '#881337' },
  { bg: '#F5F3FF', border: '#8B5CF6', text: '#4C1D95' },
  { bg: '#ECFEFF', border: '#06B6D4', text: '#164E63' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseISO(iso: string): [number, number, number] {
  return iso.split('-').map(Number) as [number, number, number]
}

function parseMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function timeX(t: string): number {
  return ((parseMinutes(t) - GRID_START * 60) / 60) * HOUR_W
}

function timePx(start: string, end: string): number {
  return ((parseMinutes(end) - parseMinutes(start)) / 60) * HOUR_W
}

function fmtFull(iso: string) {
  const [y, m, d] = parseISO(iso)
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function colorFor(code: string) {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return SESSION_PALETTE[h % SESSION_PALETTE.length]
}

interface TimetableSlot {
  dayIndex: number
  timeStart: string
  timeEnd: string
  courseCode: string
  courseTitle: string
  courseSection: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentSchedule() {
  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['work-schedule'],
    queryFn: studentApi.workSchedule,
  })
  const { data: assignments = [], isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['labboy-assignments'],
    queryFn: studentApi.laboyAssignments,
  })

  const anyLoading = isLoading || isLoadingAssignments

  const today = todayISO()
  const upcoming = sessions.filter(s => s.session_date >= today)
  const past     = sessions.filter(s => s.session_date < today)
  const totalHours = sessions.reduce((n, s) => n + (s.hours_per_session || 0), 0)
  const nextSession = upcoming[0] ?? null

  // Build weekly timetable from confirmed Lab Boy assignments' course schedules.
  // This does NOT depend on StaffDocuments — the course's own timetable data
  // is always available once the instructor confirms the schedule.
  const timetableSlots = useMemo<TimetableSlot[]>(() => {
    const out: TimetableSlot[] = []
    for (const a of assignments) {
      out.push(...parseScheduleLines(a.course_schedule, a.course_code, a.course_title, a.course_section))
    }
    return out
  }, [assignments])

  // Track assignments whose schedule field couldn't yield any parseable slots.
  const unscheduledAssignments = useMemo(
    () => assignments.filter(a => parseScheduleLines(a.course_schedule, a.course_code, a.course_title, a.course_section).length === 0),
    [assignments],
  )

  const slotsByDay = useMemo(() => {
    const map = new Map<number, TimetableSlot[]>()
    for (const sl of timetableSlots) {
      if (!map.has(sl.dayIndex)) map.set(sl.dayIndex, [])
      map.get(sl.dayIndex)!.push(sl)
    }
    return map
  }, [timetableSlots])

  // Group upcoming sessions by date for the list below
  const upcomingByDate = useMemo(() => {
    const map = new Map<string, WorkSession[]>()
    for (const s of upcoming.slice(0, 20)) {
      if (!map.has(s.session_date)) map.set(s.session_date, [])
      map.get(s.session_date)!.push(s)
    }
    return Array.from(map.entries())
  }, [upcoming])

  const isEmpty = !anyLoading && sessions.length === 0 && assignments.length === 0
  const totalW  = HOURS.length * HOUR_W

  return (
    <div>
      {/* ── Banner ── */}
      <div style={{
        background: 'var(--brand-gradient)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20, color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lab Boy</p>
            <h1 style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>ตารางปฏิบัติงาน</h1>
          </div>
          {!anyLoading && !isError && !isEmpty && (
            <div style={{ display: 'flex', gap: 8 }}>
              {assignments.length > 0 && <Chip val={assignments.length} label="วิชาที่ได้รับ" />}
              {sessions.length > 0 && <>
                <Chip val={upcoming.length} label="กำลังจะมา" />
                <Chip val={past.length} label="ผ่านแล้ว" dim />
                {totalHours > 0 && <Chip val={totalHours} label="ชม. รวม" />}
              </>}
            </div>
          )}
        </div>
      </div>

      {/* ── Lab Boy Assignments ── */}
      {assignments.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Label text="วิชาที่ได้รับเลือกเป็น Lab Boy" color="#7C3AED" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assignments.map(a => <AssignmentCard key={a.course_id} a={a} />)}
          </div>
        </div>
      )}

      {/* ── Loading / Error / Empty ── */}
      {anyLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={ROW_H + 2} borderRadius={12} />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : isEmpty ? (
        <EmptyState title="ยังไม่มีตารางปฏิบัติงาน" description="ตารางจะแสดงเมื่อคุณได้รับการคัดเลือกและอาจารย์ยืนยันตารางแล้ว" icon="📅" />
      ) : (
        <>
          {/* ── Timetable grid (built from confirmed assignments' course schedules) ── */}
          {assignments.length > 0 && <div style={{ marginBottom: 28 }}>
            <Label text="ตารางปฏิบัติงานประจำสัปดาห์" />
            {/* Warn about assignments that have no parseable schedule */}
            {unscheduledAssignments.length > 0 && (
              <div style={{
                marginBottom: 10, padding: '9px 14px', borderRadius: 10,
                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
                fontSize: 12, color: '#92400E',
              }}>
                <strong>ไม่พบข้อมูลเวลาเรียน</strong> สำหรับ:{' '}
                {unscheduledAssignments.map(a => `${a.course_code}${a.course_section > 0 ? ` กลุ่ม ${a.course_section}` : ''}`).join(', ')}
                {' '}— กรุณาติดต่ออาจารย์ผู้สอน
              </div>
            )}
            <div style={{
              background: '#fff', borderRadius: 16,
              border: '1px solid var(--line)',
              boxShadow: '0 2px 12px rgba(15,23,42,.07)',
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex' }}>
                {/* ── Fixed left column ── */}
                <div style={{ flexShrink: 0, width: LABEL_W, zIndex: 2 }}>
                  {/* Corner cell */}
                  <div style={{
                    height: 36, borderBottom: '1px solid var(--line)',
                    borderRight: '1px solid var(--line)',
                    background: '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: '0.05em',
                  }}>
                    วัน / เวลา
                  </div>
                  {/* Day labels */}
                  {DAY_ORDER.map((di) => {
                    const hasSlots = slotsByDay.has(di)
                    const isToday = new Date().getDay() === di
                    return (
                      <div
                        key={di}
                        style={{
                          height: ROW_H,
                          borderBottom: '1px solid var(--line-soft)',
                          borderRight: '1px solid var(--line)',
                          background: isToday ? 'rgba(22,163,74,0.04)' : hasSlots ? 'rgba(56,65,157,0.03)' : '#FAFAFA',
                          display: 'flex', alignItems: 'center',
                          padding: '0 10px 0 14px', gap: 6,
                        }}
                      >
                        {isToday && <div style={{ width: 3, height: 24, borderRadius: 2, background: 'var(--green)', flexShrink: 0 }} />}
                        <div>
                          <div style={{
                            fontSize: 12, fontWeight: isToday ? 800 : hasSlots ? 700 : 500,
                            color: isToday ? 'var(--green)' : hasSlots ? 'var(--ink-800)' : 'var(--ink-400)',
                          }}>
                            {THAI_DAYS_FULL[di]}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 1 }}>
                            {THAI_DAYS_SHORT[di]}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Scrollable grid ── */}
                <div style={{ flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
                  {/* Time header */}
                  <div style={{
                    display: 'flex', width: totalW,
                    height: 36, borderBottom: '1px solid var(--line)',
                    background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1,
                  }}>
                    {HOURS.map(h => (
                      <div
                        key={h}
                        style={{
                          width: HOUR_W, flexShrink: 0,
                          borderLeft: h === GRID_START ? 'none' : '1px solid var(--line-soft)',
                          display: 'flex', alignItems: 'center',
                          paddingLeft: 8,
                          fontSize: 11, fontWeight: 600,
                          color: h === new Date().getHours() ? 'var(--primary)' : 'var(--ink-400)',
                        }}
                      >
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Day rows */}
                  {DAY_ORDER.map((di, rowIdx) => {
                    const slots   = slotsByDay.get(di) ?? []
                    const isToday = new Date().getDay() === di
                    return (
                      <div
                        key={di}
                        style={{
                          position: 'relative',
                          width: totalW, height: ROW_H,
                          borderBottom: rowIdx < DAY_ORDER.length - 1 ? '1px solid var(--line-soft)' : 'none',
                          background: isToday ? 'rgba(22,163,74,0.03)' : 'transparent',
                        }}
                      >
                        {/* Hour grid lines */}
                        {HOURS.map((h, hi) => (
                          <div key={h} style={{
                            position: 'absolute',
                            left: hi * HOUR_W, top: 0, bottom: 0,
                            width: 1,
                            background: hi === 0 ? 'transparent' : 'var(--line-soft)',
                          }} />
                        ))}

                        {/* Current-time vertical line */}
                        {isToday && (() => {
                          const now = new Date()
                          const nowMins = now.getHours() * 60 + now.getMinutes()
                          const x = ((nowMins - GRID_START * 60) / 60) * HOUR_W
                          return x >= 0 && x <= totalW ? (
                            <div style={{
                              position: 'absolute', left: x, top: 0, bottom: 0, width: 2,
                              background: 'var(--green)', opacity: 0.6, zIndex: 3,
                            }} />
                          ) : null
                        })()}

                        {/* Session blocks */}
                        {slots.map((sl, si) => {
                          const x  = timeX(sl.timeStart)
                          const w  = timePx(sl.timeStart, sl.timeEnd)
                          const cl = colorFor(sl.courseCode)
                          if (w <= 0) return null
                          return (
                            <div
                              key={si}
                              title={`${sl.courseCode} — ${sl.timeStart}–${sl.timeEnd}`}
                              style={{
                                position: 'absolute',
                                left: x + 3,
                                width: Math.max(w - 6, 40),
                                top: 8, bottom: 8,
                                borderRadius: 10,
                                background: cl.bg,
                                border: `1.5px solid ${cl.border}`,
                                padding: '5px 10px',
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                overflow: 'hidden',
                                cursor: 'default',
                                boxShadow: `0 1px 4px ${cl.border}33`,
                                transition: 'box-shadow .15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 3px 10px ${cl.border}55`)}
                              onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 1px 4px ${cl.border}33`)}
                            >
                              <div style={{ fontSize: 12, fontWeight: 800, color: cl.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sl.courseCode}{sl.courseSection > 0 ? ` กลุ่ม ${sl.courseSection}` : ''}
                              </div>
                              <div style={{ fontSize: 10, color: cl.text, opacity: 0.75, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sl.timeStart} – {sl.timeEnd}
                              </div>
                              {w > 120 && (
                                <div style={{ fontSize: 10, color: cl.text, opacity: 0.6, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {cleanCourseTitle(sl.courseTitle)}
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
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {timetableSlots.map((sl, i) => {
                const cl = colorFor(sl.courseCode)
                const key = `${sl.courseCode}-${sl.courseSection}`
                if (i > 0 && timetableSlots.slice(0, i).some(s => s.courseCode === sl.courseCode)) return null
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: cl.bg, border: `1.5px solid ${cl.border}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>
                      {sl.courseCode} · {cleanCourseTitle(sl.courseTitle)}
                    </span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 2, height: 12, background: 'var(--green)', opacity: 0.6, borderRadius: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>เวลาปัจจุบัน</span>
              </div>
            </div>
          </div>}

          {/* ── Upcoming sessions list (from StaffDocuments — real scheduled dates) ── */}
          {upcomingByDate.length > 0 && (
            <div>
              <Label text={nextSession?.session_date === today ? '🔔 รายการปฏิบัติงานที่กำลังจะถึง' : 'รายการปฏิบัติงานที่กำลังจะถึง'} />
              <div style={{
                background: '#fff', borderRadius: 14, overflow: 'hidden',
                border: '1px solid var(--line)',
                boxShadow: '0 1px 6px rgba(15,23,42,.06)',
              }}>
                {upcomingByDate.map(([date, items], idx) => {
                  const isToday = date === today
                  return (
                    <div key={date} style={{ borderBottom: idx < upcomingByDate.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                      {/* Date header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 18px 6px',
                        background: isToday ? 'rgba(22,163,74,0.04)' : 'transparent',
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                          background: isToday ? 'var(--green)' : 'var(--primary)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          color: '#fff',
                        }}>
                          <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}>
                            {date.split('-')[2].replace(/^0/, '')}
                          </span>
                          <span style={{ fontSize: 8, opacity: 0.85, marginTop: 1 }}>
                            {new Date(...parseISO(date).map((v,i) => i===1?v-1:v) as [number,number,number]).toLocaleDateString('th-TH', { month: 'short' })}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? 'var(--green)' : 'var(--ink-800)' }}>
                            {fmtFull(date)}{isToday ? ' — วันนี้' : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>{items.length} รายการ</div>
                        </div>
                      </div>
                      {/* Session rows for this date */}
                      {items.map((s, si) => {
                        const cl = colorFor(s.course_code)
                        return (
                          <div
                            key={si}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '8px 18px 8px 72px',
                            }}
                          >
                            <div style={{
                              flexShrink: 0, height: 36, minWidth: 96,
                              borderRadius: 8, background: cl.bg, border: `1.5px solid ${cl.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: cl.text, padding: '0 10px',
                            }}>
                              {s.work_time_start && s.work_time_end
                                ? `${s.work_time_start} – ${s.work_time_end}`
                                : s.work_time_start || '—'
                              }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cleanCourseTitle(s.course_title)}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
                                {s.course_code}{s.course_section > 0 ? ` · กลุ่ม ${s.course_section}` : ''}
                                {s.hours_per_session > 0 ? ` · ${s.hours_per_session} ชม.` : ''}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Past sessions count note */}
          {past.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--ink-400)' }}>
              ผ่านมาแล้ว {past.length} ครั้ง · รวม {Math.round(past.reduce((n,s) => n + (s.hours_per_session||0), 0) * 10) / 10} ชม.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Chip({ val, label, dim }: { val: number; label: string; dim?: boolean }) {
  return (
    <div style={{
      background: dim ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)',
      borderRadius: 9, padding: '6px 14px', textAlign: 'center', minWidth: 58,
    }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: dim ? 'rgba(255,255,255,0.65)' : '#fff', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

function Label({ text, color = 'var(--ink-500)' }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color,
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
    }}>
      {text}
    </div>
  )
}

function AssignmentCard({ a }: { a: LabBoyAssignment }) {
  const cl = colorFor(a.course_code)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(91,33,182,0.02))',
      border: '1.5px solid rgba(124,58,237,0.18)',
    }}>
      <div style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 9,
        background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
      }}>🎓</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#7C3AED' }}>{a.course_code}</span>
          {a.course_section > 0 && <span style={{ fontSize: 10, color: '#7C3AED', opacity: 0.65, background: 'rgba(124,58,237,0.1)', borderRadius: 4, padding: '1px 5px' }}>กลุ่ม {a.course_section}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,0.1)', borderRadius: 4, padding: '1px 6px' }}>✓ ยืนยันแล้ว</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cleanCourseTitle(a.course_title)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
          ภาค {a.semester}/{a.academic_year} · {formatScheduleDisplay(a.course_schedule)}
        </div>
      </div>
      <div style={{
        flexShrink: 0, width: 10, height: 10, borderRadius: 3,
        background: cl.bg, border: `1.5px solid ${cl.border}`,
      }} />
    </div>
  )
}
