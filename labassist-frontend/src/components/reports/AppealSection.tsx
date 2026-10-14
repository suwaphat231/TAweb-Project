import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getApiErrorMessage, reportsApi } from '../../services/api'
import { useToast } from '../../hooks/useToast'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import { FilePicker } from './FilePicker'
import { Icon } from './ReportIcons'
import { appealEventLabel, daysLeft, formatDate, formatDateTime, penaltyInfo } from './reportLabels'
import type { AppealDecision, AppealView, ReportDetail, ReportEvidence } from '../../types'

const MAX_REASON = 1000
const MAX_TEXT = 2000

const decisionInfo: Record<AppealDecision, { label: string; variant: 'success' | 'danger' | 'outline'; prompt: string }> = {
  approve:      { label: 'อนุมัติและยกเลิก Blacklist', variant: 'success', prompt: 'Blacklist จะถูกยกเลิกทันที และจะไม่แสดงว่าเคยโดนรีพอร์ทจากรายงานนี้ ประวัติทั้งหมดยังถูกเก็บไว้' },
  reject:       { label: 'ไม่อนุมัติ',                 variant: 'danger',  prompt: 'Blacklist ยังมีผลตามเดิม นักศึกษายื่นอุทธรณ์ซ้ำไม่ได้' },
  request_info: { label: 'ขอข้อมูลเพิ่มเติม',           variant: 'outline', prompt: 'ระบุข้อมูลหรือหลักฐานที่ต้องการให้นักศึกษาส่งเพิ่ม' },
}

interface Props {
  detail: ReportDetail
  /** The reported student is viewing (not the course's instructor). */
  isSubject: boolean
  onChanged: () => void
  renderFiles: (files: ReportEvidence[]) => ReactNode
}

// AppealSection is where a blacklisting is shown and appealed: its status,
// reason and end date, the student's appeal form (once, within 15 days), the
// instructor's decision buttons, and every appeal step on record.
export function AppealSection({ detail, isSubject, onChanged, renderFiles }: Props) {
  const showToast = useToast()
  const r = detail.report
  const [appealOpen, setAppealOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [info, setInfo] = useState('')
  const [infoFiles, setInfoFiles] = useState<File[]>([])
  const [deciding, setDeciding] = useState<{ appealId: number; decision: AppealDecision } | null>(null)
  const [note, setNote] = useState('')

  const submitMut = useMutation({
    mutationFn: () => reportsApi.submitAppeal(r.id, reason.trim(), details.trim(), files),
    onSuccess: () => {
      showToast('ยื่นอุทธรณ์แล้ว — รอพิจารณาอุทธรณ์', 'success')
      setAppealOpen(false); setReason(''); setDetails(''); setFiles([])
      onChanged()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ยื่นอุทธรณ์ไม่สำเร็จ'), 'error'),
  })
  const infoMut = useMutation({
    mutationFn: (appealId: number) => reportsApi.addAppealInfo(appealId, info.trim(), infoFiles),
    onSuccess: () => {
      showToast('ส่งข้อมูลเพิ่มเติมแล้ว', 'success')
      setInfo(''); setInfoFiles([])
      onChanged()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ส่งข้อมูลไม่สำเร็จ'), 'error'),
  })
  const decideMut = useMutation({
    mutationFn: (d: { appealId: number; decision: AppealDecision }) => reportsApi.decideAppeal(d.appealId, d.decision, note.trim()),
    onSuccess: (_, d) => {
      showToast(`${decisionInfo[d.decision].label} เรียบร้อยแล้ว`, 'success')
      setDeciding(null); setNote('')
      onChanged()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'บันทึกผลไม่สำเร็จ'), 'error'),
  })

  if (!r.penalty_status) return null
  const penalty = penaltyInfo[r.penalty_status]
  const blacklistReason = [...detail.reviews].reverse().find((rv) => rv.decision === 'CONFIRM')?.reason
  const reasonValid = reason.trim().length > 0 && reason.trim().length <= MAX_REASON && details.trim().length <= MAX_TEXT
  const filesFor = (eventId: number) => detail.evidence.filter((e) => e.appeal_event_id === eventId)

  return (
    <Card padding={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', flex: 1 }}>สถานะ Blacklist และอุทธรณ์</h2>
        <Badge variant={penalty.variant}>{penalty.label}</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, paddingBottom: 14, borderBottom: '1px solid var(--line-soft)' }}>
        <Fact label="ถูก Blacklist เมื่อ" value={formatDate(r.blacklisted_at)} />
        <Fact label="สิ้นสุด Blacklist" value={r.blacklist_until ? formatDate(r.blacklist_until) : 'ไม่ระบุ'} />
        {detail.appeal_deadline && (
          <Fact
            label="ยื่นอุทธรณ์ได้ถึง"
            value={<>{formatDateTime(detail.appeal_deadline)}{r.penalty_status === 'blacklisted' && daysLeft(detail.appeal_deadline) > 0 && (
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}> (เหลือ {daysLeft(detail.appeal_deadline)} วัน)</span>
            )}</>}
          />
        )}
      </div>
      {blacklistReason && (
        <div style={{ marginTop: 14, fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.7 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', display: 'block', marginBottom: 2 }}>เหตุผลที่ถูก Blacklist</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{blacklistReason}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>รายละเอียดเหตุการณ์และหลักฐานอยู่ด้านบน</span>
        </div>
      )}
      <p style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 12, lineHeight: 1.6 }}>{penalty.hint}</p>

      {isSubject && detail.can_appeal && (
        <div style={{ marginTop: 12 }}>
          <Button icon={<Icon name="flag" size={14} />} onClick={() => setAppealOpen(true)}>ยื่นอุทธรณ์</Button>
        </div>
      )}
      {isSubject && !detail.can_appeal && detail.appeal_blocked_reason && r.penalty_status === 'blacklisted' && (
        <p role="note" style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-500)' }}>{detail.appeal_blocked_reason}</p>
      )}

      {detail.appeals.map((view) => (
        <AppealCard
          key={view.appeal.id}
          view={view}
          filesFor={filesFor}
          renderFiles={renderFiles}
          info={info}
          setInfo={setInfo}
          infoFiles={infoFiles}
          setInfoFiles={setInfoFiles}
          sendingInfo={infoMut.isPending}
          onSendInfo={() => infoMut.mutate(view.appeal.id)}
          onDecide={(decision) => { setNote(''); setDeciding({ appealId: view.appeal.id, decision }) }}
        />
      ))}

      <Modal isOpen={appealOpen} onClose={() => !submitMut.isPending && setAppealOpen(false)} title="ยื่นอุทธรณ์ Blacklist" size="md"
        footer={<>
          <Button variant="outline" onClick={() => setAppealOpen(false)} disabled={submitMut.isPending}>ยกเลิก</Button>
          <Button disabled={!reasonValid} loading={submitMut.isPending} onClick={() => submitMut.mutate()}>ยื่นอุทธรณ์</Button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6 }}>
            ยื่นได้ครั้งเดียวต่อการ Blacklist หนึ่งครั้ง หลังยื่นแล้วจะแก้ไขหรือยื่นซ้ำไม่ได้ จนกว่าอาจารย์ประจำวิชาจะพิจารณา
          </p>
          <Textarea label="เหตุผลการอุทธรณ์ *" rows={3} value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} />
          <Textarea label="รายละเอียดเพิ่มเติม" rows={4} value={details} maxLength={MAX_TEXT} onChange={(e) => setDetails(e.target.value)}
            hint={`${details.trim().length}/${MAX_TEXT}`} />
          <FilePicker files={files} onChange={setFiles} label="ไฟล์หลักฐานประกอบ" />
        </div>
      </Modal>

      <Modal isOpen={!!deciding} onClose={() => !decideMut.isPending && setDeciding(null)} title={deciding ? decisionInfo[deciding.decision].label : ''} size="md"
        footer={deciding && <>
          <Button variant="outline" onClick={() => setDeciding(null)} disabled={decideMut.isPending}>ยกเลิก</Button>
          <Button variant={deciding.decision === 'request_info' ? 'primary' : decisionInfo[deciding.decision].variant}
            disabled={!note.trim()} loading={decideMut.isPending} onClick={() => decideMut.mutate(deciding)}>ยืนยัน</Button>
        </>}
      >
        {deciding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6 }}>{decisionInfo[deciding.decision].prompt}</p>
            <Textarea label="หมายเหตุ *" rows={4} value={note} maxLength={MAX_REASON} onChange={(e) => setNote(e.target.value)}
              hint="บันทึกพร้อมชื่อผู้ดำเนินการและวันเวลา และแจ้งให้นักศึกษาทราบ" />
          </div>
        )}
      </Modal>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-900)' }}>{value}</div>
    </div>
  )
}

