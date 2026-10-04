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

const hasFilter = (f: FilterState) =>
  !!(f.search || f.instructor || f.semester || f.academicYear || f.docStatus)

export function CourseFilters({ filters, instructors, semesters, academicYears, onChange }: Props) {
  const statusOpts: { value: CourseDocStatus | ''; label: string }[] = [
    { value: '',            label: 'ทุกสถานะ' },
    { value: 'waiting',     label: 'รอจัดทำเอกสาร' },
    { value: 'in_progress', label: 'กำลังดำเนินการ' },
    { value: 'completed',   label: 'เสร็จสิ้นแล้ว' },
  ]

  return (
    <div className="card card-pad-sm" style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="ค้นหารหัสวิชา / ชื่อวิชา / อาจารย์..."
        className="form-input"
        style={{ flex: '1 1 220px', minWidth: 0 }}
        aria-label="ค้นหารายวิชา"
      />

      <select
        value={filters.instructor}
        onChange={(e) => onChange({ ...filters, instructor: e.target.value })}
        className="form-input"
        aria-label="กรองตามอาจารย์"
      >
        <option value="">อาจารย์ทั้งหมด</option>
        {instructors.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>

      <select
        value={filters.semester}
        onChange={(e) => onChange({ ...filters, semester: e.target.value })}
        className="form-input"
        aria-label="กรองตามภาคเรียน"
      >
        <option value="">ภาคเรียนทั้งหมด</option>
        {semesters.map((s) => <option key={s} value={s}>ภาคเรียนที่ {s}</option>)}
      </select>

      <select
        value={filters.academicYear}
        onChange={(e) => onChange({ ...filters, academicYear: e.target.value })}
        className="form-input"
        aria-label="กรองตามปีการศึกษา"
      >
        <option value="">ปีการศึกษาทั้งหมด</option>
        {academicYears.map((y) => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
      </select>

      <select
        value={filters.docStatus}
        onChange={(e) => onChange({ ...filters, docStatus: e.target.value as CourseDocStatus | '' })}
        className="form-input"
        aria-label="กรองตามสถานะงานเอกสาร"
      >
        {statusOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {hasFilter(filters) && (
        <button
          onClick={() => onChange({ search: '', semester: '', academicYear: '', docStatus: '', instructor: '' })}
          className="btn btn-ghost btn-sm"
          aria-label="ล้างตัวกรองทั้งหมด"
        >
          ล้างตัวกรอง
        </button>
      )}
    </div>
  )
}
