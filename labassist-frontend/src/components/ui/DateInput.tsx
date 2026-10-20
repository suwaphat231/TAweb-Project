import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { fromDMY, toDMY } from '../../utils/thaiDate'

interface Props {
  /** YYYY-MM-DD, or '' for no date. */
  value: string
  /** Called with the new YYYY-MM-DD (or '' when cleared), shaped like an input event. */
  onChange?: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  id?: string
  className?: string
  style?: CSSProperties
  disabled?: boolean
  required?: boolean
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

// "01102026" → "01/10/2026" while typing: the slashes are filled in so only
// the digits need to be typed.
function maskDMY(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * A date field that always reads dd/mm/yyyy. The browser's own date input
 * follows the browser language (mm/dd/yyyy on an English browser), so the
 * date is typed as text here and the native picker only backs the calendar
 * button. The value stays YYYY-MM-DD, like <input type="date">.
 */
export function DateInput({
  value, onChange, min, max, id, className, style, disabled, required, onFocus, onBlur, ...aria
}: Props) {
  const [text, setText] = useState(toDMY(value))
  const [shownValue, setShownValue] = useState(value)
  const pickerRef = useRef<HTMLInputElement>(null)

  // Follow outside changes (form reset, picker) without overwriting a date
  // that is still being typed.
  if (value !== shownValue) {
    setShownValue(value)
    if (fromDMY(text) !== value) setText(toDMY(value))
  }

  function emit(iso: string) {
    if (iso !== value) onChange?.({ target: { value: iso } })
  }

  function handleType(raw: string) {
    const masked = maskDMY(raw)
    setText(masked)
    if (masked === '') return emit('')
    const iso = fromDMY(masked)
    if (iso && (!min || iso >= min) && (!max || iso <= max)) emit(iso)
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker) return
    try {
      picker.showPicker()
    } catch {
      picker.focus()
    }
  }

  const { width, ...inputStyle } = style ?? {}
  const fullWidth = width === '100%' || className?.split(' ').includes('w-full')

  return (
    <span style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : width }}>
      <input
        {...aria}
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={disabled}
        required={required}
        className={className}
        style={{ ...inputStyle, width: '100%', paddingRight: 32 }}
        onChange={(e) => handleType(e.target.value)}
        onFocus={onFocus}
        onBlur={(e) => {
          // An unfinished or out-of-range date goes back to the saved one.
          if (fromDMY(text) !== value) setText(toDMY(value))
          onBlur?.(e)
        }}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="เลือกจากปฏิทิน"
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, border: 'none', background: 'none', borderRadius: 6,
          color: 'var(--ink-500)', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setText(toDMY(e.target.value))
          emit(e.target.value)
        }}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }}
      />
    </span>
  )
}
