import type { ApplicationStatus, CourseStatus, UserRole } from '../../types'

type BadgeVariant = ApplicationStatus | CourseStatus | UserRole | 'ta' | 'labboy' | string

const map: Record<string, { bg: string; color: string; label: string }> = {
  accepted:      { bg: 'var(--green-bg)',   color: 'var(--green)',   label: 'รับแล้ว' },
  rejected:      { bg: 'var(--red-bg)',     color: 'var(--red)',     label: 'ไม่รับ' },
  withdrawn:     { bg: 'var(--line-soft)',  color: 'var(--ink-400)', label: 'ถอนใบสมัคร' },
  open:          { bg: 'var(--green-bg)',   color: 'var(--green)',   label: 'เปิดรับสมัคร' },
  closing_soon:  { bg: 'var(--amber-bg)',   color: 'var(--amber)',   label: 'ใกล้ปิด' },
  closed:        { bg: 'var(--red-bg)',     color: 'var(--red)',     label: 'ปิดรับ' },
  draft:         { bg: 'var(--line-soft)',  color: 'var(--ink-500)', label: 'ร่าง' },
  student:       { bg: 'var(--blue-bg)',    color: 'var(--blue)',    label: 'นักศึกษา' },
  instructor:    { bg: 'var(--primary-50)', color: 'var(--primary)', label: 'อาจารย์' },
  staff:         { bg: 'var(--amber-bg)',   color: 'var(--amber)',   label: 'เจ้าหน้าที่' },
  admin:         { bg: 'var(--red-bg)',     color: 'var(--red)',     label: 'Admin' },
  ta:            { bg: 'var(--blue-bg)',    color: 'var(--blue)',    label: 'TA' },
  labboy:        { bg: 'var(--primary-50)', color: 'var(--primary)', label: 'Lab Boy' },
}

interface Props {
  value: BadgeVariant
  label?: string
  size?: 'sm' | 'md'
}

export function Badge({ value, label, size = 'md' }: Props) {
  const p = map[value] ?? { bg: 'var(--line-soft)', color: 'var(--ink-500)', label: value }
  return (
    <span style={{
      background: p.bg, color: p.color,
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 600,
      padding: size === 'sm' ? '1px 8px' : '2px 10px',
      borderRadius: 'var(--radius-pill)',
      display: 'inline-block',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
    }}>
      {label ?? p.label}
    </span>
  )
}
