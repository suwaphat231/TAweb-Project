import { useQuery } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import { MakeupDaysPanel } from '../../../components/makeup/MakeupDaysPanel'
import { pendingCount } from '../../../components/makeup/makeupRules'

const caseMakeupDaysKey = (caseId: number) => ['case-makeup-days', caseId]

/**
 * Holiday clashes of one staff case, read-only: only the instructor picks a
 * makeup day (or none). Documents cannot be created while any clash is
 * pending. Hidden when there are no clashes.
 */
export function StaffMakeupSection({ caseId }: { caseId: number }) {
  const { data: days = [] } = useQuery({
    queryKey: caseMakeupDaysKey(caseId),
    queryFn: () => staffApi.caseMakeupDays(caseId),
  })
  if (days.length === 0) return null
  const pending = pendingCount(days)

  return (
    <section style={{
      marginBottom: 16, padding: '14px 16px', borderRadius: 10,
      border: `1px solid ${pending > 0 ? '#FDE68A' : 'var(--line)'}`,
      background: pending > 0 ? 'var(--amber-soft, #FFFBEB)' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>วันชดเชย</h3>
        <span style={{ fontSize: 13, color: pending > 0 ? 'var(--amber)' : 'var(--ink-500)' }}>
          {pending > 0
            ? `รออาจารย์เลือกวันชดเชย ${pending} วัน — สร้างเอกสารได้เมื่ออาจารย์กำหนดครบ`
            : `กำหนดครบทุกวันแล้ว (${days.length} วัน)`}
        </span>
      </div>
      <MakeupDaysPanel days={days} mode="staff" />
    </section>
  )
}
