import type { Course } from '../../types'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface Props {
  course: Course
  onApply?: (course: Course, role: 'ta' | 'labboy') => void
  applied?: { ta?: boolean; labboy?: boolean }
  showApply?: boolean
}

export function CourseCard({ course, onApply, applied = {}, showApply = false }: Props) {
  const daysLeft = course.deadline
    ? Math.ceil((new Date(course.deadline).getTime() - Date.now()) / 86400000)
    : null

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-50)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', marginRight: 6 }}>
            {course.code}
          </span>
          <Badge value={course.status} />
        </div>
        {daysLeft !== null && daysLeft >= 0 && (
          <span style={{ fontSize: 11, color: daysLeft <= 3 ? 'var(--red)' : 'var(--ink-400)', whiteSpace: 'nowrap' }}>
            {daysLeft === 0 ? 'ปิดวันนี้' : `${daysLeft} วัน`}
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 2 }}>{course.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          {course.instructor_name} · ภาค {course.semester}/{course.academic_year}
        </p>
      </div>

      {/* Description */}
      {course.description && (
        <p style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {course.description}
        </p>
      )}

      {/* Slots */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
        <SlotChip label="TA" filled={course.ta_accepted} total={course.ta_slots} />
        <SlotChip label="Lab Boy" filled={course.labboy_accepted} total={course.labboy_slots} />
      </div>

      {/* Apply buttons */}
      {showApply && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
          {course.ta_slots > 0 && (
            <Button
              size="sm"
              variant={applied.ta ? 'success' : 'outline'}
              disabled={applied.ta || course.status === 'closed'}
              onClick={() => onApply?.(course, 'ta')}
              style={{ flex: 1 }}
            >
              {applied.ta ? '✓ สมัคร TA แล้ว' : 'สมัคร TA'}
            </Button>
          )}
          {course.labboy_slots > 0 && (
            <Button
              size="sm"
              variant={applied.labboy ? 'success' : 'outline'}
              disabled={applied.labboy || course.status === 'closed'}
              onClick={() => onApply?.(course, 'labboy')}
              style={{ flex: 1 }}
            >
              {applied.labboy ? '✓ สมัคร Lab Boy แล้ว' : 'สมัคร Lab Boy'}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

function SlotChip({ label, filled, total }: { label: string; filled: number; total: number }) {
  if (total === 0) return null
  const pct = Math.min((filled / total) * 100, 100)
  return (
    <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: filled >= total ? 'var(--red)' : 'var(--ink-400)' }}>{filled}/{total}</span>
      <div style={{ width: 40, height: 4, background: 'var(--line)', borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--red)' : 'var(--green)', borderRadius: 4 }} />
      </div>
    </div>
  )
}
