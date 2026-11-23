import { reportsApi } from '../../services/api'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'

const STATUS_OPTIONS = [
  { value: 'CONFIRMED', label: 'รายงานแล้ว' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
  { value: '', label: 'ทั้งหมด' },
]

// Admin sees every report instructors have submitted, read-only. Only the
// reporting instructor confirms (by submitting) or withdraws a report.
export default function AdminReports() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ReportPageHeader
        title="นักศึกษาที่ถูกรายงาน"
        subtitle="รายงานพฤติกรรม Lab Boy ที่อาจารย์ส่งแล้ว — ดูได้อย่างเดียว การยืนยันหรือถอนรายงานเป็นของอาจารย์ผู้รายงานเท่านั้น"
      />
      <ReportList
        queryKey="admin-reports"
        fetchPage={reportsApi.adminList}
        statusOptions={STATUS_OPTIONS}
        showReporter
        emptyText="ยังไม่มีนักศึกษาที่ถูกรายงาน"
      />
    </div>
  )
}
