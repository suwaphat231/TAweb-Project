import type { KeyboardEvent, ReactNode } from 'react'
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
  /** Names the table for screen readers (and for the keyboard-scrollable region). */
  label?: string
}

// Styles live in globals.css (.data-table) so hover/focus need no JS handlers.
export function Table<T extends Record<string, unknown>>({
  columns, data, onRowClick, loading, emptyText = 'ไม่มีข้อมูล', label = 'ตารางข้อมูล',
}: Props<T>) {
  function onKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  return (
    <div className="data-table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" style={{ textAlign: col.align ?? 'left', width: col.width }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key}><Skeleton height={14} /></td>
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
              className={onRowClick ? 'is-clickable' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={() => onRowClick?.(row)}
              onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align ?? 'left', width: col.width }}>
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
