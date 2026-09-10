import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'success' | 'danger-ghost' | 'danger'
type Size = 'sm' | 'md'

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary:        { background: 'var(--primary)', color: '#fff', border: 'none' },
  outline:        { background: 'transparent', color: 'var(--ink-700)', border: '1px solid var(--line)' },
  ghost:          { background: 'transparent', color: 'var(--ink-700)', border: 'none' },
  success:        { background: 'var(--green)', color: '#fff', border: 'none' },
  'danger-ghost': { background: 'transparent', color: 'var(--red)', border: 'none' },
  danger:         { background: 'var(--red)', color: '#fff', border: 'none' },
}

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { padding: '5px 12px', fontSize: 13 },
  md: { padding: '9px 20px', fontSize: 14 },
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  children, variant = 'primary', size = 'md',
  loading, disabled, icon, style,
  onMouseDown, onMouseUp, onMouseLeave,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        fontWeight: 600,
        borderRadius: 'var(--radius-btn)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.65 : 1,
        transition: 'opacity .15s, transform .1s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        ...style,
      }}
      onMouseDown={(e) => {
        if (!disabled && !loading) e.currentTarget.style.transform = 'translateY(1px)'
        onMouseDown?.(e)
      }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; onMouseUp?.(e) }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; onMouseLeave?.(e) }}
      {...rest}
    >
      {loading ? (
        <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} className="animate-spin" />
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}
