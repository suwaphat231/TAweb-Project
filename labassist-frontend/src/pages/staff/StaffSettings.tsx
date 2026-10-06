import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { useToast } from '../../hooks/useToast'
import type { CalendarDate, CalendarDateType } from '../../types'

const SEMESTER_MONTHS: Record<string, { label: string; months: number[] }> = {
  '1': { label: 'ภาคต้น',      months: [7, 8, 9, 10] },
  '2': { label: 'ภาคปลาย',     months: [12, 1, 2, 3] },
  'S': { label: 'ภาคฤดูร้อน',  months: [6, 7] },
}

const MONTH_TH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const DAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const DATE_TYPE_LABELS: Record<CalendarDateType, string> = {
  public_holiday:     'วันหยุดราชการ',
  university_holiday: 'วันหยุดมหาวิทยาลัย',
  no_class:           'งดการเรียนการสอน',
  case_exception:     'ข้อยกเว้นรายวิชา',
  makeup:             'ชดเชย',
}

const DATE_TYPE_DOT: Record<CalendarDateType, string> = {
  public_holiday:     '#DC2626',
  university_holiday: '#7C3AED',
  no_class:           '#D97706',
  case_exception:     '#2563EB',
  makeup:             '#059669',
}

// CE year for constructing actual calendar dates.
// academicYear is stored as BE (พ.ศ.), so subtract 543 to get CE first.
// Semester 2: December is in CE academicYear, January–March in CE academicYear+1
function monthCEYear(month: number, semester: string, academicYear: number): number {
  const ce = academicYear - 543
  if (semester === '2' && month <= 3) return ce + 1
  return ce
}

function formatDateTH(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  return `${d.getDate()} ${MONTH_TH[d.getMonth() + 1]} ${d.getFullYear() + 543} (${DAY_TH[d.getDay()]})`
}

const SELSTYLE: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 7, border: '1.5px solid var(--line)',
  background: '#fff', fontSize: 13, color: 'var(--ink-800)', cursor: 'pointer', outline: 'none',
}

const INPUTSTYLE: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px', borderRadius: 7,
  border: '1.5px solid var(--line)', fontSize: 13, color: 'var(--ink-800)',
  background: '#fff', boxSizing: 'border-box', outline: 'none',
}

