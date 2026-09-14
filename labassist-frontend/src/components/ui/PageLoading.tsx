import { Skeleton, SkeletonCard } from './Skeleton'

export function PageLoading() {
  return (
    <div role="status" aria-label="กำลังโหลดหน้า" style={{ padding: 24, minHeight: 320 }}>
      <p style={{ color: 'var(--ink-500)', marginBottom: 16 }}>กำลังโหลดหน้า…</p>
      <Skeleton width="40%" height={28} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 24 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
