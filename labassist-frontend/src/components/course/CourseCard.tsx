import type { Course } from '../../types'
import type { CourseGroup } from '../../utils/courseGrouping'
import { cleanCourseTitle } from '../../utils/courseTitle'
import { Card } from '../ui/Card'
import { StatusBadge, Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface Props {
  group: CourseGroup
  onApply?: (group: CourseGroup) => void
  appliedSection?: Course
}

export function CourseCard({ group, onApply, appliedSection }: Props) {
  const allFull = group.totalSlots > 0 && group.totalAccepted >= group.totalSlots

  const deadline = group.deadline
    ? new Date(group.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : null

  function handleApply() {
    onApply?.(group)
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: 'var(--primary)', background: 'var(--primary-50)',
            padding: '2px 10px', borderRadius: 'var(--radius-pill)',
          }}>
            {group.code}
          </span>
          {group.sections.length > 1 ? (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--ink-500)', background: 'var(--bg)',
              padding: '2px 9px', borderRadius: 'var(--radius-pill)',
            }}>
              {group.sections.length} Sec ให้เลือก
            </span>
          ) : !!group.sections[0]?.section && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--ink-500)', background: 'var(--bg)',
              padding: '2px 9px', borderRadius: 'var(--radius-pill)',
            }}>
              Sec {group.sections[0].section}
            </span>
          )}
        </div>
        <StatusBadge value={group.status} />
      </div>

      {/* Title */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.4, marginBottom: group.english_title ? 2 : 8 }}>
          {cleanCourseTitle(group.title)}
        </h3>
        {group.english_title && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', textTransform: 'uppercase', marginBottom: 8 }}>
            {group.english_title}
          </div>
        )}

        {/* Instructor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--ink-500)', marginBottom: 4 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {group.instructor_name}
        </div>

        {/* Schedule(s) */}
        {group.sections.length === 1 && group.sections[0].schedule && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--ink-500)', marginBottom: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {group.sections[0].schedule}
          </div>
        )}
        {group.sections.length > 1 && (
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.sections.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 5 }}>
                <span style={{ fontWeight: 600 }}>Sec {s.section}</span>
                {s.schedule && <span>· {s.schedule}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Deadline */}
        {deadline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--ink-400)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ปิดรับ {deadline}
          </div>
        )}
      </div>

      {/* Slot info */}
      <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', gap: 10 }}>
        {group.totalSlots > 0 && (
          <SlotBar label="Lab Boy" filled={group.totalAccepted} total={group.totalSlots} />
        )}
      </div>

      {/* Footer actions */}
      <div style={{ paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
        {group.status === 'closed' || group.status === 'draft' ? (
          <Badge variant="gray">ปิดรับ</Badge>
        ) : appliedSection ? (
          <Badge variant="green">สมัครแล้ว{appliedSection.section ? ` (Sec ${appliedSection.section})` : ''}</Badge>
        ) : allFull ? (
          <Button size="sm" variant="outline" disabled style={{ cursor: 'not-allowed' }}>เต็มแล้ว</Button>
        ) : (
          <Button size="sm" onClick={handleApply}>สมัคร Lab Boy</Button>
        )}
      </div>
    </Card>
  )
}

function SlotBar({ label, filled, total }: { label: string; filled: number; total: number }) {
  const pct = Math.min((filled / total) * 100, 100)
  const full = filled >= total
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: full ? 'var(--red)' : 'var(--ink-400)' }}>{filled}/{total}</span>
      <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: full ? 'var(--red)' : 'var(--green)', borderRadius: 4 }} />
      </div>
    </div>
  )
}
