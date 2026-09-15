import type { CourseOffering } from '../../../types'

interface Props {
  offerings: CourseOffering[]
  loading?: boolean
}

export function SummaryCards({ offerings, loading }: Props) {
  const total = offerings.length
  const waiting = offerings.filter((o) => o.docStatus === 'waiting').length
  const inProgress = offerings.filter((o) => o.docStatus === 'in_progress').length
  const completed = offerings.filter((o) => o.docStatus === 'completed').length

  const cards = [
    { label: 'รายวิชาทั้งหมด',   value: total,      color: 'var(--primary)', bg: 'var(--primary-50)',  border: 'var(--primary-100)' },
    { label: 'รอจัดทำเอกสาร',    value: waiting,    color: 'var(--amber)',   bg: 'var(--amber-bg)',   border: '#FCD34D' },
    { label: 'กำลังดำเนินการ',   value: inProgress, color: 'var(--blue)',    bg: 'var(--blue-bg)',    border: '#BFDBF5' },
    { label: 'เสร็จสิ้นแล้ว',   value: completed,  color: 'var(--green)',   bg: 'var(--green-bg)',   border: '#86EFAC' },
  ]

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{
            background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
            padding: '16px 20px', height: 96,
          }}>
            <div style={{ height: 12, width: '60%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 10 }} />
            <div style={{ height: 28, width: '40%', background: 'var(--line-soft)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
      {cards.map(({ label, value, color, border }) => (
        <div key={label} style={{
          background: '#fff', border: `1.5px solid ${border}`,
          borderRadius: 'var(--radius-card)', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>วิชา</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line-soft)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: color,
              width: total > 0 ? `${(value / total) * 100}%` : '0%',
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}
