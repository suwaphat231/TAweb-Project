import { Link } from 'react-router-dom'
import type { Course } from '../../types'
import { missingScheduleTerms } from '../../utils/termSchedule'

// Tells the student which terms they still need a schedule for — courses of
// those terms can't be applied to until it's saved on the profile page.
export function ScheduleRequiredBanner({ courses, style }: { courses: Course[]; style?: React.CSSProperties }) {
  const terms = missingScheduleTerms(courses)
  if (terms.length === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 16px', borderRadius: 8,
      background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 13,
      ...style,
    }}>
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>!</span>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>ยังไม่ได้กรอกตารางเรียน{terms.join(', ')}</div>
        <div>ต้องบันทึกตารางเรียนหรือยืนยันว่าไม่มีคาบเรียนของเทอมนั้นในหน้าโปรไฟล์ก่อน จึงจะสมัครวิชาของเทอมนั้นได้</div>
        <Link to="/student/profile" style={{ display: 'inline-block', marginTop: 6, color: 'var(--primary)', fontWeight: 700 }}>
          ไปกรอกตารางเรียน
        </Link>
      </div>
    </div>
  )
}
