import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../services/api'
import { Button } from '../ui/Button'
import { categoryLabel, formatDate } from './reportLabels'

// ConfirmedHistory shows an applicant's CONFIRMED work-performance records
// inside the instructor's applicant review. Details load only when the
// instructor asks for them, because every view is written to the audit log.
export function ConfirmedHistory({ applicationId, count }: { applicationId: number; count: number }) {
  const [open, setOpen] = useState(false)
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['confirmed-history', applicationId],
    queryFn: () => reportsApi.confirmedHistory(applicationId),
    enabled: open,
  })

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>ประวัติการปฏิบัติงานที่ยืนยันแล้ว</div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
            {count > 0 ? `${count} รายการที่ผ่านการตรวจสอบแล้ว` : 'ไม่มีรายการที่ผ่านการตรวจสอบ'}
          </div>
        </div>
        {count > 0 && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>ดูรายละเอียด</Button>}
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
            ใช้ประกอบการพิจารณาเท่านั้น ไม่ได้ตัดสิทธิ์การสมัคร · การเปิดดูถูกบันทึกไว้
          </div>
          {isLoading && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>กำลังโหลด...</div>}
          {isError && <div style={{ fontSize: 12, color: 'var(--red)' }}>โหลดข้อมูลไม่สำเร็จ</div>}
          {data.map((rec) => (
            <div key={rec.report_id} style={{ background: 'var(--line-soft)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                {categoryLabel[rec.category]} · {formatDate(rec.incident_date)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', margin: '2px 0 6px' }}>
                {rec.course_code} {rec.course_title}{rec.course_semester ? ` (${rec.course_semester}/${rec.course_academic_year})` : ''} · ยืนยันเมื่อ {formatDate(rec.confirmed_at)}
                {rec.student_responded && ' · นักศึกษาได้ส่งคำชี้แจงแล้ว'}
              </div>
              <div style={{ color: 'var(--ink-700)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{rec.description}</div>
              {rec.review_reason && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-600)', borderLeft: '3px solid var(--line)', paddingLeft: 8 }}>
                  เหตุผลของผู้ตรวจสอบ: {rec.review_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
