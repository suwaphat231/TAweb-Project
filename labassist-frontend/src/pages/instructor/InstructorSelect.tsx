import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { instructorApi } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Table } from '../../components/ui/Table'
import type { Application } from '../../types'

export default function InstructorSelect() {
  const [params, setParams] = useSearchParams()
  const courseId = Number(params.get('course')) || 0
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [reviewTarget, setReviewTarget] = useState<Application | null>(null)
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const { data: courses = [] } = useQuery({ queryKey: ['instructor-courses'], queryFn: instructorApi.courses })
  const { data: applicants = [], isLoading } = useQuery({
    queryKey: ['applicants', courseId],
    queryFn: () => instructorApi.applicants(courseId),
    enabled: !!courseId,
  })

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'accepted' | 'rejected' }) =>
      instructorApi.review(id, { status, note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applicants', courseId] }); setReviewTarget(null); setNote('') },
  })

  const bulkMut = useMutation({
    mutationFn: (status: 'accepted' | 'rejected') =>
      instructorApi.bulkReview({ application_ids: selected, status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applicants', courseId] }); setSelected([]) },
  })

  const filtered = filter ? applicants.filter((a) => a.role_applied === filter) : applicants

  const columns = [
    {
      key: 'student', header: 'นักศึกษา',
      render: (row: Application) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={row.student_name} size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{row.student_name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{row.student_code}</div>
          </div>
        </div>
      ),
    },
    { key: 'gpa', header: 'GPA', render: (row: Application) => <span style={{ fontWeight: 600 }}>{row.student_gpa?.toFixed(2) ?? '—'}</span> },
    { key: 'role_applied', header: 'ตำแหน่ง', render: (row: Application) => <Badge value={row.role_applied} /> },
    { key: 'status', header: 'สถานะ', render: (row: Application) => <Badge value={row.status} /> },
    {
      key: 'actions', header: '',
      render: (row: Application) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant={row.status === 'accepted' ? 'success' : 'outline'}
            onClick={() => reviewMut.mutate({ id: row.id, status: 'accepted' })}
            style={{ borderColor: 'var(--green)', color: row.status === 'accepted' ? '#fff' : 'var(--green)' }}
          >รับ</Button>
          <Button size="sm" variant={row.status === 'rejected' ? 'danger' : 'outline'}
            onClick={() => { setReviewTarget(row); setNote('') }}
            style={{ borderColor: 'var(--red)', color: row.status === 'rejected' ? '#fff' : 'var(--red)' }}
          >ไม่รับ</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>คัดเลือกผู้สมัคร</h1>
        </div>
        <Select
          options={courses.map((c) => ({ value: String(c.id), label: `${c.code} ${c.title}` }))}
          value={String(courseId)}
          onChange={(e) => setParams({ course: e.target.value })}
          placeholder="เลือกวิชา..."
          style={{ width: 280 }}
        />
      </div>

      {!courseId ? (
        <EmptyState title="เลือกวิชา" description="กรุณาเลือกวิชาจาก dropdown ด้านบน" icon="👆" />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <FilterChips
              chips={[{value:'',label:'ทั้งหมด'},{value:'ta',label:'TA'},{value:'labboy',label:'Lab Boy'}]}
              value={filter} onChange={setFilter}
            />
            {selected.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-500)', alignSelf: 'center' }}>เลือก {selected.length} คน</span>
                <Button size="sm" variant="success" loading={bulkMut.isPending} onClick={() => bulkMut.mutate('accepted')}>รับทั้งหมด</Button>
                <Button size="sm" variant="danger" loading={bulkMut.isPending} onClick={() => bulkMut.mutate('rejected')}>ไม่รับทั้งหมด</Button>
              </div>
            )}
          </div>

          <Table columns={columns as never} data={filtered as never} keyField="id" emptyText="ยังไม่มีผู้สมัคร" />
        </>
      )}

      <Modal open={!!reviewTarget} onClose={() => setReviewTarget(null)} title="ยืนยันไม่รับ" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-700)' }}>
            ต้องการปฏิเสธ <strong>{reviewTarget?.student_name}</strong>?
          </p>
          <Textarea label="เหตุผล (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="เหตุผลที่ไม่รับ..." />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>ยกเลิก</Button>
            <Button variant="danger" loading={reviewMut.isPending} onClick={() => reviewTarget && reviewMut.mutate({ id: reviewTarget.id, status: 'rejected' })}>ยืนยันไม่รับ</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