export default function StaffSettings() {
  const qc = useQueryClient()
  const showToast = useToast()
  const thisYear = new Date().getFullYear() + 543  // พ.ศ.
  const [semester, setSemester] = useState('1')
  const [year, setYear]         = useState(thisYear)
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1]

  const { data: calDates = [], isLoading, isError } = useQuery({
    queryKey: ['semester-cal-dates', semester, year],
    queryFn: () => staffApi.listCalendarDatesBySemester(semester, year),
  })

  // per-month add form: null = none open, number = which month is open
  const [openMonth, setOpenMonth] = useState<number | null>(null)
  const [form, setForm] = useState({
    date: '', name: '', date_type: 'public_holiday' as CalendarDateType, affects_work: true,
  })

  const addMut = useMutation({
    mutationFn: () => staffApi.createCalendarDate({
      date: form.date,
      name: form.name,
      date_type: form.date_type,
      scope: 'semester',
      semester,
      academic_year: year,
      affects_work: form.affects_work,
    }),
    onSuccess: (created) => {
      qc.setQueryData<CalendarDate[]>(
        ['semester-cal-dates', semester, year],
        (old = []) => [...old, created].sort((a, b) => a.date.localeCompare(b.date)),
      )
      setOpenMonth(null)
      setForm({ date: '', name: '', date_type: 'public_holiday', affects_work: true })
    },
  })

  const delMut = useMutation({
    mutationFn: (id: number) => staffApi.deleteCalendarDate(id),
    onSuccess: (_, id) => {
      qc.setQueryData<CalendarDate[]>(
        ['semester-cal-dates', semester, year],
        (old = []) => old.filter(d => d.id !== id),
      )
    },
    onError: () => showToast('ลบวันหยุดไม่สำเร็จ กรุณาลองใหม่', 'error'),
  })

  const semInfo = SEMESTER_MONTHS[semester] ?? SEMESTER_MONTHS['1']

  // group calDates by month number (from the date field)
  const byMonth = useMemo(() => {
    const map: Record<number, CalendarDate[]> = {}
    for (const m of semInfo.months) map[m] = []
    for (const d of calDates) {
      const m = new Date(d.date.slice(0, 10) + 'T00:00:00').getMonth() + 1
      if (m in map) map[m].push(d)
    }
    return map
  }, [calDates, semInfo])

  function openAddForm(month: number) {
    const cy = monthCEYear(month, semester, year)
    const mm = String(month).padStart(2, '0')
    setForm({ date: `${cy}-${mm}-01`, name: '', date_type: 'public_holiday', affects_work: true })
    setOpenMonth(openMonth === month ? null : month)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>กำหนดวันหยุดปฏิบัติงาน</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 5 }}>
          กำหนดวันหยุดและวันงดสอนประจำภาคการศึกษา
        </p>
      </div>

      {/* Semester picker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        background: '#fff', border: '1.5px solid var(--line)', borderRadius: 10,
        padding: '14px 20px', marginBottom: 24,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', whiteSpace: 'nowrap' }}>ปีการศึกษา</span>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setOpenMonth(null) }} style={SELSTYLE}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', whiteSpace: 'nowrap' }}>ภาคการศึกษา</span>
          <select value={semester} onChange={e => { setSemester(e.target.value); setOpenMonth(null) }} style={SELSTYLE}>
            <option value="1">ภาคต้น (1)</option>
            <option value="2">ภาคปลาย (2)</option>
            <option value="S">ภาคฤดูร้อน</option>
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 4 }}>
          {isLoading
            ? 'กำลังโหลด...'
            : `${calDates.length} รายการทั้งหมด (${semInfo.months.length} เดือน)`}
        </span>
      </div>

      {/* Load error */}
      {isError && (
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 20,
          background: 'var(--red-bg, #FEF2F2)', border: '1.5px solid var(--red, #DC2626)',
          color: 'var(--red, #DC2626)', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠</span> โหลดข้อมูลวันหยุดไม่สำเร็จ กรุณาลองรีเฟรชหน้าจอใหม่
        </div>
      )}

      {/* Legend */}
      {!isError && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          {(['public_holiday', 'university_holiday', 'no_class'] as CalendarDateType[]).map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-600)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: DATE_TYPE_DOT[t], display: 'inline-block' }} />
              {DATE_TYPE_LABELS[t]}
            </div>
          ))}
        </div>
      )}

      {/* Month grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
        {semInfo.months.map(month => {
          const cy    = monthCEYear(month, semester, year)
          const items = byMonth[month] ?? []
          const isOpen = openMonth === month

          return (
            <div key={month} style={{
              background: '#fff', border: '1.5px solid var(--line)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* Month header */}
              <div style={{
                padding: '11px 16px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--surface-2, #F5F5FB)',
                borderBottom: '1px solid var(--line)',
              }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>
                    {MONTH_TH[month]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 6 }}>
                    {cy + 543}  {/* cy เป็น ค.ศ. แสดงเป็น พ.ศ. */}
                  </span>
                  {items.length > 0 && (
                    <span style={{
                      marginLeft: 8, padding: '1px 7px', borderRadius: 999,
                      background: 'var(--primary-50)', color: 'var(--primary)',
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {items.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openAddForm(month)}
                  style={{
                    height: 28, padding: '0 12px', borderRadius: 7, border: 'none',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: isOpen ? 'var(--ink-100)' : 'var(--primary-50)',
                    color: isOpen ? 'var(--ink-600)' : 'var(--primary)',
                    transition: 'background .15s',
                  }}
                >
                  {isOpen ? 'ยกเลิก' : '+ เพิ่ม'}
                </button>
              </div>

              {/* Add form */}
              {isOpen && (
                <div style={{
                  padding: '14px 16px', borderBottom: '1px solid var(--line)',
                  background: '#FAFAFE', display: 'flex', flexDirection: 'column', gap: 9,
                }}>
                  <input
                    type="date"
                    value={form.date}
                    min={`${cy}-${String(month).padStart(2, '0')}-01`}
                    max={`${cy}-${String(month).padStart(2, '0')}-31`}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    style={INPUTSTYLE}
                  />
                  <input
                    placeholder="ชื่อวันหยุด เช่น วันหยุดชดเชยวันรัฐธรรมนูญ"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={INPUTSTYLE}
                  />
                  <select
                    value={form.date_type}
                    onChange={e => setForm(f => ({ ...f, date_type: e.target.value as CalendarDateType }))}
                    style={INPUTSTYLE}
                  >
                    <option value="public_holiday">วันหยุดราชการ</option>
                    <option value="university_holiday">วันหยุดมหาวิทยาลัย</option>
                    <option value="no_class">งดการเรียนการสอน</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-700)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={form.affects_work}
                      onChange={e => setForm(f => ({ ...f, affects_work: e.target.checked }))}
                      style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    ส่งผลต่อการปฏิบัติงาน (ยกเลิก session อัตโนมัติ)
                  </label>
                  <button
                    onClick={() => addMut.mutate()}
                    disabled={!form.date || !form.name || addMut.isPending}
                    style={{
                      height: 34, borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: !form.date || !form.name || addMut.isPending ? 'var(--ink-200)' : 'var(--primary)',
                      color: !form.date || !form.name || addMut.isPending ? 'var(--ink-500)' : '#fff',
                      fontSize: 13, fontWeight: 600, transition: 'background .15s',
                    }}
                  >
                    {addMut.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  {addMut.isError && (
                    <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>เกิดข้อผิดพลาด กรุณาลองใหม่</p>
                  )}
                </div>
              )}

              {/* Holiday list */}
              <div>
                {items.length === 0 ? (
                  <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--ink-400)', textAlign: 'center' }}>
                    ไม่มีวันหยุด
                  </div>
                ) : (
                  items.map((d, idx) => (
                    <div
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 16px',
                        borderTop: idx > 0 ? '1px solid var(--line-soft)' : undefined,
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                        background: DATE_TYPE_DOT[d.date_type],
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)', lineHeight: 1.35 }}>
                          {d.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2 }}>
                          {formatDateTH(d.date)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{DATE_TYPE_LABELS[d.date_type]}</span>
                          {!d.affects_work && (
                            <span style={{
                              padding: '0 5px', borderRadius: 4,
                              background: 'var(--ink-100)', color: 'var(--ink-500)',
                              fontSize: 10, fontWeight: 600,
                            }}>ไม่กระทบงาน</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => delMut.mutate(d.id)}
                        disabled={delMut.isPending}
                        title="ลบวันหยุดนี้"
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line)',
                          background: 'transparent', cursor: 'pointer', color: 'var(--ink-500)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, flexShrink: 0, transition: 'color .1s, background .1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-bg, #FEE2E2)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-500)'; e.currentTarget.style.background = 'transparent' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
