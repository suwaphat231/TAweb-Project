import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { displayCourseTitle } from '../../utils/courseDisplay'

interface Suggestion {
  code: string
  title: string
  semester: string
  academic_year: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSelect: (course: Suggestion) => void
  disabled?: boolean
}

export function CourseCodeAutocomplete({ value, onChange, onSelect, disabled }: Props) {
  const [inputValue, setInputValue] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['instructor-course-catalog'],
    queryFn: () => instructorApi.courseCatalog(),
    staleTime: 5 * 60 * 1000,
  })

  // Sync when parent resets the value (e.g. modal re-opens for edit)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const q = inputValue.trim().toLowerCase()
  const suggestions = catalog.filter((c) =>
    !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  )

  function handleSelect(c: { code: string; title: string; english_title?: string; semester: string; academic_year: number }) {
    const title = displayCourseTitle(c.title, c.english_title)
    setInputValue(c.code)
    onChange(c.code)
    onSelect({ code: c.code, title, semester: c.semester, academic_year: c.academic_year })
    setOpen(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    onChange(e.target.value)
    setOpen(true)
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  if (!disabled && !isLoading && catalog.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>รหัสวิชา *</label>
        <div style={{
          fontSize: 13, color: 'var(--ink-500)', padding: '9px 12px',
          border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-input)',
        }}>
          ไม่พบวิชาที่คุณสอนในระบบ — ให้แอดมินนำเข้ารายชื่อวิชาก่อน
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>รหัสวิชา *</label>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; setOpen(true) }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}
        placeholder={isLoading ? 'กำลังโหลด...' : 'พิมพ์รหัสวิชา เช่น 517, 520...'}
        disabled={disabled}
        required
        autoComplete="off"
        style={{
          padding: '9px 12px',
          border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius-input)',
          fontSize: 14,
          color: 'var(--ink-900)',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          background: disabled ? 'var(--bg)' : '#fff',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
        }}
      />

      {open && !disabled && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0,
          right: 0,
          zIndex: 200,
          background: '#fff',
          border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.10)',
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {suggestions.slice(0, 20).map((c, i) => (
            <button
              key={c.code}
              type="button"
              onMouseDown={() => handleSelect(c)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 14px',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--line-soft)' : 'none',
                background: 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{c.code}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-600)', marginLeft: 8 }}>
                {displayCourseTitle(c.title, c.english_title)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
