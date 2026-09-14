import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'

interface Option { value: string; label: string }

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  options: Option[]
  error?: string
}

export function Select({ label, hint, options, error, id, style, ...rest }: Props) {
  const autoId = useId()
  const selectId = id ?? autoId
  const errorId = `${selectId}-error`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={selectId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '9px 12px',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          background: '#fff',
          width: '100%',
          cursor: 'pointer',
          ...style,
        }}
        {...rest}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span id={errorId} role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{hint}</span>}
    </div>
  )
}
