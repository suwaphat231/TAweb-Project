interface Props {
  src?: string
  size?: number
  style?: React.CSSProperties
}

// Shows the uploaded photo when there is one, otherwise a generic
// person silhouette — the same blank avatar for everyone.
export function Avatar({ src, size = 36, style }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--line)',
      color: 'var(--ink-400)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0, userSelect: 'none',
      ...style,
    }}>
      {src ? (
        <img src={src} alt="รูปโปรไฟล์" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="9.2" r="4.2" />
          <path d="M3.6 21.5c.9-4.4 4.3-7.1 8.4-7.1s7.5 2.7 8.4 7.1A11.9 11.9 0 0 1 12 24a11.9 11.9 0 0 1-8.4-2.5Z" />
        </svg>
      )}
    </div>
  )
}
