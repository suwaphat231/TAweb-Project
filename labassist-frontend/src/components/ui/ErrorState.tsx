interface Props {
  title?: string
  description?: string
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  description = 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองอีกครั้ง',
  onRetry,
  compact = false,
}: Props) {
  const retryBtn = onRetry && (
    <button
      onClick={onRetry}
      style={{
        background: compact ? 'transparent' : 'var(--primary)',
        color: compact ? 'var(--primary)' : '#fff',
        border: compact ? '1px solid var(--line)' : 'none',
        borderRadius: 'var(--radius-btn)',
        padding: compact ? '5px 14px' : '9px 20px',
        fontSize: compact ? 13 : 14,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      ลองอีกครั้ง
    </button>
  )

  if (compact) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginBottom: onRetry ? 12 : 0 }}>
          {title}
        </p>
        {retryBtn}
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16, display: 'flex', justifyContent: 'center' }}>⚠️</div>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 14, color: 'var(--ink-400)', marginBottom: onRetry ? 20 : 0 }}>{description}</p>
      )}
      {retryBtn}
    </div>
  )
}
