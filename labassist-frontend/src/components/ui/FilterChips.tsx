interface Chip {
  value: string
  label: string
}

interface Props {
  chips: Chip[]
  value: string
  onChange: (v: string) => void
}

export function FilterChips({ chips, value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          style={{
            padding: '5px 16px',
            borderRadius: 'var(--radius-pill)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            background: value === c.value ? 'var(--primary)' : 'var(--line-soft)',
            color: value === c.value ? '#fff' : 'var(--ink-500)',
            transition: 'background .15s, color .15s',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
