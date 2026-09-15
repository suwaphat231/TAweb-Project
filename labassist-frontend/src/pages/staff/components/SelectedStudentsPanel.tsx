import type { Application } from '../../../types'

interface Props {
  applicants: Application[]
  loading?: boolean
}

export function SelectedStudentsPanel({ applicants, loading }: Props) {
  const accepted = applicants.filter((a) => a.status === 'accepted')

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 44, background: 'var(--line-soft)', borderRadius: 8 }} />
        ))}
      </div>
    )
  }

  if (accepted.length === 0) {
    return (
      <div style={{
        padding: '24px 16px', textAlign: 'center',
        background: 'var(--line-soft)', borderRadius: 8,
        fontSize: 13, color: 'var(--ink-400)',
      }}>
        ยังไม่มีนักศึกษาที่ได้รับเลือกเป็น Lab Boy
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{
        display: 'flex', gap: 8, padding: '8px 12px',
        background: 'var(--line-soft)', borderRadius: '8px 8px 0 0',
        fontSize: 11, fontWeight: 700, color: 'var(--ink-500)',
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        <span style={{ flex: 1 }}>ชื่อนักศึกษา</span>
        <span style={{ width: 100 }}>รหัสนักศึกษา</span>
      </div>
      {accepted.map((a, i) => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: '#fff',
          borderBottom: i < accepted.length - 1 ? '1px solid var(--line-soft)' : 'none',
          borderLeft: '1px solid var(--line-soft)',
          borderRight: '1px solid var(--line-soft)',
          borderRadius: i === accepted.length - 1 ? '0 0 8px 8px' : 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'var(--primary-50)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)' }}>
              {a.student_name}
            </div>
            {a.student_email && (
              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{a.student_email}</div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', fontFamily: 'monospace', width: 100, textAlign: 'right' }}>
            {a.student_code}
          </div>
        </div>
      ))}
      <div style={{
        padding: '8px 12px', background: 'var(--green-bg)',
        borderRadius: '0 0 8px 8px', border: '1px solid #86EFAC',
        borderTop: 'none', fontSize: 12, fontWeight: 600, color: 'var(--green)',
        textAlign: 'right',
      }}>
        ทั้งหมด {accepted.length} คน
      </div>
    </div>
  )
}
