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
    <Card className="stat-tile" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `color-mix(in srgb, ${iconColor} 12%, #fff)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-500)', marginTop: 4 }}>{label}</div>
        {delta !== undefined && (
          <div style={{ fontSize: 12, color: deltaType === 'up' ? 'var(--green)' : 'var(--red)', marginTop: 6 }}>
            {deltaType === 'up' ? '↑' : '↓'} {delta}
          </div>
        )}
      </div>
    </Card>
  )
}
