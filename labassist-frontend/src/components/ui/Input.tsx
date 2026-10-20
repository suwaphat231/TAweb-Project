import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import { DateInput } from './DateInput'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  icon?: ReactNode
  error?: string
}

export function Input({ label, hint, icon, error, id, style, onFocus, onBlur, ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  const fieldStyle: React.CSSProperties = {
    border: `1.5px solid ${error ? 'var(--red)' : 'var(--line)'}`,
    borderRadius: 'var(--radius-input)',
    padding: icon ? '9px 12px 9px 34px' : '9px 12px',
    fontSize: 14,
    color: 'var(--ink-900)',
    outline: 'none',
    background: 'var(--bg-card)',
    transition: 'border-color .15s, box-shadow .15s',
    width: '100%',
  }
  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--primary)'
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-100)'
    onFocus?.(e)
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--line)'
    e.currentTarget.style.boxShadow = 'none'
    onBlur?.(e)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }} aria-hidden="true">
            {icon}
          </span>
        )}
        {rest.type === 'date' ? (
          // dd/mm/yyyy whatever the browser language — see DateInput.
          <DateInput
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            style={{ ...fieldStyle, ...style }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            value={String(rest.value ?? '')}
            min={rest.min === undefined ? undefined : String(rest.min)}
            max={rest.max === undefined ? undefined : String(rest.max)}
            disabled={rest.disabled}
            required={rest.required}
            onChange={rest.onChange as unknown as (e: { target: { value: string } }) => void}
          />
        ) : (
          <input
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            style={{ ...fieldStyle, ...style }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
          />
        )}
      </div>
      {error && <span id={errorId} role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{hint}</span>}
    </div>
  )
}
