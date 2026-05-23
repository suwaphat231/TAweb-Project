import type { ReactNode } from 'react'

interface Props {
  title?: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title = 'ไม่มีข้อมูล', description, action, icon }: Props) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      {icon && <div style={{ fontSize: 48, marginBottom: 16, color: 'var(--ink-400)' }}>{icon}</div>}
      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>{title}</h3>
      {description && <p style={{ fontSize: 14, color: 'var(--ink-400)', marginBottom: 20 }}>{description}</p>}
      {action}
    </div>
  )
}
