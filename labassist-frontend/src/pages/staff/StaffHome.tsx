import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { staffApi } from '../../services/api'
import { Button } from '../../components/ui/Button'

const WORKFLOW = [
  { n: 1, label: 'สร้างแบบฟอร์มแจ้งความประสงค์', sub: 'ออกเอกสารพร้อมรายชื่อนักศึกษาที่อาจารย์ยืนยัน', to: '/staff/docs' },
  { n: 2, label: 'ตรวจสอบและอนุมัติแบบฟอร์ม',    sub: 'ตรวจสอบความครบถ้วน หรือส่งกลับแก้ไข',          to: '/staff/review' },
  { n: 3, label: 'จัดทำบันทึกขออนุมัติจ้าง',     sub: 'สร้างเอกสารประกอบการจ้าง',                    to: '/staff/docs' },
  { n: 4, label: 'รวบรวมหลักฐานปฏิบัติงาน',      sub: 'ตรวจสอบปลายภาคการศึกษา',                     to: '/staff/docs' },
  { n: 5, label: 'จัดทำหลักฐานจ่ายเงิน',         sub: 'เอกสารค่าตอบแทนนักศึกษา',                    to: '/staff/docs' },
  { n: 6, label: 'บันทึกขอเบิกจ่าย',             sub: 'ส่งต่อฝ่ายการเงิน',                           to: '/staff/docs' },
]

export default function StaffHome() {
  const { user } = useAuth()

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['staff-reviews'],
    queryFn: () => staffApi.listReviews(),
  })

  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  const loading = reviewsLoading || docsLoading

  const pendingCount  = reviews.filter((r) => r.status === 'pending').length
  const returnedCount = reviews.filter((r) => r.status === 'returned').length
  const verifiedCount = reviews.filter((r) => r.status === 'verified').length

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 3 }}>
          สวัสดี, {user?.full_name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
          ระบบจัดการผู้ช่วยปฏิบัติการ — กระบวนการเอกสารและธุรการ
        </p>
      </div>

      {/* Stat + action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {loading ? (
          <div style={{ height: 30, width: 280, background: 'var(--line-soft)', borderRadius: 999, opacity: 0.5 }} />
        ) : (
          <>
            <StatChip label="รอตรวจสอบ" value={pendingCount}  color="var(--amber)" />
            <StatChip label="ส่งกลับ"    value={returnedCount} color="var(--red)"   />
            <StatChip label="ผ่านแล้ว"   value={verifiedCount} color="var(--green)" />
            <StatChip label="เอกสาร"     value={docs.length}   color="var(--primary)" />
          </>
        )}
        <div style={{ flex: 1 }} />
        {pendingCount > 0 && (
          <Link to="/staff/review">
            <Button size="sm">ตรวจสอบแบบฟอร์ม ({pendingCount})</Button>
          </Link>
        )}
        <Link to="/staff/docs">
          <Button size="sm" variant="outline">จัดการเอกสาร</Button>
        </Link>
      </div>

      {/* Workflow */}
      <div style={{ background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            ขั้นตอนการดำเนินงาน
          </span>
        </div>
        {WORKFLOW.map((step, i) => (
          <Link key={step.n} to={step.to} style={{ textDecoration: 'none', display: 'block' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 20px',
                borderBottom: i < WORKFLOW.length - 1 ? '1px solid var(--line-soft)' : 'none',
                transition: 'background .12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: step.n <= 2 ? 'var(--primary)' : 'var(--line-soft)',
                color: step.n <= 2 ? '#fff' : 'var(--ink-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                {step.n}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: step.n <= 2 ? 600 : 400,
                  color: step.n <= 2 ? 'var(--primary)' : 'var(--ink-700)',
                  lineHeight: 1.3,
                }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{step.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', background: '#fff',
      border: '1.5px solid var(--line)', borderRadius: 999, fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color }}>{value}</span>
      <span style={{ color: 'var(--ink-500)' }}>{label}</span>
    </div>
  )
}
