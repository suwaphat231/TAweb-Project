import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { FilterChips } from '../../components/ui/FilterChips'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { cleanCourseTitle } from '../../utils/courseTitle'
import { useToast } from '../../hooks/useToast'
import type { Application, ApplicationStatus } from '../../types'

const filterOptions = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'accepted', label: 'ผ่านการคัดเลือก' },
  { value: 'pending', label: 'รอพิจารณา' },
  { value: 'rejected', label: 'ไม่ผ่าน' },
  { value: 'withdrawn', label: 'ถอนแล้ว' },
]

export default function StudentStatus() {
  const [filter, setFilter] = useState('')
  const [pendingWithdraw, setPendingWithdraw] = useState<Application | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: apps = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const withdrawMut = useMutation({
    mutationFn: studentApi.withdraw,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      showToast(`ถอนใบสมัคร ${pendingWithdraw?.course_code ?? ''} เรียบร้อยแล้ว`, 'success')
      setPendingWithdraw(null)
    },
    onError: () => {
      showToast('ถอนใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง', 'error')
    },
  })

  const filtered = filter ? apps.filter((a) => a.status === filter as ApplicationStatus) : apps

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>ติดตามสถานะ</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>การสมัครทั้งหมดของคุณ</p>
      </div>

      <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      <div style={{ height: 20 }} />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState title="ไม่มีการสมัคร" description="ยังไม่มีการสมัครในหมวดนี้" icon="📭" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((app) => (
            <Card key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{app.course_code}</span>
                  <StatusBadge value={app.role_applied} />
                  <StatusBadge value={app.status} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>{cleanCourseTitle(app.course_title)}</div>
                {app.course_english_title && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', textTransform: 'uppercase', marginTop: 2 }}>
                    {app.course_english_title}
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
                  สมัคร {new Date(app.applied_at).toLocaleDateString('th-TH')}
                  {app.reviewed_at && ` · พิจารณา ${new Date(app.reviewed_at).toLocaleDateString('th-TH')}`}
                  {app.reviewed_by_name && ` โดย ${app.reviewed_by_name}`}
                </div>
                {app.note && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, fontStyle: 'italic' }}>"{app.note}"</div>}
              </div>
              {(app.status === 'accepted' || app.status === 'pending') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingWithdraw(app)}
                  style={{ color: 'var(--red)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}
                >
                  ถอนใบสมัคร
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!pendingWithdraw}
        onClose={() => !withdrawMut.isPending && setPendingWithdraw(null)}
        title="ยืนยันถอนใบสมัคร"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setPendingWithdraw(null)}
              disabled={withdrawMut.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              loading={withdrawMut.isPending}
              onClick={() => pendingWithdraw && withdrawMut.mutate(pendingWithdraw.id)}
            >
              ยืนยันถอน
            </Button>
          </>
        }
      >
        {pendingWithdraw && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--line-soft)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 2 }}>
                {pendingWithdraw.course_code}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>
                {cleanCourseTitle(pendingWithdraw.course_title)}
              </div>
              {pendingWithdraw.course_english_title && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', textTransform: 'uppercase', marginTop: 2 }}>
                  {pendingWithdraw.course_english_title}
                </div>
              )}
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-600)', margin: 0 }}>
              หากถอนใบสมัครแล้ว สถานะจะเปลี่ยนเป็น &quot;ถอนแล้ว&quot; และสามารถสมัครใหม่ได้หากวิชายังเปิดรับอยู่
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
