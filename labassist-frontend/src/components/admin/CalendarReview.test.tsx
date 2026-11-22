import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CalendarPreviewActivity } from '../../types'
import type { CalendarDraftRow } from '../../utils/academicCalendar'
import { toEventDrafts } from '../../utils/academicCalendar'
import { CalendarReview, type CalendarReviewView } from './CalendarReview'

// No DOM test environment: render to HTML and check structure.
const act = (p: Partial<CalendarPreviewActivity>): CalendarPreviewActivity =>
  ({ start_date: '2027-05-03', end_date: '2027-05-03', name: 'ลงทะเบียนเรียน', semester: '1', category: 'registration', page: 1, ...p })

const row = (p: Partial<CalendarDraftRow>): CalendarDraftRow =>
  ({ start_date: '2027-07-28', end_date: '2027-07-28', name: 'วันเฉลิมพระชนมพรรษา', semester: '1', date_type: 'public_holiday', include: true, exists: false, selected: true, affects_work: true, ...p }) as CalendarDraftRow

function render(view?: CalendarReviewView) {
  return renderToStaticMarkup(
    <CalendarReview
      academicYear={2570}
      rows={[row({}), row({ name: 'วันหยุดภาคปลาย', semester: '2', date_type: 'university_holiday' })]}
      events={toEventDrafts([act({}), act({ name: 'สอบกลางภาค', category: 'exam', semester: '2' }), act({ name: 'ปฐมนิเทศ', category: 'other' })])}
      savedEvents={0} termCount={2} termProblem={false} saving={false}
      onSelectRows={() => {}} onSelectEvents={() => {}} onDiscard={() => {}} onSave={() => {}}
      defaultView={view}
    />,
  )
}

describe('CalendarReview', () => {
  it('has no editable fields in rows — only checkboxes', () => {
    for (const html of [render('events'), render('holidays')]) {
      expect(html).not.toContain('<select')
      expect(html).not.toMatch(/<input(?![^>]*type="checkbox")/)
    }
  })

  it('shows the header, count and top-level semester filters', () => {
    const html = render('events')
    expect(html).toContain('ปฏิทินวิชาการ')
    expect(html).toContain('พบ <b>3</b> รายการ')
    for (const f of ['ทั้งหมด', 'ภาคต้น', 'ภาคปลาย', 'ภาคฤดูร้อน']) expect(html).toContain(`>${f}</button>`)
    expect(html).toContain('กำลังดู: ปีการศึกษา 2570')
  })

  it('lists events with name, date, category label and semester columns', () => {
    const html = render('events')
    for (const h of ['บันทึก', 'ชื่อกิจกรรม', 'วันที่', 'ประเภท', 'ภาคเรียน']) expect(html).toContain(`>${h}</th>`)
    expect(html).toContain('สอบกลางภาค')
    expect(html).toContain('ลงทะเบียน / ถอน')
    expect(html).toContain('aria-label="เลือกบันทึก ลงทะเบียนเรียน"')
  })

  it('keeps holidays out of the events table and vice versa', () => {
    const ev = render('events')
    expect(ev).not.toContain('วันเฉลิมพระชนมพรรษา</label>')
    const hd = render('holidays')
    expect(hd).toContain('วันเฉลิมพระชนมพรรษา')
    expect(hd).not.toContain('สอบกลางภาค</label>')
    expect(hd).toContain('พบ <b>2</b> รายการ')
  })

  it('summarises the selection in a separate confirm section with the save button', () => {
    const html = render('events')
    const confirm = html.slice(html.indexOf('สรุปรายการที่จะบันทึก'))
    expect(confirm).toContain('กิจกรรมวิชาการ <b>2</b> จาก 3 รายการ')
    expect(confirm).toContain('วันหยุด <b>2</b> จาก 2 รายการ')
    expect(confirm).toContain('บันทึกลงปฏิทิน')
    expect(html.lastIndexOf('บันทึกลงปฏิทิน')).toBeGreaterThan(html.indexOf('</table>'))
  })
})
