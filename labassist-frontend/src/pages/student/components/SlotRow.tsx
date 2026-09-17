import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'

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
        <div style={{ flex: '0 0 110px' }}>
          <Input
            label={index === 0 ? 'เริ่ม' : undefined}
            type="time"
            value={slot.start_time}
            onChange={(e) => onChange(slot._id, 'start_time', e.target.value)}
            disabled={disabled}
            aria-label={`เวลาเริ่มที่ ${index + 1}`}
          />
        </div>
        <div style={{ flex: '0 0 110px' }}>
          <Input
            label={index === 0 ? 'สิ้นสุด' : undefined}
            type="time"
            value={slot.end_time}
            onChange={(e) => onChange(slot._id, 'end_time', e.target.value)}
            disabled={disabled}
            aria-label={`เวลาสิ้นสุดที่ ${index + 1}`}
          />
        </div>
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
