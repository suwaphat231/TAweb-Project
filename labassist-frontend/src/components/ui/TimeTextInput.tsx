import type { InputHTMLAttributes } from 'react'
import { formatTyping, normalizeTime } from '../../utils/timeText'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}

/**
 * TimeTextInput is a typed 24-hour HH:MM time field — no browser time picker,
 * which shows AM/PM and a scrolling list instead of letting people just type.
 */
export function TimeTextInput({ value, onChange, onBlur, ...rest }: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      maxLength={5}
      autoComplete="off"
      {...rest}
      value={value}
      onChange={(e) => onChange(formatTyping(e.target.value))}
      onBlur={(e) => { if (value) onChange(normalizeTime(value)); onBlur?.(e) }}
    />
  )
}
