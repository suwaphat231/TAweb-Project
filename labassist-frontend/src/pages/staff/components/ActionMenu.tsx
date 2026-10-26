import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ActionMenuItem {
  label: string
  onClick: () => void
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** Draws a divider above this item. */
  separated?: boolean
}

/**
 * A button that opens a small list of actions, so a row keeps one obvious
 * action in view and tucks the rest away. Closes on outside click or Escape.
 */
export function ActionMenu({ trigger, items, label, style }: {
  trigger: ReactNode
  items: ActionMenuItem[]
  label: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 0) return null
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={() => setOpen((v) => !v)} style={style}>
        {trigger}
      </button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 220, zIndex: 50,
          background: 'var(--bg-card, #fff)', border: '1px solid var(--line)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', padding: 4,
        }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
              className="user-menu-item"
              onClick={() => { setOpen(false); it.onClick() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', borderRadius: 6,
                borderTop: it.separated ? '1px solid var(--line-soft)' : undefined,
                fontSize: 13, fontWeight: 500, cursor: it.disabled ? 'not-allowed' : 'pointer',
                color: it.disabled ? 'var(--ink-400)' : it.danger ? 'var(--red)' : 'var(--ink-700)',
              }}>
              {it.label}
              {it.hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-400)', fontWeight: 400, marginTop: 1 }}>{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
