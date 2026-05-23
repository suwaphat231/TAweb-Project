import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  width?: string | number
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  keyField?: keyof T
  emptyText?: string
}

export function Table<T extends Record<string, unknown>>({ columns, data, keyField, emptyText = 'ไม่มีข้อมูล' }: Props<T>) {
  return (
    <div style={{ overflow: 'auto', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap', width: col.width }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-400)', fontSize: 14 }}>
                {emptyText}
              </td>
            </tr>
          )}
          {data.map((row, i) => (
            <tr key={keyField ? String(row[keyField]) : i} style={{ borderBottom: i < data.length - 1 ? '1px solid var(--line-soft)' : 'none', transition: 'background .12s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '12px 16px', fontSize: 14, color: 'var(--ink-700)', verticalAlign: 'middle' }}>
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
