import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

const MOCK_STATS = { pending: 2, verified: 2, docs: 4, returned: 1 }

const WORKFLOW_STEPS = [
  { num: 1, label: 'ตรวจสอบแบบฟอร์ม',       sub: 'รับและตรวจสอบความครบถ้วน',      to: '/staff/review',  active: true  },
  { num: 2, label: 'ส่งกลับแก้ไข (ถ้าพบข้อบกพร่อง)', sub: 'แจ้งอาจารย์ให้ปรับปรุง',      to: '/staff/review',  active: false },
  { num: 3, label: 'จัดทำบันทึกขออนุมัติจ้าง', sub: 'สร้างเอกสารประกอบการจ้าง',      to: '/staff/docs',    active: false },
  { num: 4, label: 'รวบรวมหลักฐานการปฏิบัติงาน', sub: 'ตรวจสอบปลายภาคการศึกษา',     to: '/staff/docs',    active: false },
  { num: 5, label: 'จัดทำหลักฐานจ่ายเงิน',    sub: 'เอกสารค่าตอบแทน',               to: '/staff/docs',    active: false },
  { num: 6, label: 'บันทึกขอเบิกจ่าย',        sub: 'ส่งต่อฝ่ายงบประมาณ',             to: '/staff/docs',    active: false },
]

export default function StaffHome() {
  const { user } = useAuth()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>
          สวัสดี, {user?.full_name}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>ระบบจัดการผู้ช่วยปฏิบัติการ — กระบวนการเอกสารและธุรการ</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard value={MOCK_STATS.pending}  label="รอตรวจสอบ"   color="#F59E0B" />
        <StatCard value={MOCK_STATS.returned} label="ส่งกลับแก้ไข" color="#EF4444" />
        <StatCard value={MOCK_STATS.verified} label="ผ่านการตรวจสอบ" color="#22C55E" />
        <StatCard value={MOCK_STATS.docs}     label="เอกสารทั้งหมด" color="var(--primary)" />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>ตรวจสอบแบบฟอร์ม</div>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
            ตรวจสอบแบบฟอร์มแจ้งความประสงค์ที่อาจารย์ส่งมา และอนุมัติหรือส่งกลับแก้ไข
          </p>
          {MOCK_STATS.pending > 0 && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF9C3', padding: '4px 10px', borderRadius: 6, marginBottom: 12, display: 'inline-block' }}>
              รอตรวจสอบ {MOCK_STATS.pending} รายการ
            </div>
          )}
          <Link to="/staff/review"><Button size="sm">ตรวจสอบแบบฟอร์ม</Button></Link>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>จัดการเอกสาร</div>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
            จัดทำบันทึกขออนุมัติ หลักฐานจ่ายเงิน และบันทึกขอเบิกจ่ายค่าตอบแทน
          </p>
          <Link to="/staff/docs"><Button size="sm" variant="outline">จัดการเอกสาร</Button></Link>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>ดูผู้สมัครทุกวิชา</div>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
            ดูรายชื่อผู้สมัครและผลการพิจารณาของทุกวิชาในระบบ
          </p>
          <Link to="/instructor/select"><Button size="sm" variant="outline">ดูผู้สมัคร</Button></Link>
        </Card>
      </div>

      {/* Workflow steps */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 14 }}>ขั้นตอนการดำเนินงาน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {/* connector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13,
                  background: step.active ? 'var(--primary)' : 'var(--line-soft)',
                  color: step.active ? '#fff' : 'var(--ink-400)',
                }}>
                  {step.num}
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div style={{ width: 2, height: 28, background: 'var(--line-soft)', margin: '2px 0' }} />
                )}
              </div>
              <div style={{ paddingBottom: i < WORKFLOW_STEPS.length - 1 ? 4 : 0, paddingTop: 4 }}>
                <Link to={step.to} style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 14, fontWeight: step.active ? 600 : 400, color: step.active ? 'var(--primary)' : 'var(--ink-700)' }}>
                    {step.label}
                  </span>
                </Link>
                <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 1 }}>{step.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>{label}</div>
    </div>
  )
}
