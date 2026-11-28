import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage, reportsApi } from '../../services/api'
import { useToast } from '../../hooks/useToast'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { FilePicker } from './FilePicker'
import { categoryLabel, formatDate, formatDateTime } from './reportLabels'
import type { StudentRecord } from '../../types'

// StudentRecordList is the reported student's own view: records that took
// effect against them, with no hint of who filed them, and their one appeal.

function recordState(r: StudentRecord): { label: string; variant: BadgeVariant } {
  if (r.status === 'NOT_SUBSTANTIATED') return { label: 'อุทธรณ์สำเร็จ — ไม่มีผลแล้ว', variant: 'green' }
  if (r.status === 'WITHDRAWN') return { label: 'ถูกถอนแล้ว — ไม่มีผล', variant: 'gray' }
  if (r.appeal?.outcome === 'pending') return { label: 'อยู่ระหว่างพิจารณาอุทธรณ์', variant: 'amber' }
  if (r.appeal?.outcome === 'upheld') return { label: 'มีผล — คงผลเดิมหลังอุทธรณ์', variant: 'red' }
  return { label: 'มีผล', variant: 'red' }
}

export function StudentRecordList() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [target, setTarget] = useState<StudentRecord | null>(null)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-records'],
    queryFn: reportsApi.studentRecords,
  })

  const appealMut = useMutation({
    mutationFn: () => reportsApi.studentAppeal(target!.report_id, message.trim(), files),
    onSuccess: () => {
      showToast('ส่งคำอุทธรณ์แล้ว อาจารย์ผู้ยืนยันบันทึกจะพิจารณาและแจ้งผลให้ทราบ', 'success')
      setTarget(null)
      qc.invalidateQueries({ queryKey: ['student-records'] })
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ส่งคำอุทธรณ์ไม่สำเร็จ'), 'error'),
  })

  function openAppeal(r: StudentRecord) {
    setTarget(r)
    setMessage('')
    setFiles([])
  }

  if (isLoading) return <Skeleton lines={4} height={20} />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>บันทึกการปฏิบัติงานเกี่ยวกับฉัน</span>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4, lineHeight: 1.6 }}>
          บันทึกที่อาจารย์ยืนยันแล้วและมีผลกับคุณ อาจารย์รายวิชาอื่นจะเห็นบันทึกนี้ตอนพิจารณาใบสมัครจนจบปีการศึกษา (ไม่ตัดสิทธิ์การสมัคร)
          หากเห็นว่าไม่ถูกต้อง ยื่นอุทธรณ์ได้ 1 ครั้งต่อบันทึก ภายใน 7 วันหลังบันทึกมีผล ระบบไม่เปิดเผยว่าใครเป็นผู้รายงาน
        </p>
      </div>

      {data.length === 0 ? (
        <EmptyState title="ไม่มีบันทึกเกี่ยวกับคุณ" description="เมื่อมีบันทึกการปฏิบัติงานที่มีผลกับคุณ จะแสดงที่นี่พร้อมช่องทางอุทธรณ์" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.map((r) => {
            const state = recordState(r)
            return (
              <Card key={r.report_id} padding={20}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{categoryLabel[r.category]}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
                      {r.course_code}{r.course_section ? ` · Sec ${r.course_section}` : ''} {r.course_title}
                      {' · '}เกิดเหตุ {formatDate(r.incident_date)}
                      {r.confirmed_at && <> · มีผลเมื่อ {formatDate(r.confirmed_at)}</>}
                    </div>
                  </div>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </div>

                <div style={{ fontSize: 14, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 12 }}>{r.description}</div>

                {r.appeal && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>คำอุทธรณ์ของคุณ · {formatDateTime(r.appeal.submitted_at)}</div>
                      <div style={{ fontSize: 14, color: 'var(--ink-900)', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 4 }}>{r.appeal.message}</div>
                    </div>
                    {r.appeal.outcome !== 'pending' && (
                      <div style={{ borderLeft: '3px solid var(--primary)', background: 'var(--line-soft)', borderRadius: '0 10px 10px 0', padding: '10px 14px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
                          {r.appeal.outcome === 'overturned' ? 'รับอุทธรณ์ — บันทึกนี้ไม่มีผลแล้ว' : 'คงผลเดิม'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-500)', margin: '2px 0 6px' }}>พิจารณาเมื่อ {formatDateTime(r.appeal.decided_at)} · ผลนี้เป็นที่สุด</div>
                        {r.appeal.reason && <div style={{ fontSize: 14, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{r.appeal.reason}</div>}
                      </div>
                    )}
                  </div>
                )}

                {!r.appeal && r.status === 'CONFIRMED' && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: r.can_appeal ? 'var(--ink-600)' : 'var(--ink-400)' }}>
                      {r.can_appeal ? `ยื่นอุทธรณ์ได้ถึง ${formatDateTime(r.appeal_deadline)}` : 'พ้นกำหนดยื่นอุทธรณ์แล้ว'}
                    </span>
                    {r.can_appeal && <Button size="sm" variant="outline" onClick={() => openAppeal(r)}>ยื่นอุทธรณ์</Button>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        isOpen={!!target}
        onClose={() => !appealMut.isPending && setTarget(null)}
        title="ยื่นอุทธรณ์บันทึกการปฏิบัติงาน"
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setTarget(null)} disabled={appealMut.isPending}>ยกเลิก</Button>
          <Button loading={appealMut.isPending} disabled={!message.trim()} onClick={() => appealMut.mutate()}>ส่งคำอุทธรณ์</Button>
        </>}
      >
        {target && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--line-soft)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--ink-600)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{categoryLabel[target.category]}</div>
              {target.course_code} {target.course_title} · เกิดเหตุ {formatDate(target.incident_date)}
            </div>
            <Textarea
              label="เหตุผลที่อุทธรณ์ *"
              rows={5}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="อธิบายข้อเท็จจริงจากฝั่งคุณ เช่น วันนั้นลาป่วยและแจ้งอาจารย์แล้ว"
            />
            <FilePicker files={files} onChange={setFiles} label="แนบหลักฐาน (ถ้ามี)" />
            <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: 0, lineHeight: 1.6 }}>
              อุทธรณ์ได้เพียง 1 ครั้งต่อบันทึก ส่งแล้วแก้ไขไม่ได้ อาจารย์ผู้ยืนยันบันทึกจะพิจารณาและแจ้งผล ผลการพิจารณาเป็นที่สุด
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
