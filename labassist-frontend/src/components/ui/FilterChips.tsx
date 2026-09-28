interface Props {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

export function FilterChips({ options, value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 16px',
            borderRadius: 'var(--radius-pill)',
            border: `1.5px solid ${value === o.value ? 'var(--primary)' : 'var(--line)'}`,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            background: value === o.value ? 'var(--primary)' : 'var(--bg-card)',
            color: value === o.value ? '#fff' : 'var(--ink-500)',
            transition: 'background .15s, color .15s, border-color .15s',
          }}
          onMouseEnter={(e) => { if (value !== o.value) { e.currentTarget.style.background = 'var(--primary-50)'; e.currentTarget.style.borderColor = 'var(--primary-100)'; e.currentTarget.style.color = 'var(--primary)' } }}
          onMouseLeave={(e) => { if (value !== o.value) { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-500)' } }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
