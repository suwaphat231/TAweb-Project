import { Select } from '../../../components/ui/Select'

const DAY_OPTIONS = [
  { value: '', label: '— วัน —' },
  { value: 'MON', label: 'วันจันทร์' },
  { value: 'TUE', label: 'วันอังคาร' },
  { value: 'WED', label: 'วันพุธ' },
  { value: 'THU', label: 'วันพฤหัสบดี' },
  { value: 'FRI', label: 'วันศุกร์' },
  { value: 'SAT', label: 'วันเสาร์' },
  { value: 'SUN', label: 'วันอาทิตย์' },
]

// University hours: 07:00 – 21:00
const HOURS = Array.from({ length: 15 }, (_, i) => String(i + 7).padStart(2, '0'))
// Minutes in 5-minute increments
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius-input, 8px)',
  fontSize: 13,
  color: 'var(--ink-900)',
  background: '#fff',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  textAlign: 'center',
}

interface TimeSelectProps {
  label?: string
  value: string   // "HH:MM" or ""
  onChange: (v: string) => void
  disabled?: boolean
  'aria-label'?: string
}

function TimeSelect({ label, value, onChange, disabled, 'aria-label': ariaLabel }: TimeSelectProps) {
  const [hh, mm] = value ? value.split(':') : ['', '']

  function emit(newH: string, newM: string) {
    if (newH && newM) {
      onChange(`${newH}:${newM}`)
    } else {
      onChange('')
    }
  }

  return (
    <div>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} aria-label={ariaLabel}>
        <select
          value={hh || ''}
          onChange={(e) => emit(e.target.value, mm || '00')}
          disabled={disabled}
          aria-label={`${ariaLabel ?? label} ชั่วโมง`}
          style={{ ...selectStyle, width: 56 }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          <option value="">ชม.</option>
          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-400)', padding: '0 1px' }}>:</span>
        <select
          value={mm || ''}
          onChange={(e) => emit(hh || '', e.target.value)}
          disabled={disabled}
          aria-label={`${ariaLabel ?? label} นาที`}
          style={{ ...selectStyle, width: 56 }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          <option value="">นาที</option>
          {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
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
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {/* Day picker */}
        <div style={{ flex: '1 1 130px', minWidth: 130 }}>
          <Select
            label={index === 0 ? 'วัน' : undefined}
            value={slot.day}
            onChange={(e) => onChange(slot._id, 'day', e.target.value)}
            options={DAY_OPTIONS}
            disabled={disabled}
            aria-label={`วันที่ ${index + 1}`}
          />
        </div>

        {/* Start time */}
        <TimeSelect
          label={index === 0 ? 'เริ่ม' : undefined}
          value={slot.start_time}
          onChange={(v) => onChange(slot._id, 'start_time', v)}
          disabled={disabled}
          aria-label={`เวลาเริ่มที่ ${index + 1}`}
        />

        {/* Separator */}
        <div style={{
          alignSelf: index === 0 ? 'flex-end' : 'center',
          paddingBottom: index === 0 ? 8 : 0,
          fontSize: 13, color: 'var(--ink-300)', fontWeight: 500,
        }}>
          –
        </div>

        {/* End time */}
        <TimeSelect
          label={index === 0 ? 'สิ้นสุด' : undefined}
          value={slot.end_time}
          onChange={(v) => onChange(slot._id, 'end_time', v)}
          disabled={disabled}
          aria-label={`เวลาสิ้นสุดที่ ${index + 1}`}
        />

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(slot._id)}
          aria-label={`ลบช่วงเวลาที่ ${index + 1}${slot.day ? ` (${slot.day} ${slot.start_time}–${slot.end_time})` : ''}`}
          disabled={disabled}
          style={{
            background: 'none', border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: 'var(--red)', fontSize: 20,
            padding: '8px 4px', flexShrink: 0,
            opacity: disabled ? 0.4 : 1,
            lineHeight: 1,
            marginBottom: index === 0 ? 2 : 0,
            alignSelf: index === 0 ? 'flex-end' : 'center',
          }}
        >
          ×
        </button>
      </div>
      {error && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  )
}
