import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: number | string
}

export function Card({ children, padding, style, ...rest }: CardProps) {
  return (
    <div
      style={{ background: '#fff', borderRadius: 'var(--radius-card)', border: '1px solid var(--line)', boxShadow: 'none', padding, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function CardHeader({ children, style, ...rest }: CardHeaderProps) {
  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--line)', ...style }} {...rest}>
      {children}
    </div>
  )
}

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tight?: boolean
}

export function CardBody({ children, tight, style, ...rest }: CardBodyProps) {
  return (
    <div style={{ padding: tight ? 0 : 24, ...style }} {...rest}>
      {children}
    </div>
  )
}
