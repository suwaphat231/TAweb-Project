import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { groupSectionsByTime, timeOptionSecLabel } from '../../utils/courseGrouping'

interface Props {
  code: string
  semester: string
  academicYear: number
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

// Each option is one meeting time — a section that meets on several days is
// imported as one row per day, and secs that meet at the same time share one
// option, so the instructor opens each time separately.
// Sec number + schedule always come from the admin's Excel import, never
// typed in by the instructor (a free-text field was too easy to fat-finger
// against the real timetable) — this is the only place they get picked from.
export function SectionCatalogPicker({ code, semester, academicYear, selectedIds, onChange }: Props) {
  const enabled = !!code && !!semester && !!academicYear

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['course-catalog-sections', code, semester, academicYear],
    queryFn: () => instructorApi.courseCatalogSections({ code, semester, academic_year: academicYear }),
    enabled,
  })

  // One checkbox per time; secs meeting at the same time are opened together.
  function toggle(ids: number[], on: boolean) {
    const rest = selectedIds.filter((x) => !ids.includes(x))
    onChange(on ? [...rest, ...ids] : rest)
  }

  if (!enabled) return null

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
        เลือกช่วงเวลาที่จะเปิดรับสมัคร {' '}
        <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}></span>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>กำลังโหลด...</div>
      ) : sections.length === 0 ? (
        <div style={{
          fontSize: 13, color: 'var(--ink-500)', padding: '9px 12px',
          border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-input)',
        }}>
          ไม่พบ section ของวิชานี้ในภาค/ปีที่เลือก — ให้แอดมินนำเข้ารายชื่อวิชาก่อน
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groupSectionsByTime(sections).map((opt) => {
            const draftIds = opt.sections.filter((s) => s.status === 'draft').map((s) => s.id)
            const alreadyOpen = draftIds.length === 0
            const isSelected = draftIds.length > 0 && draftIds.every((id) => selectedIds.includes(id))
            const secLabel = timeOptionSecLabel(opt)
            return (
              <label
                key={opt.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                  background: isSelected ? 'var(--primary-50)' : alreadyOpen ? '#F5F5F5' : '#fff',
                  cursor: alreadyOpen ? 'not-allowed' : 'pointer',
                  opacity: alreadyOpen ? 0.6 : 1,
                }}
              >
                <input type="checkbox" checked={isSelected} disabled={alreadyOpen} onChange={() => toggle(draftIds, !isSelected)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'pre-line' }}>
                    {opt.schedule || secLabel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                 
                    {alreadyOpen && <span style={{ marginLeft: opt.schedule && secLabel ? 6 : 0 }}>เปิดรับสมัครแล้ว</span>}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
