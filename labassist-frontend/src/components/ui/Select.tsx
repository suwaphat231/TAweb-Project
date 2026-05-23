import type { SelectHTMLAttributes } from 'react'

interface Option { value: string; label: string }

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Option[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, style, ...rest }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{label}</label>}
      <select
        style={{
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '9px 12px',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          background: '#fff',
          width: '100%',
          ...style,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}