interface CardProps {
  view: AppealView
  filesFor: (eventId: number) => ReportEvidence[]
  renderFiles: (files: ReportEvidence[]) => ReactNode
  info: string
  setInfo: (v: string) => void
  infoFiles: File[]
  setInfoFiles: (f: File[]) => void
  sendingInfo: boolean
  onSendInfo: () => void
  onDecide: (d: AppealDecision) => void
}

function AppealCard({ view, filesFor, renderFiles, info, setInfo, infoFiles, setInfoFiles, sendingInfo, onSendInfo, onDecide }: CardProps) {
  const a = view.appeal
  const status = penaltyInfo[a.status]
  return (
    <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', flex: 1 }}>อุทธรณ์ #{a.id} · ยื่นเมื่อ {formatDateTime(a.created_at)}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
        {a.student_name} ({a.student_code || '—'}) · เคยถูก Blacklist ทั้งหมด {a.blacklist_count} ครั้ง
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {view.events.map((ev) => {
          const fromStudent = ev.actor_role === 'student'
          const files = filesFor(ev.id)
          return (
            <li key={ev.id} style={{ background: fromStudent ? 'var(--primary-50)' : 'var(--line-soft)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: fromStudent ? 'var(--primary)' : 'var(--ink-700)' }}>{appealEventLabel[ev.kind]}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{ev.actor_name} · {formatDateTime(ev.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-900)', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 4 }}>
                {ev.kind === 'SUBMIT'
                  ? <><b>เหตุผล:</b> {a.reason}{a.details && <><br /><b>รายละเอียด:</b> {a.details}</>}</>
                  : ev.note}
              </div>
              {files.length > 0 && <div style={{ marginTop: 8 }}>{renderFiles(files)}</div>}
            </li>
          )
        })}
      </ol>

      {view.can_add_info && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Textarea label="ส่งข้อมูลเพิ่มเติม *" rows={3} value={info} maxLength={MAX_TEXT} onChange={(e) => setInfo(e.target.value)} />
          <FilePicker files={infoFiles} onChange={setInfoFiles} label="แนบหลักฐานเพิ่ม" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button disabled={!info.trim()} loading={sendingInfo} onClick={onSendInfo}>ส่งข้อมูล</Button>
          </div>
        </div>
      )}

      {view.can_decide && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(a.status === 'appeal_pending' ? ['approve', 'reject', 'request_info'] as const : ['approve', 'reject'] as const).map((d) => (
            <Button key={d} size="sm" variant={decisionInfo[d].variant} onClick={() => onDecide(d)}>{decisionInfo[d].label}</Button>
          ))}
        </div>
      )}
    </div>
  )
}
