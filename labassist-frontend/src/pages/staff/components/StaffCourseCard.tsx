import type { CourseOffering, CourseDocStatus } from '../../../types'

const STATUS_BADGE: Record<CourseDocStatus, string> = {
  waiting:     'badge badge-amber',
  in_progress: 'badge badge-primary',
  completed:   'badge badge-green',
}
const STATUS_LABEL: Record<CourseDocStatus, string> = {
  waiting:     'รอจัดทำเอกสาร',
  in_progress: 'กำลังดำเนินการ',
  completed:   'เสร็จสิ้นแล้ว',
}

interface Props {
  offering: CourseOffering
  onAction: (offering: CourseOffering) => void
}

function PersonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

export function StaffCourseCard({ offering, onAction }: Props) {
  const progress = offering.totalDocs > 0 ? (offering.completedDocs / offering.totalDocs) * 100 : 0
  const progressColor = {
    waiting:     'var(--amber)',
    in_progress: 'var(--primary)',
    completed:   'var(--green)',
  }[offering.docStatus]

  const actionLabel = offering.docStatus === 'waiting' ? 'เริ่มดำเนินการ'
    : offering.docStatus === 'in_progress' ? 'ดำเนินการ'
    : 'ดูรายละเอียด'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${offering.courseCode} ${offering.courseTitle} กลุ่ม ${offering.sectionNo} — ${STATUS_LABEL[offering.docStatus]}`}
      onClick={() => onAction(offering)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAction(offering) } }}
      style={{
        background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12,
        cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(42,34,98,0.10)'
        e.currentTarget.style.borderColor = 'var(--primary-100)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'var(--line)'
      }}
      onFocus={(e) => { e.currentTarget.style.outline = '2px solid var(--primary)'; e.currentTarget.style.outlineOffset = '2px' }}
      onBlur={(e) => { e.currentTarget.style.outline = 'none' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
              {offering.courseCode}
            </span>
            <span className="badge badge-primary">กลุ่ม {offering.sectionNo}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 4, lineHeight: 1.5 }}>
            {offering.courseTitle}
          </div>
        </div>
        <span className={STATUS_BADGE[offering.docStatus]}>{STATUS_LABEL[offering.docStatus]}</span>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: 'var(--ink-500)' }}>
        <span>ภาค {offering.semester} / {offering.academicYear}</span>
        {offering.schedule && <span>{offering.schedule}</span>}
        {offering.room && <span>ห้อง {offering.room}</span>}
      </div>

      {/* Instructors */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {offering.instructors.map((ins, idx) => (
          <span key={idx} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, padding: '2px 10px', borderRadius: 'var(--radius-pill)',
            background: ins.isMain ? '#EAF3F9' : 'var(--line-soft)',
            color: ins.isMain ? 'var(--blue)' : 'var(--ink-600)',
            fontWeight: ins.isMain ? 600 : 400,
            border: `1px solid ${ins.isMain ? '#BFDBF5' : 'var(--line)'}`,
          }}>
            <span style={{ color: ins.isMain ? 'var(--blue)' : 'var(--ink-400)' }}><PersonIcon /></span>
            {ins.name}
            {ins.isMain && <span style={{ fontSize: 10, opacity: 0.7 }}>(หลัก)</span>}
          </span>
        ))}
      </div>

      {/* Lab Boy count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Lab Boy ที่ยืนยันแล้ว:</span>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
          color: offering.labboyAccepted > 0 ? 'var(--green)' : 'var(--ink-400)',
          background: offering.labboyAccepted > 0 ? 'var(--green-bg)' : 'var(--line-soft)',
        }}>
          {offering.labboyAccepted} / {offering.labboySlots} คน
        </span>
      </div>

      {/* Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>ความคืบหน้าเอกสาร</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>
            {offering.completedDocs}/{offering.totalDocs}
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999, background: progressColor,
            width: `${progress}%`, transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {/* Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onAction(offering) }}
          aria-label={`${actionLabel} — ${offering.courseCode} กลุ่ม ${offering.sectionNo}`}
          className={offering.docStatus === 'completed' ? 'btn btn-outline' : 'btn btn-primary'}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
