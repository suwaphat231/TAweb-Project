import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Select } from '../ui/Select'
import { displayCourseTitle } from '../../utils/courseDisplay'

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
  // Restricted to codes the classlist says this instructor teaches (matched
  // by name against the imported course data) — not the whole system catalog.
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['instructor-course-catalog'],
    queryFn: () => instructorApi.courseCatalog(),
    staleTime: 5 * 60 * 1000,
  })

  const options = catalog.map((c) => ({ value: c.code, label: c.code }))
  // When editing, the code being edited must render even if it's since
  // dropped out of the catalog, so the select doesn't silently blank it out.
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: value })
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value
    onChange(code)
    const course = catalog.find((c) => c.code === code)
    if (course) onSelect({ code: course.code, title: displayCourseTitle(course.title, course.english_title) })
  }

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
    <Select
      label="รหัสวิชา *"
      value={value}
      onChange={handleChange}
      disabled={disabled}
      required
      options={[{ value: '', label: isLoading ? 'กำลังโหลด...' : 'เลือกรหัสวิชา' }, ...options]}
    />
  )
}
