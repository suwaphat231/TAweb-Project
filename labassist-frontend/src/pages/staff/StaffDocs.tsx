import { useQuery } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'

export default function StaffDocs() {
  const { data } = useQuery({ queryKey: ['staff-docs'], queryFn: staffApi.documents })

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>เอกสาร</h1>
      {!data?.length ? (
        <EmptyState title="ยังไม่มีเอกสาร" description="เอกสารจะปรากฏที่นี่" icon="📄" />
      ) : null}
    </div>
  )
}
