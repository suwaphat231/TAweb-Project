import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { invalidateBlacklistQueries, useBlacklistRevoke } from '../../hooks/useBlacklistRevoke'
import type { Application, BlacklistEntry } from '../../types'

type ApiError = { response?: { data?: { error?: string } } }

export function BlacklistTag({ count }: { count: number }) {
  return (
    <span
      title="นักศึกษาคนนี้ถูก blacklist — ดูรายละเอียดเพื่ออ่านเหตุผล"
      style={{
        fontSize: 11, fontWeight: 700, color: '#B91C1C',
        background: '#FEE2E2', border: '1px solid #FECACA',
        borderRadius: 99, padding: '1px 8px', whiteSpace: 'nowrap',
      }}
    >
      ⚠ Blacklist{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}

export function BlacklistEntryRow({
  entry, canRevoke, revoking, onRevoke,
}: {
  entry: BlacklistEntry
  canRevoke: boolean
  revoking: boolean
  onRevoke: () => void
}) {
  return (
    <div style={{ borderLeft: '3px solid #FCA5A5', paddingLeft: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: 'var(--ink-800)' }}>{entry.reported_by_name || '—'}</span>
        {entry.course_code && <span>· วิชา {entry.course_code}{entry.course_semester ? ` (${entry.course_semester}/${entry.course_academic_year})` : ''}</span>}
        <span>· {new Date(entry.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
        {canRevoke && (
          <button
            onClick={onRevoke}
            disabled={revoking}
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-500)', background: 'none', border: 'none', cursor: revoking ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}
          >
            ยกเลิก
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-800)', lineHeight: 1.6, marginTop: 2, whiteSpace: 'pre-wrap' }}>{entry.reason}</div>
    </div>
  )
}

// The blacklist part of a student detail modal: the student's existing
// entries, plus the form to file a new one against this application. Pass the
// live application from the query cache so changes show without reopening;
// remount it (key={app.id}) when switching students to reset the form.
export function BlacklistSection({ app }: { app: Application }) {
  const [reason, setReason] = useState<string | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuth()
  const revoke = useBlacklistRevoke()

  const addMut = useMutation({
    mutationFn: (text: string) => instructorApi.addBlacklist({ application_id: app.id, reason: text }),
    onSuccess: () => {
      invalidateBlacklistQueries(qc)
      setReason(null)
      showToast('บันทึก blacklist แล้ว — อาจารย์ทุกคนจะเห็นเมื่อนักศึกษาคนนี้สมัคร', 'success')
    },
    onError: (err: ApiError) => showToast(err?.response?.data?.error ?? 'ไม่สามารถบันทึก blacklist ได้', 'error'),
  })

  const entries = app.blacklists ?? []
  const alreadyFiled = entries.some((b) => b.application_id === app.id)
  const canFile = app.status === 'accepted' && !alreadyFiled && user?.role !== 'staff'

  return (
    <>
      {entries.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>⚠ นักศึกษาคนนี้ถูก blacklist {entries.length} ครั้ง</div>
          {entries.map((b) => (
            <BlacklistEntryRow
              key={b.id}
              entry={b}
              canRevoke={revoke.canRevoke(b)}
              revoking={revoke.mut.isPending}
              onRevoke={() => revoke.mut.mutate(b.id)}
            />
          ))}
        </div>
      )}
      {canFile && reason === null && (
        <div>
          <button
            onClick={() => setReason('')}
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--red)', background: 'none',
              border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Blacklist นักศึกษาคนนี้
          </button>
        </div>
      )}
      {canFile && reason !== null && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>Blacklist นักศึกษาคนนี้</div>
          <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6 }}>
            นักศึกษายังสมัครวิชาอื่นได้ตามปกติ แต่อาจารย์ทุกคนจะเห็นเหตุผลนี้เมื่อพิจารณาใบสมัครของนักศึกษาคนนี้ (นักศึกษาจะไม่เห็น)
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล เช่น ไม่มาปฏิบัติงานโดยไม่แจ้งล่วงหน้า 3 ครั้ง"
            maxLength={1000}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setReason(null)}>ยกเลิก</Button>
            <Button
              style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              disabled={!reason.trim()}
              loading={addMut.isPending}
              onClick={() => addMut.mutate(reason.trim())}
            >
              ยืนยัน Blacklist
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
