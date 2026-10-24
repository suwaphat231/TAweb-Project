import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi } from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../hooks/useToast'
import { formatSchedule } from '../../utils/schedule'
import type { CourseEditRequest } from '../../types'

function errorDetail(err: unknown, fallback: string): string {
  const detail = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
  return detail ?? fallback
}

// One field's before/after; unchanged fields are shown muted so the
// admin's eye lands on what the instructor actually changed.
function FieldDiff({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before.trim() !== after.trim()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--ink-400)', fontWeight: 600 }}>{label}</span>
      {changed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'pre-line' }}>
          <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{before || '—'}</span>
          <span style={{ color: 'var(--green, #166534)', fontWeight: 600 }}>{after || '—'}</span>
        </div>
      ) : (
        <span style={{ color: 'var(--ink-500)', whiteSpace: 'pre-line' }}>{after || '—'}</span>
      )}
    </div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  requests: CourseEditRequest[]
}

/** Pending course-detail changes from instructors, approved or rejected one by one. */
export function CourseEditRequestsModal({ isOpen, onClose, requests }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [rejecting, setRejecting] = useState<CourseEditRequest | null>(null)
  const [reason, setReason] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-course-edit-requests'] })
    qc.invalidateQueries({ queryKey: ['all-courses'] })
  }

  const approveMut = useMutation({
    mutationFn: (id: number) => adminApi.approveCourseEditRequest(id),
    onSuccess: (r) => {
      refresh()
      showToast(`อนุมัติการแก้ไขวิชา ${r.course_code ?? ''} แล้ว`, 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'อนุมัติไม่สำเร็จ'), 'error'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => adminApi.rejectCourseEditRequest(id, reason),
    onSuccess: () => {
      refresh()
      setRejecting(null)
      setReason('')
      showToast('ปฏิเสธคำขอแก้ไขแล้ว', 'success')
    },
    onError: (err) => showToast(errorDetail(err, 'ปฏิเสธไม่สำเร็จ'), 'error'),
  })

  return (
    <>
      <Modal isOpen={isOpen && !rejecting} onClose={onClose} title="คำขอแก้ไขรายละเอียดวิชาจากอาจารย์" size="lg">
        {requests.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--ink-500)', textAlign: 'center', padding: 24 }}>ไม่มีคำขอที่รออนุมัติ</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto' }}>
            {requests.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
                      <span style={{ color: 'var(--primary)' }}>{r.course_code}</span>
                      {r.course_section ? ` · กลุ่ม ${r.course_section}` : ''}
                      {r.course_semester ? ` · ภาค ${r.course_semester}/${r.course_academic_year}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                      ขอโดย {r.requester_name || '—'} · {new Date(r.created_at).toLocaleString('th-TH')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Button
                      size="sm" variant="ghost" style={{ color: 'var(--red)', border: '1px solid var(--line)' }}
                      onClick={() => setRejecting(r)}
                    >
                      ไม่อนุมัติ
                    </Button>
                    <Button
                      size="sm"
                      loading={approveMut.isPending && approveMut.variables === r.id}
                      onClick={() => approveMut.mutate(r.id)}
                    >
                      อนุมัติ
                    </Button>
                  </div>
                </div>
                <FieldDiff label="ชื่อวิชา (ไทย)" before={r.old_title} after={r.title} />
                <FieldDiff label="ชื่อวิชา (อังกฤษ)" before={r.old_english_title} after={r.english_title} />
                <FieldDiff label="หน่วยกิต" before={r.old_credits} after={r.credits} />
                <FieldDiff label="เวลาเรียน" before={formatSchedule(r.old_schedule)} after={formatSchedule(r.schedule)} />
                {r.note && (
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                    เหตุผลจากอาจารย์: {r.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title="ไม่อนุมัติคำขอแก้ไข" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (rejecting) rejectMut.mutate({ id: rejecting.id, reason })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
            วิชา {rejecting?.course_code} — เหตุผลจะแสดงให้อาจารย์เห็นในหน้าวิชาของฉัน
          </p>
          <Textarea label="เหตุผล" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>ยกเลิก</Button>
            <Button type="submit" loading={rejectMut.isPending} style={{ background: 'var(--red)' }}>ไม่อนุมัติ</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
