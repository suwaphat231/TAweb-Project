import { reportsApi } from '../../services/api'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'

const STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'SUBMITTED,UNDER_REVIEW,AWAITING_RESPONSE', label: 'อยู่ระหว่างตรวจสอบ' },
  { value: 'CONFIRMED', label: 'ยืนยันแล้ว' },
  { value: 'NOT_SUBSTANTIATED', label: 'ไม่ยืนยัน' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
]

export default function StudentReports() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <ReportPageHeader
        title="รายงานการปฏิบัติงานของฉัน"
        subtitle="รายงานที่ยังไม่ผ่านการตรวจสอบไม่ใช่ข้อสรุปว่าคุณกระทำผิด คุณสามารถส่งคำชี้แจงหรือหลักฐานเพิ่มเติมได้ระหว่างการตรวจสอบ และขอทบทวนได้หากเห็นว่าผลไม่ถูกต้อง การมีรายงานไม่ได้ตัดสิทธิ์การสมัครงาน"
      />
      <ReportList
        queryKey="student-reports"
        fetchPage={reportsApi.studentReports}
        statusOptions={STATUS_OPTIONS}
        showSearch={false}
        showStudent={false}
        emptyText="ไม่มีรายงานที่เกี่ยวข้องกับคุณ"
      />
    </div>
  )
}
