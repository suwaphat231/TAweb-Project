import type { ReactNode } from 'react'

export type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple'

const variantMap: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  green:  { bg: 'var(--green-bg)',    color: 'var(--green)',        border: '#BBF7D0' },
  amber:  { bg: 'var(--amber-bg)',    color: 'var(--amber)',        border: '#FDE68A' },
  red:    { bg: 'var(--red-bg)',      color: 'var(--red)',          border: '#FECACA' },
  blue:   { bg: 'var(--blue-bg)',     color: 'var(--blue)',         border: '#BFDBFE' },
  gray:   { bg: 'var(--line-soft)',   color: 'var(--ink-500)',      border: 'var(--line)' },
  purple: { bg: 'var(--primary-100)', color: 'var(--primary-700)', border: '#C7D2FE' },
}

interface BadgeProps {
  variant: BadgeVariant
  children: ReactNode
  showDot?: boolean
}

export function Badge({ variant, children, showDot }: BadgeProps) {
  const { bg, color, border } = variantMap[variant]
  return (
    <span style={{
      background: bg, color,
      fontSize: 12, fontWeight: 600,
      padding: '2px 10px',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid ${border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      lineHeight: '20px', whiteSpace: 'nowrap',
    }}>
      {showDot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {children}
    </span>
  )
}

const statusMap: Record<string, { variant: BadgeVariant; label: string }> = {
  pending:      { variant: 'amber',  label: 'รอพิจารณา' },
  accepted:     { variant: 'green',  label: 'รับแล้ว' },
  rejected:     { variant: 'red',    label: 'ไม่รับ' },
  withdrawn:    { variant: 'gray',   label: 'ถอนใบสมัคร' },
  open:         { variant: 'green',  label: 'เปิดรับสมัคร' },
  closing_soon: { variant: 'amber',  label: 'ใกล้ปิด' },
  closed:       { variant: 'red',    label: 'ปิดรับ' },
  draft:        { variant: 'gray',   label: 'ร่าง' },
  archived:     { variant: 'gray',   label: 'เก็บถาวร' },
  student:      { variant: 'blue',   label: 'นักศึกษา' },
  instructor:   { variant: 'blue',   label: 'อาจารย์' },
  staff:        { variant: 'amber',  label: 'เจ้าหน้าที่' },
  admin:        { variant: 'red',    label: 'Admin' },
  ta:           { variant: 'blue',   label: 'TA' },
  labboy:       { variant: 'purple', label: 'Lab Boy' },
  pass:         { variant: 'green',  label: 'ผ่านการตรวจสอบ' },
  needs_review: { variant: 'amber',  label: 'ต้องตรวจสอบ' },
  fail:         { variant: 'red',    label: 'ไม่ผ่านเกณฑ์' },
}

export function StatusBadge({ value }: { value: string }) {
  const s = statusMap[value] ?? { variant: 'gray' as BadgeVariant, label: value }
  return <Badge variant={s.variant}>{s.label}</Badge>
}
