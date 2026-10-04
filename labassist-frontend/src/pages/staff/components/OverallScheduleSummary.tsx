import type { GroupMonthPlan } from '../../../types'

const MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function thaiFmt(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
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
  let totalPay = 0

  for (const gp of monthlyPlan) {
    for (const entry of gp.months) {
      for (const occ of entry.occurrences) {
        if (!earliest || occ.scheduled_date < earliest) earliest = occ.scheduled_date
        if (!latest || occ.scheduled_date > latest) latest = occ.scheduled_date
      }
      totalScheduled += entry.summary.total
      cancelledHoliday += entry.summary.cancelled_holiday
      cancelledOther += entry.summary.cancelled_other
      rescheduled += entry.summary.rescheduled
      totalValid += entry.summary.valid
      totalHours += entry.summary.valid_hours
      totalPay += entry.summary.total_pay_baht
    }
  }

  const rows = [
    { label: 'วันที่กำหนดทั้งหมด', value: `${totalScheduled} วัน`, hi: false },
    { label: 'วันหยุด (ยกเลิก)', value: `${cancelledHoliday} วัน`, hi: false },
    { label: 'ยกเลิกอื่น', value: `${cancelledOther} วัน`, hi: false },
    { label: 'เลื่อน', value: `${rescheduled} วัน`, hi: false },
    { label: 'วันทำงานที่นับได้', value: `${totalValid} วัน`, hi: true },
    { label: 'ชั่วโมงรวม', value: `${totalHours.toFixed(1)} ชม.`, hi: true },
    { label: 'จำนวน Lab Boy', value: `${labBoyCount} คน`, hi: false },
    { label: 'ค่าตอบแทนรวม', value: `${totalPay.toFixed(2)} บาท`, hi: true },
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
