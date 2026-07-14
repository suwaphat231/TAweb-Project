export type AvatarColor = 'blue' | 'purple' | 'amber' | 'pink' | 'gray'

const gradients: Record<AvatarColor, string> = {
  blue:   'linear-gradient(135deg, #3B82F6, #1B4FD8)',
  purple: 'linear-gradient(135deg, #A78BFA, #7C3AED)',
  amber:  'linear-gradient(135deg, #FCD34D, #D97706)',
  pink:   'linear-gradient(135deg, #F9A8D4, #EC4899)',
  gray:   'linear-gradient(135deg, #CBD5E1, #94A3B8)',
}

interface Props {
  initials: string
  color: AvatarColor
  size?: number
  style?: React.CSSProperties
}

export function Avatar({ initials, color, size = 36, style }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: gradients[color],
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, userSelect: 'none',
      ...style,
    }}>
      {initials.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'
}
