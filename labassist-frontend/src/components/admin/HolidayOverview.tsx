import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../services/api'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { eventDays, academicYearOfMonth } from '../../utils/academicCalendar'
import type { AcademicEvent, AcademicTerm, CalendarDate, HolidaySyncRun, HolidaySyncRunStatus } from '../../types'

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

type Tone = 'public' | 'uni' | 'noclass' | 'sub'
const TONES: Tone[] = ['public', 'uni', 'noclass', 'sub']
const TONE_LABEL: Record<Tone, string> = {
  public: 'วันหยุดราชการ', uni: 'วันหยุดมหาวิทยาลัย', noclass: 'งดการเรียนการสอน', sub: 'วันหยุดชดเชย',
}

const SEM_LABEL: Record<string, string> = { '1': 'ภาคต้น', '2': 'ภาคปลาย', S: 'ภาคฤดูร้อน' }

/** An open or close day of a semester, shown beside the holidays. */
interface TermDay { semester: string; kind: 'open' | 'close' }
const EVENT_TAG: Record<AcademicEvent['category'], string> = {
  registration: 'ลงทะเบียน / ถอน', exam: 'สอบ', deadline: 'กำหนดส่ง', other: 'กิจกรรมวิชาการ',
}

const termDayLabel = (t: TermDay) => `${t.kind === 'open' ? 'เปิด' : 'ปิด'}ภาคเรียน · ${SEM_LABEL[t.semester] ?? t.semester}`

const RUN_LABEL: Record<HolidaySyncRunStatus, string> = {
  success: 'สำเร็จ', no_data: 'ยังไม่มีข้อมูลปีนี้', failed: 'ไม่สำเร็จ',
}

// Keys whose cached data a holiday change affects (same set the PDF import refreshes).
const AFFECTED_QUERIES = ['academic-terms', 'academic-events', 'admin-year-holidays', 'holiday-sync-status', 'semester-cal-dates',
  'staff-calendar-dates', 'calendar-dates', 'monthly-plan']

const dayKey = (iso: string) => iso.slice(0, 10)
const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function toneOf(h: CalendarDate): Tone {
  if (h.external_type === 'substitution_holiday') return 'sub'
  if (h.date_type === 'university_holiday') return 'uni'
  if (h.date_type === 'no_class') return 'noclass'
  return 'public'
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function runLine(r: HolidaySyncRun): string {
  if (r.status !== 'success') return r.message || RUN_LABEL[r.status]
  return `${RUN_LABEL.success} · ทั้งหมด ${r.total} วัน · เพิ่มใหม่ ${r.created} · อัปเดต ${r.updated}`
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  )
}

