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
  // Filter only while the user is typing; opening via click/arrow shows the
  // whole list like a normal dropdown, even when a code is already filled in.
  const [filtering, setFiltering] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
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

  const q = filtering ? inputValue.trim().toLowerCase() : ''
  const suggestions = catalog.filter((c) =>
    !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  )

  function handleSelect(c: { code: string; title: string; english_title?: string; semester: string; academic_year: number }) {
    const title = displayCourseTitle(c.title, c.english_title)
    setInputValue(c.code)
    onChange(c.code)
    onSelect({ code: c.code, title, semester: c.semester, academic_year: c.academic_year })
    setOpen(false)
    setFiltering(false)
    setActive(-1)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    onChange(e.target.value)
    setFiltering(true)
    setActive(-1)
    setOpen(true)
  }

  function openList() {
    if (disabled) return
    setFiltering(false)
    setActive(-1)
    setOpen(true)
  }

  function toggleList() {
    if (open) setOpen(false)
    else openList()
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { openList(); return }
      if (suggestions.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && open && active >= 0 && active < suggestions.length) {
      e.preventDefault()
      handleSelect(suggestions[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  // Keep the keyboard-highlighted option in view while arrowing through.
  useEffect(() => {
    if (active < 0) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

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
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={() => { if (!open) openList() }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; openList() }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}
          placeholder={isLoading ? 'กำลังโหลด...' : 'เลือกหรือพิมพ์รหัสวิชา เช่น 517, 520...'}
          disabled={disabled}
          required
          autoComplete="off"
          style={{
            padding: '9px 36px 9px 12px',
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
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="แสดงรายวิชาทั้งหมด"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleList}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-500)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
              style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {open && !disabled && suggestions.length > 0 && (
        <div ref={listRef} role="listbox" style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0,
          right: 0,
          zIndex: 200,
          background: '#fff',
          border: '1.5px solid var(--line)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.10)',
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {suggestions.map((c, i) => (
            <button
              key={`${c.code}-${c.semester}-${c.academic_year}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 14px',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--line-soft)' : 'none',
                background: i === active ? 'var(--bg)' : c.code === value ? 'var(--primary-50)' : 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={() => setActive(i)}
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
