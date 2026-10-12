import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ReportIcons'

interface Crumb { label: string; to?: string }

// ReportPageHeader gives every report page the same breadcrumb, title and
// subtitle layout, so moving course → student → report always shows where
// the user is and how to get back.
export function ReportPageHeader({ crumbs, title, subtitle, actions }: {
  crumbs?: Crumb[]
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header style={{ marginBottom: 20 }}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <Icon name="chevron-right" size={14} style={{ color: 'var(--ink-400)' }} />}
              {c.to
                ? <Link to={c.to} className="report-crumb">{c.label}</Link>
                : <span aria-current="page" style={{ color: 'var(--ink-500)' }}>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.3 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4, lineHeight: 1.6, maxWidth: 760 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </header>
  )
}
