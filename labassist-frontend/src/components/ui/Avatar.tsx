export type AvatarColor = 'blue' | 'purple' | 'amber' | 'pink' | 'gray'

const gradients: Record<AvatarColor, string> = {
  blue:   'linear-gradient(135deg, var(--accent), var(--primary-700))',
  purple: 'var(--brand-gradient)',
  amber:  'linear-gradient(135deg, var(--primary), var(--primary-700))',
  pink:   'linear-gradient(135deg, var(--primary-700), var(--navy))',
  gray:   'linear-gradient(135deg, var(--accent), var(--navy))',
}

interface Props {
  initials: string
  src?: string
  color: AvatarColor
  size?: number
  style?: React.CSSProperties
}

export function Avatar({ initials, src, color, size = 36, style }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: gradients[color],
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, userSelect: 'none',
      ...style,
    }}>
      {src ? <img src={src} alt="รูปโปรไฟล์" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials.slice(0, 2).toUpperCase()}
    </div>
  )
}
