import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'

interface Props {
  code: string
  semester: string
  academicYear: number
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

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

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
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
          {sections.map((s) => {
            const alreadyOpen = s.status !== 'draft'
            const isSelected = selectedIds.includes(s.id)
            return (
              <label
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                  background: isSelected ? 'var(--primary-50)' : alreadyOpen ? '#F5F5F5' : '#fff',
                  cursor: alreadyOpen ? 'not-allowed' : 'pointer',
                  opacity: alreadyOpen ? 0.6 : 1,
                }}
              >
                <input type="checkbox" checked={isSelected} disabled={alreadyOpen} onChange={() => toggle(s.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
                   {/* Sec {s.section } */}
                    {alreadyOpen && (
                      <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--ink-400)' }}>
                        เปิดรับสมัครแล้ว
                      </span>
                    )}
                  </div>
                  {s.schedule && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>🕐 {s.schedule}</div>}
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
