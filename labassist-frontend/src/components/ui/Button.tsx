import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg'

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--primary)', color: '#fff', border: 'none' },
  outline:  { background: 'transparent', color: 'var(--primary)', border: '1.5px solid var(--primary)' },
  danger:   { background: 'var(--red)', color: '#fff', border: 'none' },
  ghost:    { background: 'transparent', color: 'var(--ink-700)', border: 'none' },
  success:  { background: 'var(--green)', color: '#fff', border: 'none' },
}
const sizeStyles: Record<Size, React.CSSProperties> = {
  sm:  { padding: '5px 12px',  fontSize: 13 },
  md:  { padding: '9px 20px',  fontSize: 14 },
  lg:  { padding: '12px 28px', fontSize: 16 },
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({ children, variant = 'primary', size = 'md', loading, disabled, icon, fullWidth, style, ...rest }: Props) {
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
        transition: 'opacity .15s, filter .15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
      {...rest}
    >
      {loading
        ? <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} className="animate-spin" />
        : icon}
      {children}
    </button>
  )
}
