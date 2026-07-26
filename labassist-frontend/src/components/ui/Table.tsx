import type { ReactNode } from 'react'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  align?: 'left' | 'center' | 'right'
  width?: number | string
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyText?: string
}

export function Table<T extends Record<string, unknown>>({
  columns, data, onRowClick, loading, emptyText = 'ไม่มีข้อมูล',
}: Props<T>) {
  return (
    <div style={{ overflow: 'auto', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: '11px 16px', textAlign: col.align ?? 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap', width: col.width }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '14px 16px' }}>
                  <Skeleton height={14} />
                </td>
              ))}
            </tr>
          ))}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyText} />
              </td>
            </tr>
          )}
          {!loading && data.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: i < data.length - 1 ? '1px solid var(--line-soft)' : 'none',
                transition: 'background .12s',
                cursor: onRowClick ? 'pointer' : undefined,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '12px 16px', fontSize: 14, color: 'var(--ink-700)', verticalAlign: 'middle', textAlign: col.align ?? 'left', width: col.width }}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
