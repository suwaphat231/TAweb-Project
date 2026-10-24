import { reportsApi } from '../../services/api'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { useAuth } from '../../hooks/useAuth'

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

// Staff only see the blacklist (reports admin has confirmed); the server
// returns nothing else to them.
const STAFF_STATUS_OPTIONS = [{ value: 'CONFIRMED', label: 'ยืนยันแล้ว' }]

export default function StaffReports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {isAdmin ? (
        <ReportPageHeader
          title="ตรวจสอบรายงานการปฏิบัติงาน"
          subtitle="พิจารณารายงานจากอาจารย์ หลักฐาน และคำชี้แจงของนักศึกษา แล้วบันทึกผล — ไม่สามารถพิจารณารายงานที่ตนเองเป็นผู้รายงานได้"
        />
      ) : (
        <ReportPageHeader
          title="นักศึกษาที่ถูก blacklist"
          subtitle="รายชื่อนักศึกษาที่ผู้ดูแลระบบยืนยันรายงานการปฏิบัติงานแล้ว — ใช้ประกอบการจัดทำเอกสาร การพิจารณาเป็นหน้าที่ของผู้ดูแลระบบ"
        />
      )}
      <ReportList
        queryKey={isAdmin ? 'staff-reports' : 'staff-blacklist'}
        fetchPage={reportsApi.reviewQueue}
        statusOptions={isAdmin ? STATUS_OPTIONS : STAFF_STATUS_OPTIONS}
        showReporter
        emptyText={isAdmin ? 'ไม่มีรายงานในสถานะนี้' : 'ยังไม่มีนักศึกษาที่ถูก blacklist'}
      />
    </div>
  )
}
