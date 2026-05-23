import type { ReactNode } from 'react'
import { Card } from './Card'

interface Props {
  label: string
  value: number | string
  sub?: string
  color?: string
  icon?: ReactNode
}

export function StatCard({ label, value, sub, color = 'var(--primary)', icon }: Props) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {icon && (
        <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 22, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 1 }}>{sub}</div>}
      </div>
    </Card>
  )
}
