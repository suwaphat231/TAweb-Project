import { reportsApi } from '../../services/api'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'

const STATUS_OPTIONS = [
  { value: 'SUBMITTED,UNDER_REVIEW,AWAITING_RESPONSE', label: 'รอดำเนินการ' },
  { value: 'SUBMITTED', label: 'รอรับเรื่อง' },
  { value: 'UNDER_REVIEW', label: 'กำลังตรวจสอบ' },
  { value: 'AWAITING_RESPONSE', label: 'รอคำชี้แจง' },
  { value: 'CONFIRMED', label: 'ยืนยันแล้ว' },
  { value: 'NOT_SUBSTANTIATED', label: 'ไม่ยืนยัน' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
  { value: '', label: 'ทั้งหมด' },
]

export default function StaffReports() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ReportPageHeader
        title="ตรวจสอบรายงานการปฏิบัติงาน"
        subtitle="พิจารณารายงานจากอาจารย์ หลักฐาน และคำชี้แจงของนักศึกษา แล้วบันทึกผลพร้อมเหตุผล — ไม่สามารถพิจารณารายงานที่ตนเองเป็นผู้รายงานได้"
      />
      <ReportList
        queryKey="staff-reports"
        fetchPage={reportsApi.reviewQueue}
        statusOptions={STATUS_OPTIONS}
        showReporter
        emptyText="ไม่มีรายงานในสถานะนี้"
      />
    </div>
  )
}
