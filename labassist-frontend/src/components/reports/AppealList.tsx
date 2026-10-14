import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { reportsApi } from '../../services/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { FilterChips } from '../ui/FilterChips'
import { Skeleton } from '../ui/Skeleton'
import { formatDateTime, penaltyInfo } from './reportLabels'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: 'appeal_pending,appeal_more_info', label: 'รอพิจารณา' },
  { value: 'appeal_approved', label: 'อนุมัติแล้ว' },
  { value: 'appeal_rejected', label: 'ไม่อนุมัติ' },
  { value: '', label: 'ทั้งหมด' },
]

const HEADERS = ['ยื่นเมื่อ', 'นักศึกษา', 'รายวิชา', 'เหตุผลการอุทธรณ์', 'สถานะ']

// AppealList is the course instructor's queue of appeals against blacklists
// in the courses they teach. Evidence, the full timeline and the decision
// buttons are on the report page each row opens.
export function AppealList() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(STATUS_OPTIONS[0].value)
  const [page, setPage] = useState(1)
  const params = { status, page, limit: PAGE_SIZE }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['instructor-appeals', params],
    queryFn: () => reportsApi.appeals(params),
    placeholderData: keepPreviousData,
  })
  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div style={{ marginBottom: 16, background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '10px 14px' }}>
        <FilterChips options={STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'auto', border: '1.5px solid var(--line)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--line-soft)', borderBottom: '1.5px solid var(--line)' }}>
                {HEADERS.map((h) => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={HEADERS.length} style={{ padding: 24 }}><Skeleton lines={4} height={14} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={HEADERS.length} style={{ padding: '52px 24px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>ไม่มีคำอุทธรณ์ในสถานะนี้</td></tr>
              ) : rows.map((a, i) => (
                <tr key={a.id}
                  tabIndex={0}
                  onClick={() => navigate(`/reports/${a.report_id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/reports/${a.report_id}`) }}
                  style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 'none', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-50)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  <td style={{ padding: '13px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{formatDateTime(a.created_at)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{a.student_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{a.student_code || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>เคยถูก Blacklist {a.blacklist_count} ครั้ง</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{a.course_code}{a.course_section ? <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}> · Sec {a.course_section}</span> : null}</div>
                    <div style={{ color: 'var(--ink-500)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.course_title}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--ink-700)', maxWidth: 320 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.reason}</div>
                  </td>
                  <td style={{ padding: '13px 16px' }}><Badge variant={penaltyInfo[a.status].variant}>{penaltyInfo[a.status].label}</Badge></td>
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
