import { useId } from 'react'

const DAY_OPTIONS = [
  { value: '', label: '— เลือกวัน —' },
  { value: 'MON', label: 'วันจันทร์' },
  { value: 'TUE', label: 'วันอังคาร' },
  { value: 'WED', label: 'วันพุธ' },
  { value: 'THU', label: 'วันพฤหัสบดี' },
  { value: 'FRI', label: 'วันศุกร์' },
  { value: 'SAT', label: 'วันเสาร์' },
  { value: 'SUN', label: 'วันอาทิตย์' },
]

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/

// Formats keystrokes into HH:MM: "." becomes ":", and a colon is inserted
// automatically ("130" → "13:0", "930" → "9:30" since 93 is not an hour).
function maskTime(raw: string): string {
  const s = raw.replace(/\./g, ':').replace(/[^\d:]/g, '')
  const parts = s.split(':')
  if (parts.length > 1) return `${parts[0].slice(0, 2)}:${parts.slice(1).join('').slice(0, 2)}`
  const d = s.slice(0, 4)
  if (d.length <= 2) return d
  if (Number(d.slice(0, 2)) <= 23) return `${d.slice(0, 2)}:${d.slice(2)}`
  return `${d.slice(0, 1)}:${d.slice(1, 3)}`
}

// Completes a partial time on blur: "8" → "08:00", "8:3" → "08:30".
// Anything that still isn't a valid time is left as typed for validation to flag.
function normalizeTime(v: string): string {
  const m = /^(\d{1,2})(?::(\d{0,2}))?$/.exec(v)
  if (!m) return v
  const out = `${m[1].padStart(2, '0')}:${(m[2] ?? '').padEnd(2, '0')}`
  return TIME_RE.test(out) ? out : v
}

function durationLabel(start: string, end: string): string | null {
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const diff = toMin(end) - toMin(start)
  if (diff <= 0) return null
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return [h && `${h} ชม.`, m && `${m} นาที`].filter(Boolean).join(' ')
}

interface TimeInputProps {
  label: string
  value: string   // "HH:MM" or ""
  onChange: (v: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

function TimeInput({ label, value, onChange, disabled, invalid, describedBy }: TimeInputProps) {
  const id = useId()
  return (
    <div className="slot-field slot-field-time">
      <label htmlFor={id} className="slot-label">{label}</label>
      <input
        id={id}
        type="text"
        className="slot-control slot-time"
        value={value}
        onChange={(e) => onChange(maskTime(e.target.value))}
        onBlur={(e) => {
          const next = normalizeTime(e.target.value)
          if (next !== value) onChange(next)
        }}
        disabled={disabled}
        placeholder="00:00"
        maxLength={5}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    </div>
  )
}

export interface DraftSlot {
  _id: string
  day: string
  start_time: string
  end_time: string
}

interface Props {
  slot: DraftSlot
  index: number
  error?: string
  disabled?: boolean
  onChange: (id: string, field: 'day' | 'start_time' | 'end_time', value: string) => void
  onDelete: (id: string) => void
}

export function SlotRow({ slot, index, error, disabled, onChange, onDelete }: Props) {
  const dayId = useId()
  const errorId = useId()
  const duration = durationLabel(slot.start_time, slot.end_time)
  const dayLabel = DAY_OPTIONS.find((o) => o.value === slot.day && o.value)?.label

  return (
    <div className={`slot-row${error ? ' slot-row-error' : ''}`}>
      <div className="slot-head">
        <span className="slot-title">ช่วงที่ {index + 1}</span>
        {duration && <span className="slot-duration">{duration}</span>}
        <button
          type="button"
          className="slot-delete"
          onClick={() => onDelete(slot._id)}
          disabled={disabled}
          aria-label={`ลบช่วงที่ ${index + 1}${dayLabel ? ` (${dayLabel} ${slot.start_time}–${slot.end_time})` : ''}`}
          title="ลบช่วงเวลานี้"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      <div className="slot-fields">
        <div className="slot-field slot-field-day">
          <label htmlFor={dayId} className="slot-label">วัน</label>
          <select
            id={dayId}
            className="slot-control"
            value={slot.day}
            onChange={(e) => onChange(slot._id, 'day', e.target.value)}
            disabled={disabled}
            aria-invalid={(error && !slot.day) || undefined}
            aria-describedby={error ? errorId : undefined}
          >
            {DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="slot-times">
          <TimeInput
            label="เริ่ม"
            value={slot.start_time}
            onChange={(v) => onChange(slot._id, 'start_time', v)}
            disabled={disabled}
            invalid={!!error}
            describedBy={error ? errorId : undefined}
          />
          <span className="slot-sep" aria-hidden="true">–</span>
          <TimeInput
            label="สิ้นสุด"
            value={slot.end_time}
            onChange={(v) => onChange(slot._id, 'end_time', v)}
            disabled={disabled}
            invalid={!!error}
            describedBy={error ? errorId : undefined}
          />
        </div>
      </div>

      {error && (
        <div id={errorId} role="alert" className="slot-error">
          {error}
        </div>
      )}
    </div>
  )
}
