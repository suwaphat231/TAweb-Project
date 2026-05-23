interface Props {
  width?: string | number
  height?: string | number
  radius?: string | number
  count?: number
  gap?: number
}

function SkeletonLine({ width = '100%', height = 16, radius = 8 }: Omit<Props, 'count' | 'gap'>) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--line-soft) 25%, var(--line) 50%, var(--line-soft) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}

export function Skeleton({ count = 1, gap = 10, ...props }: Props) {
  return (
    <>
      <style>{`@keyframes shimmer { to { background-position: -200% 0; } }`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {Array.from({ length: count }).map((_, i) => <SkeletonLine key={i} {...props} />)}
      </div>
    </>
  )
}

export function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', padding: 24, boxShadow: 'var(--shadow-md)' }}>
      <Skeleton height={20} width="60%" />
      <div style={{ marginTop: 12 }}><Skeleton count={3} gap={8} height={14} /></div>
    </div>
  )
}
