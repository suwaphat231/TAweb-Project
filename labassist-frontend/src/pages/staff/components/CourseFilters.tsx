import type { CourseDocStatus } from '../../../types'

export interface FilterState {
  search: string
  semester: string
  academicYear: string
  docStatus: CourseDocStatus | ''
  instructor: string
}

interface Props {
  filters: FilterState
  instructors: string[]
  semesters: string[]
  academicYears: string[]
  onChange: (f: FilterState) => void
}

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  border: '1.5px solid var(--line)',
  borderRadius: 'var(--radius-input)',
  fontSize: 13,
  color: 'var(--ink-900)',
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
}

export function CourseFilters({ filters, instructors, semesters, academicYears, onChange }: Props) {
  const statusOpts: { value: CourseDocStatus | ''; label: string }[] = [
    { value: '',            label: 'ทุกสถานะ' },
    { value: 'waiting',     label: 'รอจัดทำเอกสาร' },
    { value: 'in_progress', label: 'กำลังดำเนินการ' },
    { value: 'completed',   label: 'เสร็จสิ้นแล้ว' },
  ]

  return (
    <div style={{
      background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
      padding: '12px 16px', marginBottom: 16,
      display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <input
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="ค้นหารหัสวิชา / ชื่อวิชา / อาจารย์..."
        style={{ ...inputStyle, width: 260, cursor: 'text' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        aria-label="ค้นหารายวิชา"
      />

      <select
        value={filters.instructor}
        onChange={(e) => onChange({ ...filters, instructor: e.target.value })}
        style={inputStyle}
        aria-label="กรองตามอาจารย์"
      >
        <option value="">อาจารย์ทั้งหมด</option>
        {instructors.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>

      <select
        value={filters.semester}
        onChange={(e) => onChange({ ...filters, semester: e.target.value })}
        style={inputStyle}
        aria-label="กรองตามภาคเรียน"
      >
        <option value="">ภาคเรียนทั้งหมด</option>
        {semesters.map((s) => <option key={s} value={s}>ภาคเรียนที่ {s}</option>)}
      </select>

      <select
        value={filters.academicYear}
        onChange={(e) => onChange({ ...filters, academicYear: e.target.value })}
        style={inputStyle}
        aria-label="กรองตามปีการศึกษา"
      >
        <option value="">ปีการศึกษาทั้งหมด</option>
        {academicYears.map((y) => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
      </select>

      <select
        value={filters.docStatus}
        onChange={(e) => onChange({ ...filters, docStatus: e.target.value as CourseDocStatus | '' })}
        style={inputStyle}
        aria-label="กรองตามสถานะงานเอกสาร"
      >
        {statusOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {(filters.search || filters.instructor || filters.semester || filters.academicYear || filters.docStatus) && (
        <button
          onClick={() => onChange({ search: '', semester: '', academicYear: '', docStatus: '', instructor: '' })}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-btn)',
            background: 'none', border: '1px solid var(--line)', cursor: 'pointer',
            color: 'var(--ink-500)', fontWeight: 500,
          }}
          aria-label="ล้างตัวกรองทั้งหมด"
        >
          ล้างตัวกรอง
        </button>
      )}
    </div>
  )
}