/** Dark calendar view of every holiday in the system, plus the Thai public holiday sync. */
export function HolidayOverview() {
  const qc = useQueryClient()
  const showToast = useToast()
  const now = new Date()
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate())
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() }) // y = ค.ศ.
  const [view, setView] = useState<'month' | 'list'>('month')
  const [selected, setSelected] = useState<string | null>(null)

  const year = cursor.y
  const { data: holidays = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-year-holidays', year],
    queryFn: () => adminApi.listYearHolidays(year),
  })
  // The academic year starts in June, so a month can belong to either of two years.
  const { data: terms = [] } = useQuery({
    queryKey: ['academic-terms', cursor.y],
    queryFn: () => adminApi.listAcademicTerms([cursor.y + 542, cursor.y + 543, cursor.y + 544]),
  })
  const { data: events = [] } = useQuery({
    queryKey: ['academic-events', cursor.y],
    queryFn: () => adminApi.listAcademicEvents([cursor.y + 542, cursor.y + 543, cursor.y + 544]),
  })
  const { data: sync } = useQuery({
    queryKey: ['holiday-sync-status'],
    queryFn: adminApi.getHolidaySyncStatus,
    refetchInterval: 60_000,
  })

  const syncMut = useMutation({
    mutationFn: adminApi.runHolidaySync,
    onSuccess: ({ runs }) => {
      const failed = runs.filter((r) => r.status === 'failed').length
      const created = runs.reduce((n, r) => n + r.created, 0)
      if (failed > 0) showToast(`ซิงก์ไม่สำเร็จ ${failed} ปี (ข้อมูลเดิมไม่เปลี่ยนแปลง)`, 'warning')
      else showToast(created > 0 ? `ซิงก์สำเร็จ เพิ่มวันหยุดใหม่ ${created} วัน` : 'ซิงก์สำเร็จ ข้อมูลเป็นปัจจุบันแล้ว', 'success')
      for (const key of AFFECTED_QUERIES) qc.invalidateQueries({ queryKey: [key] })
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      showToast(status === 409 ? 'กำลังซิงก์อยู่ กรุณารอสักครู่แล้วลองใหม่' : 'สั่งซิงก์ไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarDate[]>()
    for (const h of holidays) m.set(dayKey(h.date), [...(m.get(dayKey(h.date)) ?? []), h])
    return m
  }, [holidays])

  const termByDay = useMemo(() => {
    const m = new Map<string, TermDay[]>()
    const add = (iso: string | null, td: TermDay) => {
      if (!iso) return
      const k = dayKey(iso)
      m.set(k, [...(m.get(k) ?? []), td])
    }
    for (const t of terms) {
      add(t.open_date, { semester: t.semester, kind: 'open' })
      add(t.close_date, { semester: t.semester, kind: 'close' })
    }
    return m
  }, [terms])

  const eventByDay = useMemo(() => {
    const m = new Map<string, AcademicEvent[]>()
    for (const e of events) {
      for (const k of eventDays(e.start_date, e.end_date)) m.set(k, [...(m.get(k) ?? []), e])
    }
    return m
  }, [events])

  const currentYearBE = academicYearOfMonth(cursor.y, cursor.m)
  const shownTerms = terms.filter((t) => t.academic_year === currentYearBE)

  const counts = useMemo(() => {
    const c: Record<Tone, number> = { public: 0, uni: 0, noclass: 0, sub: 0 }
    for (const h of holidays) c[toneOf(h)]++
    return c
  }, [holidays])

  const upcoming = useMemo(() => holidays.filter((h) => dayKey(h.date) >= todayKey).slice(0, 4), [holidays, todayKey])

  const go = (delta: number) => {
    setSelected(null)
    setCursor(({ y, m }) => {
      const t = m + delta
      return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
    })
  }
  const pick = (key: string) => {
    setCursor({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 })
    setSelected(key)
    setView('month')
  }

  const maxCount = Math.max(1, ...Object.values(counts))
  const detail = selected ? byDay.get(selected) : undefined
  const detailTerms = selected ? termByDay.get(selected) : undefined
  const detailEvents = selected ? eventByDay.get(selected) : undefined

  return (
    <div className="cmd">
      <aside className="cmd-side">
        <section className="cmd-card" aria-label="ปฏิทินย่อ">
          <header className="cmd-card-head">
            <h2>{MONTHS[cursor.m]} {year + 543}</h2>
            <div className="cmd-nav">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => go(-1)}><Chevron dir="left" /></button>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => go(1)}><Chevron dir="right" /></button>
            </div>
          </header>
          <MiniMonth year={year} month={cursor.m} byDay={byDay} eventByDay={eventByDay} todayKey={todayKey} selected={selected} onPick={pick} />
        </section>

        <section className="cmd-card" aria-label="ภาคการศึกษา">
          <header className="cmd-card-head"><h2>ภาคการศึกษา {currentYearBE}</h2></header>
          <TermList terms={shownTerms} onPick={pick} />
        </section>

        <section className="cmd-card" aria-label="วันหยุดที่กำลังจะมาถึง">
          <header className="cmd-card-head"><h2>วันหยุดที่กำลังจะมาถึง</h2></header>
          {upcoming.length === 0 ? (
            <p className="cmd-muted">ไม่มีวันหยุดที่กำลังจะมาถึงในปี {year + 543}</p>
          ) : (
            <ul className="cmd-upcoming">
              {upcoming.map((h) => {
                const d = new Date(`${dayKey(h.date)}T00:00:00`)
                return (
                  <li key={h.id}>
                    <button type="button" onClick={() => pick(dayKey(h.date))}>
                      <i className={`cmd-dot ${toneOf(h)}`} aria-hidden="true" />
                      <span className="cmd-up-name">{h.name}</span>
                      <span className="cmd-up-date">{d.getDate()} {MONTHS_SHORT[d.getMonth()]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="cmd-card" aria-label="สัดส่วนวันหยุด">
          <header className="cmd-card-head"><h2>สัดส่วนวันหยุดปี {year + 543}</h2></header>
          <ul className="cmd-bars">
            {TONES.map((t) => (
              <li key={t}>
                <span className="cmd-bar-label">{TONE_LABEL[t]}</span>
                <span className="cmd-bar-track" aria-hidden="true"><span className={`cmd-bar-fill ${t}`} style={{ width: `${(counts[t] / maxCount) * 100}%` }} /></span>
                <span className="cmd-bar-count">{counts[t]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cmd-card" aria-label="การซิงก์วันหยุดราชการ">
          <header className="cmd-card-head"><h2>ซิงก์วันหยุดราชการ</h2></header>
          <p className="cmd-sync-line">
            <i className={sync?.enabled === false ? 'cmd-dot off' : 'cmd-dot on'} aria-hidden="true" />
            {sync?.enabled === false ? 'ปิดอยู่' : `อัตโนมัติทุก ${sync?.interval_hours ?? 24} ชั่วโมง`}
          </p>
          <p className="cmd-muted" style={{ marginTop: 2 }}>
            ล่าสุด {sync?.last_success_at ? fmtDateTime(sync.last_success_at) : 'ยังไม่เคยซิงก์สำเร็จ'}
          </p>
          <Button type="button" size="sm" variant="outline" loading={syncMut.isPending} onClick={() => syncMut.mutate()}
            style={{ marginTop: 12, width: '100%' }}>
            {syncMut.isPending ? 'กำลังซิงก์...' : 'ซิงก์ตอนนี้'}
          </Button>
          {sync && sync.runs.length > 0 && (
            <details className="cmd-runs">
              <summary>ประวัติการซิงก์</summary>
              <ul>
                {sync.runs.map((r) => (
                  <li key={r.year}><strong>ปี {r.year + 543}</strong> · {runLine(r)}<br />{fmtDateTime(r.finished_at)}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </aside>

      <main className="cmd-main">
        <header className="cmd-main-head">
          <h2>{MONTHS[cursor.m]} {year + 543}</h2>
          <div className="cmd-main-tools">
            <div className="cmd-nav">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => go(-1)}><Chevron dir="left" /></button>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => go(1)}><Chevron dir="right" /></button>
            </div>
            <div className="cmd-pills" role="group" aria-label="มุมมอง">
              <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>เดือน</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>รายการทั้งปี</button>
            </div>
          </div>
        </header>

        {isError ? (
          <EmptyState title="โหลดวันหยุดไม่สำเร็จ" description="ตรวจสอบว่า backend ทำงานอยู่ แล้วลองใหม่"
            action={{ label: 'ลองใหม่', onClick: () => { void refetch() } }} />
        ) : isLoading ? (
          <p className="cmd-muted" style={{ padding: 24 }}>กำลังโหลด...</p>
        ) : view === 'month' ? (
          <>
            <MonthBoard year={year} month={cursor.m} byDay={byDay} termByDay={termByDay} eventByDay={eventByDay} todayKey={todayKey} selected={selected} onSelect={setSelected} />
            {(detail || detailTerms || detailEvents) && <DetailCard date={selected!} rows={detail ?? []} termDays={detailTerms ?? []} events={detailEvents ?? []} onClose={() => setSelected(null)} />}
            <ul className="cmd-legend">
              {TONES.map((t) => <li key={t}><i className={`cmd-dot ${t}`} aria-hidden="true" />{TONE_LABEL[t]}</li>)}
              <li><i className="cmd-dot term" aria-hidden="true" />เปิด/ปิดภาคเรียน</li>
            </ul>
          </>
        ) : holidays.length === 0 ? (
          <EmptyState title={`ยังไม่มีวันหยุดของปี ${year + 543}`}
            description="กด “ซิงก์ตอนนี้” หรือนำเข้าจากไฟล์ปฏิทินการศึกษาในแท็บ “นำเข้าจากไฟล์ PDF”" />
        ) : (
          <div className="cmd-table-wrap">
            <table className="cmd-table">
              <thead>
                <tr><th scope="col">วันที่</th><th scope="col">วัน</th><th scope="col">ชื่อวันหยุด</th><th scope="col">ประเภท</th></tr>
              </thead>
              <tbody>
                {holidays.map((h) => {
                  const d = new Date(`${dayKey(h.date)}T00:00:00`)
                  const t = toneOf(h)
                  return (
                    <tr key={h.id} onClick={() => pick(dayKey(h.date))} className="is-clickable">
                      <td className="nowrap"><b>{d.getDate()}</b> {MONTHS_SHORT[d.getMonth()]}</td>
                      <td>{DOW[d.getDay()]}.</td>
                      <td>{h.name}</td>
                      <td><span className={`cmd-chip ${t}`}>{TONE_LABEL[t]}</span></td>                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function MiniMonth({ year, month, byDay, eventByDay, todayKey, selected, onPick }: {
  year: number; month: number; byDay: Map<string, CalendarDate[]>; eventByDay: Map<string, AcademicEvent[]>; todayKey: string; selected: string | null; onPick: (key: string) => void
}) {
  const lead = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="cmd-mini" role="grid" aria-label={`${MONTHS[month]} ${year + 543}`}>
      {DOW.map((d) => <div key={d} className="cmd-mini-dow" role="columnheader">{d}</div>)}
      {cells.map((d, i) => {
        if (d === null) return <div key={`b${i}`} />
        const key = keyOf(year, month, d)
        const hs = byDay.get(key)
        const evs = eventByDay.get(key)
        const cls = ['cmd-mini-day', (hs || evs) && 'has', key === selected && 'sel', key === todayKey && 'today'].filter(Boolean).join(' ')
        return (
          <button key={key} type="button" role="gridcell" className={cls} onClick={() => onPick(key)}
            aria-label={hs || evs ? `${d} ${MONTHS[month]}: ${[...(hs ?? []), ...(evs ?? [])].map((h) => h.name).join(', ')}` : `${d} ${MONTHS[month]}`}>
            {d}
            {(hs || evs) && <i className={`cmd-dot ${hs ? toneOf(hs[0]) : 'ev'}`} aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

function MonthBoard({ year, month, byDay, termByDay, eventByDay, todayKey, selected, onSelect }: {
  year: number; month: number; byDay: Map<string, CalendarDate[]>; termByDay: Map<string, TermDay[]>; eventByDay: Map<string, AcademicEvent[]>; todayKey: string; selected: string | null
  onSelect: (key: string | null) => void
}) {
  const lead = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const todayCol = todayKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
    ? new Date(`${todayKey}T00:00:00`).getDay() : -1
  return (
    <div className="cmd-board" role="grid" aria-label={`${MONTHS[month]} ${year + 543}`}>
      {DOW_FULL.map((d, i) => (
        <div key={d} className={i === todayCol ? 'cmd-board-dow today' : 'cmd-board-dow'} role="columnheader">{d}</div>
      ))}
      {cells.map((d, i) => {
        if (d === null) return <div key={`b${i}`} className="cmd-cell blank" />
        const key = keyOf(year, month, d)
        const hs = byDay.get(key) ?? []
        const col = (lead + d - 1) % 7
        const cls = ['cmd-cell', (col === 0 || col === 6) && 'weekend', key === todayKey && 'today', key === selected && 'sel'].filter(Boolean).join(' ')
        return (
          <div key={key} className={cls} role="gridcell">
            <span className="cmd-cell-num">{d}</span>
            {(termByDay.get(key) ?? []).map((t) => (
              <button key={`${t.semester}${t.kind}`} type="button" className="cmd-ev term" aria-label={`${termDayLabel(t)} ${d} ${MONTHS[month]}`}
                onClick={() => onSelect(key === selected ? null : key)}>
                <span>{termDayLabel(t)}</span>
              </button>
            ))}
            {(eventByDay.get(key) ?? []).map((e) => (
              <button key={`e${e.id}`} type="button" className={`cmd-ev event ${e.category}`} aria-label={`${e.name} ${d} ${MONTHS[month]}`}
                onClick={() => onSelect(key === selected ? null : key)}>
                <span>{e.name}</span>
              </button>
            ))}
            {hs.map((h) => (
              <button key={h.id} type="button" className={`cmd-ev ${toneOf(h)}`} aria-label={`${h.name} ${d} ${MONTHS[month]}`}
                onClick={() => onSelect(key === selected ? null : key)}>
                <span>{h.name}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function DetailCard({ date, rows, termDays, events, onClose }: { date: string; rows: CalendarDate[]; termDays: TermDay[]; events: AcademicEvent[]; onClose: () => void }) {
  const d = new Date(`${date}T00:00:00`)
  return (
    <section className="cmd-detail" aria-label="รายละเอียดวันหยุด">
      <header>
        <h3>วัน{DOW_FULL[d.getDay()]}ที่ {d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear() + 543}</h3>
        <button type="button" onClick={onClose} aria-label="ปิดรายละเอียด">ปิด</button>
      </header>
      {termDays.map((t) => (
        <div key={`${t.semester}${t.kind}`} className="cmd-detail-item">
          <div className="cmd-detail-name">{termDayLabel(t)}</div>
          <div className="cmd-detail-tags"><span className="cmd-chip term">กำหนดจากปฏิทินการศึกษา</span></div>
        </div>
      ))}
      {events.map((e) => (
        <div key={`e${e.id}`} className="cmd-detail-item">
          <div className="cmd-detail-name">{e.name}</div>
          <div className="cmd-detail-tags">
            <span className="cmd-chip term">{EVENT_TAG[e.category]}</span>
            <span className="cmd-chip plain">{SEM_LABEL[e.semester] ?? e.semester}</span>
            {e.start_date.slice(0, 10) !== e.end_date.slice(0, 10) && (
              <span className="cmd-chip plain">{e.start_date.slice(8, 10)}/{e.start_date.slice(5, 7)} – {e.end_date.slice(8, 10)}/{e.end_date.slice(5, 7)}</span>
            )}
          </div>
        </div>
      ))}
      {rows.map((h) => {
        const t = toneOf(h)
        return (
          <div key={h.id} className="cmd-detail-item">
            <div className="cmd-detail-name">{h.name}</div>
            <div className="cmd-detail-tags">
              <span className={`cmd-chip ${t}`}>{TONE_LABEL[t]}</span>
              {h.scope === 'semester' && <span className="cmd-chip plain">เฉพาะภาค {h.semester ?? ''}</span>}
              {h.affects_work && <span className="cmd-chip plain">ยกเลิกวันทำงาน</span>}
              <span className="cmd-chip plain">{h.source === 'external' ? 'ซิงก์อัตโนมัติ' : 'เพิ่มเอง / PDF'}</span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function TermList({ terms, onPick }: { terms: AcademicTerm[]; onPick: (key: string) => void }) {
  if (terms.length === 0) {
    return <p className="cmd-muted">ยังไม่มีวันเปิด-ปิดภาคเรียน — นำเข้าจากไฟล์ปฏิทินการศึกษา (แท็บ “นำเข้าจากไฟล์ PDF”)</p>
  }
  const fmt = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(`${dayKey(iso)}T00:00:00`)
    return { key: dayKey(iso), text: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}` }
  }
  return (
    <ul className="cmd-terms">
      {terms.map((t) => {
        const o = fmt(t.open_date)
        const c = fmt(t.close_date)
        return (
          <li key={t.id}>
            <span className="cmd-term-name">{SEM_LABEL[t.semester] ?? t.semester}</span>
            <span className="cmd-term-range">
              {o ? <button type="button" onClick={() => onPick(o.key)}>{o.text}</button> : <span className="cmd-muted">ไม่ระบุ</span>}
              <span aria-hidden="true"> → </span><span className="sr-only">ถึง</span>
              {c ? <button type="button" onClick={() => onPick(c.key)}>{c.text}</button> : <span className="cmd-muted">ไม่ระบุ</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
