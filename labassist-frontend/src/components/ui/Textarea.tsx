import type { TextareaHTMLAttributes } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, style, ...rest }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{label}</label>}
      <textarea
        style={{
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '9px 12px',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          resize: 'vertical',
          minHeight: 80,
          width: '100%',
          ...style,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--line)' }}
        {...rest}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}
