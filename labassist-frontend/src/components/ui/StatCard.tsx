import type { ReactNode } from 'react'
import { Card } from './Card'

interface Props {
  label: string
  value: number | string
  icon: ReactNode
  iconColor: string
  delta?: number | string
  deltaType?: 'up' | 'down'
}

export function StatCard({ label, value, icon, iconColor, delta, deltaType }: Props) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 6 }}>{label}</div>
        {delta !== undefined && (
          <div style={{ fontSize: 12, color: deltaType === 'up' ? 'var(--green)' : 'var(--red)', marginTop: 6 }}>
            {deltaType === 'up' ? '↑' : '↓'} {delta}
          </div>
        )}
      </div>
    </Card>
  )
}
