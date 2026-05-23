interface Step {
  label: string
  description?: string
}

interface Props {
  steps: Step[]
  current: number
}

export function Stepper({ steps, current }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? 'var(--green)' : active ? 'var(--primary)' : 'var(--line)',
                color: done || active ? '#fff' : 'var(--ink-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, transition: 'background .2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--primary)' : done ? 'var(--green)' : 'var(--ink-400)' }}>{step.label}</div>
                {step.description && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{step.description}</div>}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--green)' : 'var(--line)', marginBottom: 26, transition: 'background .2s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
