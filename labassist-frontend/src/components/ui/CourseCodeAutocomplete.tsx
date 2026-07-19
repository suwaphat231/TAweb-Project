import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { courseApi } from '../../services/api'
import { Input } from './Input'

interface Suggestion {
  code: string
  title: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSelect: (course: Suggestion) => void
  disabled?: boolean
}

export function CourseCodeAutocomplete({ value, onChange, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: catalog = [] } = useQuery({
    queryKey: ['course-catalog'],
    queryFn: courseApi.list,
    staleTime: 5 * 60 * 1000,
  })

  const q = value.trim().toLowerCase()
  const suggestions: Suggestion[] = []
  if (q) {
    const seen = new Set<string>()
    for (const c of catalog) {
      if (seen.has(c.code)) continue
      if (!c.code.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q)) continue
      seen.add(c.code)
      suggestions.push({ code: c.code, title: c.title })
      if (suggestions.length >= 8) break
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <Input
        label="รหัสวิชา *"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="เช่น 520101 หรือ CS101"
        required
        readOnly={disabled}
        autoComplete="off"
        style={disabled ? { background: '#F8F9FB', cursor: 'not-allowed' } : undefined}
      />
      {open && !disabled && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1.5px solid var(--line)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20,
          maxHeight: 240, overflowY: 'auto',
        }}>
          {suggestions.map((c) => (
            <div
              key={c.code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(c); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{c.code}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-900)' }}>{c.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
