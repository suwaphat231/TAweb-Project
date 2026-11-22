import { useState } from 'react'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import {
  CALENDAR_IMPORT_TYPE_LABELS, CALENDAR_SEMESTER_LABELS, EVENT_CATEGORY_LABEL, entryDays, formatEntryRange, importSummary, rowsToImport,
  type CalendarDraftRow, type EventDraft,
} from '../../utils/academicCalendar'
import type { AcademicEventCategory } from '../../types'

export type CalendarReviewView = 'events' | 'holidays'

const SEMESTER_FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: '1', label: CALENDAR_SEMESTER_LABELS['1'] },
  { value: '2', label: CALENDAR_SEMESTER_LABELS['2'] },
  { value: 'S', label: CALENDAR_SEMESTER_LABELS.S },
]

const CATEGORY_TONE: Record<AcademicEventCategory, BadgeVariant> = {
  registration: 'blue', exam: 'purple', deadline: 'amber', other: 'gray',
}

const semesterLabel = (s: string) => CALENDAR_SEMESTER_LABELS[s] ?? s
const matches = (semester: string, filter: string) => !filter || semester === filter

interface Props {
  academicYear: number
  rows: CalendarDraftRow[]
  events: EventDraft[]
  /** Activities already saved for this year; saving replaces them. */
  savedEvents: number
  /** Terms with an open/close date filled in (from the term section above). */
  termCount: number
  termProblem: boolean
  saving: boolean
  onSelectRows: (indexes: number[], selected: boolean) => void
  onSelectEvents: (indexes: number[], include: boolean) => void
  onDiscard: () => void
  onSave: () => void
  defaultView?: CalendarReviewView
}

/**
 * Review of what a calendar file holds, read-only: the admin only ticks which
 * rows to save. Names, categories and types come from the file as read —
 * nothing in a row is editable. Academic events and holidays are separate
 * views, and the save summary sits apart from both lists.
 */
