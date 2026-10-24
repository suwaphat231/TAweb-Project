import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FilterChips } from '../ui/FilterChips'
import { Skeleton } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { ReportStatusBadge } from './ReportStatusBadge'
import { categoryLabel, categoryOptions, formatDate } from './reportLabels'
import type { LabBoyReport, ReportListParams, ReportPage, ReportCategory } from '../../types'
import { DateInput } from '../ui/DateInput'

const PAGE_SIZE = 20

const controlStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
  fontSize: 13, color: 'var(--ink-900)', outline: 'none', background: '#fff',
}

interface Props {
  queryKey: string
  fetchPage: (params: ReportListParams) => Promise<ReportPage>
  /** Status chips; value may be a comma-separated list. */
  statusOptions: { value: string; label: string }[]
  courseOptions?: { value: number; label: string }[]
  showSearch?: boolean
  showReporter?: boolean
  showStudent?: boolean
  emptyText: string
  toolbarExtra?: ReactNode
}

// ReportList is the shared, server-paginated report table used by the
// instructor, reviewer and student pages. Filtering happens on the server so
// pages and totals stay correct.
export function ReportList({
  queryKey, fetchPage, statusOptions, courseOptions, showSearch = true,
  showReporter, showStudent = true, emptyText, toolbarExtra,
}: Props) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(statusOptions[0]?.value ?? '')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ReportCategory | ''>('')
  const [courseId, setCourseId] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const params: ReportListParams = {
    status, q: search.trim(), category, course_id: courseId, date_from: dateFrom, date_to: dateTo,
    page, limit: PAGE_SIZE,
  }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [queryKey, params],
    queryFn: () => fetchPage(params),
    placeholderData: keepPreviousData,
  })
  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Any filter change goes back to the first page.
  function withReset<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1) }
  }

  const headers = ['วันที่เกิดเหตุ', ...(showStudent ? ['นักศึกษา'] : []), 'รายวิชา', 'เหตุการณ์ที่รายงาน', ...(showReporter ? ['ผู้รายงาน'] : []), 'สถานะ', 'อัปเดตล่าสุด']

  return (
    <div>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap',
        background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '10px 14px',
      }}>
        {statusOptions.length > 1 && <FilterChips options={statusOptions} value={status} onChange={withReset(setStatus)} />}
        <div style={{ flex: 1 }} />
        {toolbarExtra}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {showSearch && (
          <input
            value={search}
            onChange={(e) => withReset(setSearch)(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสนักศึกษา..."
            aria-label="ค้นหานักศึกษา"
            style={{ ...controlStyle, width: 220 }}
          />
        )}
        <select aria-label="ประเภทเหตุการณ์" value={category} onChange={(e) => withReset(setCategory)(e.target.value as ReportCategory | '')} style={controlStyle}>
          <option value="">ทุกประเภทเหตุการณ์</option>
          {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {courseOptions && courseOptions.length > 0 && (
          <select aria-label="รายวิชา" value={courseId} onChange={(e) => withReset(setCourseId)(Number(e.target.value))} style={{ ...controlStyle, maxWidth: 260 }}>
            <option value={0}>ทุกรายวิชา</option>
            {courseOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <label style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
          ตั้งแต่ <DateInput value={dateFrom} onChange={(e) => withReset(setDateFrom)(e.target.value)} style={controlStyle} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
          ถึง <DateInput value={dateTo} onChange={(e) => withReset(setDateTo)(e.target.value)} style={controlStyle} />
        </label>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'auto', border: '1.5px solid var(--line)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--line-soft)', borderBottom: '1.5px solid var(--line)' }}>
                {headers.map((h) => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={headers.length} style={{ padding: 24 }}><Skeleton lines={4} height={14} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={headers.length} style={{ padding: '52px 24px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>{emptyText}</td></tr>
              ) : rows.map((r: LabBoyReport, i) => (
                <tr key={r.id}
                  tabIndex={0}
                  onClick={() => navigate(`/reports/${r.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/reports/${r.id}`) }}
                  style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 'none', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-50)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  <td style={{ padding: '13px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(r.incident_date)}</td>
                  {showStudent && (
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{r.student_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{r.student_code || '—'}</div>
                    </td>
                  )}
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{r.course_code}{r.course_section ? <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}> · Sec {r.course_section}</span> : null}</div>
                    <div style={{ color: 'var(--ink-500)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.course_title}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--ink-700)' }}>{categoryLabel[r.category]}</td>
                  {showReporter && <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--ink-700)' }}>{r.reporter_name}</td>}
                  <td style={{ padding: '13px 16px' }}>
                    <ReportStatusBadge status={r.status} />
                    {r.reconsideration_requested_at && r.status === 'CONFIRMED' && (
                      <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontWeight: 600 }}>มีคำขอทบทวน</div>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{formatDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: 'var(--ink-500)' }}>
          <span>ทั้งหมด {total} รายการ</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
            <span>หน้า {page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
          </div>
        </div>
      )}
    </div>
  )
}
