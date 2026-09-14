import type { TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  rows?: number
}

export function Textarea({ label, hint, error, id, rows, style, onFocus, onBlur, ...rest }: Props) {
  const autoId = useId()
  const textareaId = id ?? autoId
  const errorId = `${textareaId}-error`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={textareaId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-input)',
          padding: '9px 12px',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          resize: 'vertical',
          minHeight: 88,
          width: '100%',
          transition: 'border-color .15s, box-shadow .15s',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-100)'
          onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--line)'
          e.currentTarget.style.boxShadow = 'none'
          onBlur?.(e)
        }}
        {...rest}
      />
      {error && <span id={errorId} role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{hint}</span>}
    </div>
  )
}
