import type { CSSProperties } from 'react'
import { splitCourseCode } from '../../utils/myCourseGroups'

interface Props {
  code: string
  label?: string
  style?: CSSProperties
}

// Display-only: shows the curriculum suffixes of a course code as chips.
// The code itself is never modified or re-emitted here.
export function CurriculumChips({ code, label, style }: Props) {
  const { suffixes } = splitCourseCode(code)
  if (suffixes.length === 0) return null
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, ...style }}>
      {label && <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{label}</span>}
      {suffixes.map((s) => (
        <span key={s} style={{
          fontSize: 11, fontWeight: 700, color: 'var(--primary)',
          background: 'var(--primary-50)', borderRadius: 6, padding: '1px 7px',
        }}>
          {s}
        </span>
      ))}
    </span>
  )
}
