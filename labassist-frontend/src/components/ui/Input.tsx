import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, style, ...rest }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{label}</label>}
      <input
        style={{
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '9px 12px',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          background: '#fff',
          transition: 'border-color .15s',
          width: '100%',
          ...style,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--line)' }}
        {...rest}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{hint}</span>}
    </div>
  )
}