export function CalendarReview(p: Props) {
  const [view, setView] = useState<CalendarReviewView>(p.defaultView ?? (p.events.length > 0 ? 'events' : 'holidays'))
  const [semester, setSemester] = useState('')

  const visibleEvents = p.events.map((e, index) => ({ e, index })).filter(({ e }) => matches(e.activity.semester, semester))
  const visibleRows = p.rows.map((row, index) => ({ row, index })).filter(({ row }) => matches(row.semester, semester))
  const selectableRows = visibleRows.filter(({ row }) => !row.exists && row.name.trim())

  const chosenEvents = p.events.filter((e) => e.include)
  const chosenRows = rowsToImport(p.rows)
  const holidays = importSummary(p.rows)
  const found = view === 'events' ? visibleEvents.length : visibleRows.length
  const chosenHere = view === 'events'
    ? visibleEvents.filter(({ e }) => e.include).length
    : visibleRows.filter(({ row }) => chosenRows.includes(row)).length
  const nothingChosen = holidays.entries === 0 && p.termCount === 0 && chosenEvents.length === 0

  const selectAllVisible = (on: boolean) => {
    if (view === 'events') p.onSelectEvents(visibleEvents.map(({ index }) => index), on)
    else p.onSelectRows(selectableRows.map(({ index }) => index), on)
  }

  return (
    <>
      <section aria-labelledby="cal-review-title" className="cal-review">
        <div className="cal-review-head">
          <div>
            <h2 id="cal-review-title" className="cal-review-title">ปฏิทินวิชาการ</h2>
            <p className="cal-review-desc">เลือกรายการที่ต้องการบันทึกลงปฏิทินการศึกษา — ติ๊กช่องหน้ารายการเพื่อเลือกบันทึก ข้อมูลในแถวแก้ไขไม่ได้</p>
          </div>
          <div className="cal-review-count" aria-live="polite">
            พบ <b>{found}</b> รายการ
            <span className="cal-review-muted"> · เลือกแล้ว {chosenHere}</span>
          </div>
        </div>

        <div className="cal-tabs" role="tablist" aria-label="ชนิดรายการ">
          <button type="button" role="tab" aria-selected={view === 'events'} onClick={() => setView('events')}>กิจกรรมวิชาการ</button>
          <button type="button" role="tab" aria-selected={view === 'holidays'} onClick={() => setView('holidays')}>วันหยุด</button>
        </div>

        <div className="cal-review-filters">
          <div role="group" aria-label="กรองตามภาคเรียน" className="cal-review-semesters">
            {SEMESTER_FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={semester === f.value} className="cal-chip" onClick={() => setSemester(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="cal-review-muted">
            กำลังดู: ปีการศึกษา {p.academicYear} · {semester ? semesterLabel(semester) : 'ทุกภาคเรียน'}
          </span>
          <div className="cal-review-bulk">
            <Button type="button" size="sm" variant="outline" onClick={() => selectAllVisible(true)}>เลือกทั้งหมด</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => selectAllVisible(false)}>ไม่เลือกเลย</Button>
          </div>
        </div>

        {view === 'events' && p.savedEvents > 0 && (
          <p className="cal-review-note">มีกิจกรรมที่บันทึกไว้แล้ว {p.savedEvents} รายการ — การบันทึกครั้งนี้จะแทนที่กิจกรรมของปีนี้ทั้งหมด</p>
        )}
        {view === 'holidays' && (
          <p className="cal-review-note">วันหยุดที่บันทึกจะยกเลิกวันทำงานของ Lab Boy ที่ตรงกันโดยอัตโนมัติ</p>
        )}

        <div
          className="data-table-wrap" role="region" tabIndex={0}
          aria-label={view === 'events' ? 'รายการกิจกรรมวิชาการที่อ่านได้จากไฟล์' : 'รายการวันหยุดที่อ่านได้จากไฟล์'}
        >
          <table className="data-table cal-review-table">
            <thead>
              <tr>
                <th scope="col" className="cal-col-check">บันทึก</th>
                <th scope="col">ชื่อกิจกรรม</th>
                <th scope="col">วันที่</th>
                <th scope="col">ประเภท</th>
                <th scope="col">ภาคเรียน</th>
              </tr>
            </thead>
            <tbody>
              {found === 0 && (
                <tr><td colSpan={5}><EmptyState title="ไม่มีรายการในตัวกรองนี้" /></td></tr>
              )}
              {view === 'events' && visibleEvents.map(({ e, index }) => {
                const a = e.activity
                const id = `cal-ev-${index}`
                return (
                  <tr key={index}>
                    <td className="cal-col-check">
                      <input
                        id={id} type="checkbox" className="cal-check" checked={e.include}
                        aria-label={`เลือกบันทึก ${a.name}`}
                        onChange={(ev) => p.onSelectEvents([index], ev.target.checked)}
                      />
                    </td>
                    <td><label htmlFor={id} className="cal-name">{a.name}</label></td>
                    <td className="cal-date">{formatEntryRange(a.start_date, a.end_date)}</td>
                    <td><Badge variant={CATEGORY_TONE[a.category]}>{EVENT_CATEGORY_LABEL[a.category]}</Badge></td>
                    <td>{semesterLabel(a.semester)}</td>
                  </tr>
                )
              })}
              {view === 'holidays' && visibleRows.map(({ row, index }) => {
                const id = `cal-hd-${index}`
                const unnamed = !row.name.trim()
                const days = entryDays(row.start_date, row.end_date)
                return (
                  <tr key={index} className={row.exists ? 'is-existing' : undefined}>
                    <td className="cal-col-check">
                      <input
                        id={id} type="checkbox" className="cal-check"
                        checked={row.selected && !row.exists && !unnamed}
                        disabled={row.exists || unnamed}
                        title={row.exists ? 'มีในระบบแล้ว' : unnamed ? 'ไฟล์ไม่ระบุชื่อรายการ' : undefined}
                        aria-label={`เลือกบันทึก ${row.name || 'รายการไม่มีชื่อ'}`}
                        onChange={(ev) => p.onSelectRows([index], ev.target.checked)}
                      />
                    </td>
                    <td>
                      <label htmlFor={id} className="cal-name">{row.name || '— ไม่มีชื่อ —'}</label>
                      {row.exists && <div className="cal-row-badge"><Badge variant="gray">มีในระบบแล้ว</Badge></div>}
                      {!row.exists && !row.include && (
                        <div className="cal-row-badge"><Badge variant="amber">วันสำคัญ — ไฟล์ไม่ได้ระบุว่าหยุด ตรวจสอบก่อนเลือก</Badge></div>
                      )}
                    </td>
                    <td className="cal-date">
                      {formatEntryRange(row.start_date, row.end_date)}
                      {days > 1 && <div className="cal-review-muted">{days} วัน</div>}
                    </td>
                    <td><Badge variant={row.date_type === 'public_holiday' ? 'red' : 'blue'}>{CALENDAR_IMPORT_TYPE_LABELS[row.date_type]}</Badge></td>
                    <td>{semesterLabel(row.semester)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cal-confirm-title" className="cal-confirm">
        <h2 id="cal-confirm-title" className="cal-review-title">สรุปรายการที่จะบันทึก</h2>
        <ul className="cal-confirm-list">
          <li>กิจกรรมวิชาการ <b>{chosenEvents.length}</b> จาก {p.events.length} รายการ</li>
          <li>วันหยุด <b>{holidays.entries}</b> จาก {p.rows.length} รายการ ({holidays.days} วัน)</li>
          <li>วันเปิด-ปิดภาคเรียน <b>{p.termCount}</b> ภาค</li>
        </ul>
        {(chosenEvents.length > 0 || chosenRows.length > 0) && (
          <details className="cal-confirm-details">
            <summary>ดูรายการที่เลือก</summary>
            {chosenEvents.length > 0 && (
              <>
                <div className="cal-confirm-group">กิจกรรมวิชาการ</div>
                <ul>{chosenEvents.map((e, i) => <li key={i}>{formatEntryRange(e.activity.start_date, e.activity.end_date)} — {e.activity.name}</li>)}</ul>
              </>
            )}
            {chosenRows.length > 0 && (
              <>
                <div className="cal-confirm-group">วันหยุด</div>
                <ul>{chosenRows.map((r, i) => <li key={i}>{formatEntryRange(r.start_date, r.end_date)} — {r.name}</li>)}</ul>
              </>
            )}
          </details>
        )}
        {p.termProblem && <p className="cal-confirm-warn" role="alert">วันเปิด-ปิดภาคเรียนยังไม่ถูกต้อง — แก้ไขด้านบนก่อนบันทึก</p>}
        <div className="cal-confirm-actions">
          <Button type="button" variant="ghost" onClick={p.onDiscard}>ยกเลิก</Button>
          <Button type="button" loading={p.saving} disabled={nothingChosen || p.termProblem} onClick={p.onSave}>
            บันทึกลงปฏิทิน
          </Button>
        </div>
      </section>
    </>
  )
}
