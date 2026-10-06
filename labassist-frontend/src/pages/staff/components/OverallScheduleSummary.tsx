import type { GroupMonthPlan } from '../../../types'
import { formatThaiDate, toDateOnly } from '../../../utils/thaiDate'

function thaiFmt(dateStr: string): string {
  return formatThaiDate(dateStr)
}

const MONTH_SHORT_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function fmtBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  monthlyPlan: GroupMonthPlan[]
  labBoyCount: number
  rateBaht: number
  onRateChange: (r: number) => void
  onSaveRate: () => void
  isSavingRate: boolean
  confirmErrors: string[]
  planLocked: boolean
}

export function OverallScheduleSummary({
  monthlyPlan, labBoyCount, rateBaht, onRateChange, onSaveRate,
  isSavingRate, confirmErrors, planLocked,
}: Props) {
  let earliest = ''
  let latest = ''
  let totalScheduled = 0
  let cancelledHoliday = 0
  let cancelledOther = 0
  let rescheduled = 0
  let totalValid = 0
  let totalHours = 0

  for (const gp of monthlyPlan) {
    for (const entry of gp.months) {
      for (const occ of entry.occurrences) {
        const d = toDateOnly(occ.scheduled_date) ?? ''
        if (d && (!earliest || d < earliest)) earliest = d
        if (d && (!latest || d > latest)) latest = d
      }
      totalScheduled += entry.summary.total
      cancelledHoliday += entry.summary.cancelled_holiday
      cancelledOther += entry.summary.cancelled_other
      rescheduled += entry.summary.rescheduled
      totalValid += entry.summary.valid
      totalHours += entry.summary.valid_hours
    }
  }

  const computedPay = totalHours * rateBaht * labBoyCount

  // Sorted month entries for per-month breakdown
  const monthEntries = monthlyPlan
    .flatMap(gp => gp.months)
    .sort((a, b) =>
      a.month.year !== b.month.year
        ? a.month.year - b.month.year
        : a.month.month - b.month.month,
    )

  const rows = [
    { label: 'วันที่กำหนดทั้งหมด', value: `${totalScheduled} วัน`, hi: false },
    { label: 'วันหยุด (ยกเลิก)', value: `${cancelledHoliday} วัน`, hi: false },
    { label: 'ยกเลิกอื่น', value: `${cancelledOther} วัน`, hi: false },
    { label: 'เลื่อน', value: `${rescheduled} วัน`, hi: false },
    { label: 'วันทำงานที่นับได้', value: `${totalValid} วัน`, hi: true },
    { label: 'ชั่วโมงรวม', value: `${totalHours.toFixed(1)} ชม.`, hi: true },
    { label: 'จำนวน Lab Boy', value: `${labBoyCount} คน`, hi: false },
    { label: 'ค่าตอบแทนรวม', value: `${fmtBaht(computedPay)} บาท`, hi: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Derived employment period */}
      {earliest && latest ? (
        <div style={{
          padding: '12px 16px', background: 'var(--blue-bg)',
          border: '1px solid #BFDBF5', borderRadius: 'var(--radius-input)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
            ช่วงปฏิบัติงาน (คำนวณจากวันที่บันทึก)
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
            {thaiFmt(earliest)} – {thaiFmt(latest)}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '12px 16px', background: 'var(--line-soft)',
          border: '1px solid var(--line)', borderRadius: 'var(--radius-input)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            ยังไม่มีวันปฏิบัติงาน — เพิ่มเดือนและวันปฏิบัติงานในแท็บแรกก่อน
          </div>
        </div>
      )}

      {/* Summary table */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          สรุปภาพรวม
        </div>
        <div style={{ border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 'none',
              background: row.hi ? 'var(--primary-50)' : '#fff',
            }}>
              <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: row.hi ? 700 : 500, color: row.hi ? 'var(--primary)' : 'var(--ink-900)' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pay calculation breakdown */}
      {monthEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            การคำนวณค่าตอบแทน
          </div>
          <div style={{ border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--line-soft)', borderBottom: '1px solid var(--line)' }}>
                  {['เดือน', 'วันทำงาน', 'ชั่วโมง', 'ค่าตอบแทน'].map((h, i) => (
                    <th key={i} style={{
                      padding: '7px 12px', fontWeight: 600, color: 'var(--ink-600)',
                      textAlign: i === 0 ? 'left' : 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthEntries.map((entry, i) => {
                  const monthPay = entry.summary.valid_hours * rateBaht * labBoyCount
                  const beYear = entry.month.year + 543
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)', background: '#fff' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--ink-700)', fontWeight: 500 }}>
                        {MONTH_SHORT_TH[entry.month.month - 1]} {beYear}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--ink-700)' }}>
                        {entry.summary.valid} วัน
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--ink-700)' }}>
                        {entry.summary.valid_hours.toFixed(1)} ชม.
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: rateBaht > 0 ? 'var(--ink-900)' : 'var(--ink-400)' }}>
                        {rateBaht > 0 ? `${fmtBaht(monthPay)} บาท` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--primary-50)', borderTop: '1.5px solid var(--primary-100)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>รวม</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{totalValid} วัน</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{totalHours.toFixed(1)} ชม.</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>
                    {rateBaht > 0 ? `${fmtBaht(computedPay)} บาท` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {rateBaht > 0 && (
            <div style={{
              padding: '10px 14px', background: 'var(--primary-50)',
              border: '1px solid var(--primary-100)', borderRadius: 'var(--radius-input)',
              fontSize: 12, color: 'var(--ink-600)', textAlign: 'center',
            }}>
              {totalHours.toFixed(1)} ชม.
              <span style={{ margin: '0 6px', color: 'var(--ink-400)' }}>×</span>
              {rateBaht} บาท/ชม.
              <span style={{ margin: '0 6px', color: 'var(--ink-400)' }}>×</span>
              {labBoyCount} คน
              <span style={{ margin: '0 6px', color: 'var(--ink-400)' }}>=</span>
              <strong style={{ fontSize: 14, color: 'var(--primary)' }}>{fmtBaht(computedPay)} บาท</strong>
            </div>
          )}
        </div>
      )}

      {/* Rate editor */}
      {!planLocked && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            อัตราค่าตอบแทน
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="number" min={1} step={1} value={rateBaht || ''}
              onChange={e => onRateChange(Number(e.target.value))}
              className="form-input" style={{ width: 100 }} />
            <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>บาท / ชม.</span>
            <button type="button" onClick={onSaveRate}
              disabled={isSavingRate || rateBaht <= 0}
              className="btn btn-outline btn-sm">
              {isSavingRate ? 'กำลังบันทึก...' : 'บันทึกอัตรา'}
            </button>
          </div>
        </div>
      )}

      {/* Confirm errors */}
      {confirmErrors.length > 0 && (
        <div style={{
          padding: '12px 16px', background: 'var(--red-bg)',
          border: '1px solid #FCA5A5', borderRadius: 'var(--radius-input)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
            ยังไม่สามารถยืนยันได้
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: 'var(--red)' }}>
            {confirmErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {planLocked && (
        <div style={{
          padding: '12px 16px', background: 'var(--green-bg)',
          border: '1px solid #86EFAC', borderRadius: 'var(--radius-input)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
            ✓ ยืนยันตารางปฏิบัติงานแล้ว
          </span>
        </div>
      )}

    </div>
  )
}
