import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: number | string
}

export function Card({ children, padding = 24, style, ...rest }: Props) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-md)',
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
