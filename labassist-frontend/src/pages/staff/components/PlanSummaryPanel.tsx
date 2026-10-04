import type { GroupMonthPlan } from '../../../types'

const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

interface Props {
  data: GroupMonthPlan[]
}

export default function PlanSummaryPanel({ data }: Props) {
  if (data.length === 0) return null

  const rows: {
    groupName: string
    monthLabel: string
    total: number
    holiday: number
    cancelOther: number
    rescheduled: number
    valid: number
    validHours: number
    rateBaht: number
    payPerPerson: number
    labBoys: number
    totalPay: number
  }[] = []

  let grandValid = 0
  let grandHours = 0
  let grandTotalPay = 0

  for (const gp of data) {
    for (const entry of gp.months) {
      const s = entry.summary
      rows.push({
        groupName: gp.group.group_name || `กลุ่ม ${gp.group.id}`,
        monthLabel: `${MONTHS_TH[s.month - 1]} ${s.year + 543}`,
        total: s.total,
        holiday: s.cancelled_holiday,
        cancelOther: s.cancelled_other,
        rescheduled: s.rescheduled,
        valid: s.valid,
        validHours: s.valid_hours,
        rateBaht: s.rate_per_hour_baht,
        payPerPerson: s.pay_per_person_baht,
        labBoys: s.lab_boy_count,
        totalPay: s.total_pay_baht,
      })
      grandValid += s.valid
      grandHours += s.valid_hours
      grandTotalPay += s.total_pay_baht
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b">
        <h4 className="font-semibold text-sm text-gray-800">สรุปแผนปฏิบัติงานทั้งหมด</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500">
              <th className="px-3 py-2 text-left font-semibold">กลุ่ม</th>
              <th className="px-3 py-2 text-left font-semibold">เดือน</th>
              <th className="px-3 py-2 text-right font-semibold">ทั้งหมด</th>
              <th className="px-3 py-2 text-right font-semibold">วันหยุด</th>
              <th className="px-3 py-2 text-right font-semibold">ยกเลิก/เลื่อน</th>
              <th className="px-3 py-2 text-right font-semibold text-indigo-700">นับ</th>
              <th className="px-3 py-2 text-right font-semibold">ชม.</th>
              <th className="px-3 py-2 text-right font-semibold">อัตรา</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-700">/คน (บ.)</th>
              <th className="px-3 py-2 text-right font-semibold">Lab Boy</th>
              <th className="px-3 py-2 text-right font-semibold text-green-700">รวม (บ.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700">{r.groupName}</td>
                <td className="px-3 py-1.5 text-gray-600">{r.monthLabel}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{r.total}</td>
                <td className="px-3 py-1.5 text-right text-amber-600">{r.holiday || '—'}</td>
                <td className="px-3 py-1.5 text-right text-gray-400">{(r.cancelOther + r.rescheduled) || '—'}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-indigo-700">{r.valid}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{r.validHours.toFixed(1)}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{r.rateBaht.toFixed(0)}</td>
                <td className="px-3 py-1.5 text-right text-blue-700">{r.payPerPerson.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{r.labBoys}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-green-700">{r.totalPay.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t font-semibold">
              <td colSpan={5} className="px-3 py-2 text-gray-600 text-xs">รวมทั้งสิ้น</td>
              <td className="px-3 py-2 text-right text-indigo-700">{grandValid}</td>
              <td className="px-3 py-2 text-right text-gray-700">{grandHours.toFixed(1)}</td>
              <td colSpan={3} />
              <td className="px-3 py-2 text-right text-green-700">{grandTotalPay.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
