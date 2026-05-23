import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { FilterChips } from '../../components/ui/FilterChips'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card } from '../../components/ui/Card'
import type { ApplicationStatus } from '../../types'

const chips = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'accepted', label: 'รับแล้ว' },
  { value: 'rejected', label: 'ไม่รับ' },
  { value: 'withdrawn', label: 'ถอนแล้ว' },
]

export default function StudentStatus() {
  const [filter, setFilter] = useState('')
  const qc = useQueryClient()

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const withdrawMut = useMutation({
    mutationFn: studentApi.withdraw,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-applications'] }),
  })

  const filtered = filter ? apps.filter((a) => a.status === filter as ApplicationStatus) : apps

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>ติดตามสถานะ</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>การสมัครทั้งหมดของคุณ</p>
      </div>

      <FilterChips chips={chips} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={88} radius={12} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="ไม่มีการสมัคร" description="ยังไม่มีการสมัครในหมวดนี้" icon="📭" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((app) => (
            <Card key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{app.course_code}</span>
                  <Badge value={app.role_applied} />
                  <Badge value={app.status} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>{app.course_title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
                  สมัคร {new Date(app.applied_at).toLocaleDateString('th-TH')}
                  {app.reviewed_at && ` · พิจารณา ${new Date(app.reviewed_at).toLocaleDateString('th-TH')}`}
                  {app.reviewed_by_name && ` โดย ${app.reviewed_by_name}`}
                </div>
                {app.note && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, fontStyle: 'italic' }}>"{app.note}"</div>}
              </div>
              {app.status === 'accepted' && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={withdrawMut.isPending && withdrawMut.variables === app.id}
                  onClick={() => { if (confirm('ยืนยันถอนใบสมัคร?')) withdrawMut.mutate(app.id) }}
                  style={{ color: 'var(--red)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}
                >
                  ถอนใบสมัคร
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
