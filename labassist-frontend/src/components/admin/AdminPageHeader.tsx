import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: ReactNode
  /** Page-level actions: one primary button, the rest outline. Destructive ones go first/last, never primary. */
  actions?: ReactNode
}

/** Same title block for every admin page, so titles, spacing and actions line up. */
export function AdminPageHeader({ title, description, actions }: Props) {
  return (
    <header style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      gap: 16, flexWrap: 'wrap', marginBottom: 24,
    }}>
      <div style={{ minWidth: 0, flex: '1 1 280px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.3 }}>{title}</h1>
        {description && (
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4, maxWidth: 760 }}>{description}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </header>
  )
}
