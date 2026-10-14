import { useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage, reportsApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Input } from '../../components/ui/Input'
import { PageLoading } from '../../components/ui/PageLoading'
import { ErrorState } from '../../components/ui/ErrorState'
import { triggerBrowserDownload } from '../../utils/download'
import { ReportStatusBadge } from '../../components/reports/ReportStatusBadge'
import { ReportFormModal } from '../../components/reports/ReportFormModal'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { FilePicker } from '../../components/reports/FilePicker'
import { AppealSection } from '../../components/reports/AppealSection'
import { Icon } from '../../components/reports/ReportIcons'
import {
  categoryLabel, decisionLabel, formatDate, formatDateTime, responseKindLabel, statusInfo,
  DEFAULT_BLACKLIST_DAYS, isoDateFrom,
} from '../../components/reports/reportLabels'
import type { ReportAction, ReportDetail, ReportEvidence } from '../../types'

const MAX_TEXT = 2000

const actionInfo: Record<ReportAction, { label: string; variant: 'primary' | 'outline' | 'success' | 'danger' | 'danger-ghost'; needsReason: boolean; prompt: string }> = {
  submit:                  { label: 'ส่งให้อาจารย์',                 variant: 'primary', needsReason: false, prompt: 'เมื่อส่งแล้วจะแก้ไขไม่ได้ อาจารย์ประจำวิชาจะพิจารณา นักศึกษาที่ถูกรายงานจะได้รับแจ้งและชี้แจงได้โดยไม่เห็นชื่อคุณ' },
  blacklist:               { label: 'Blacklist',                    variant: 'danger',  needsReason: false, prompt: 'มีผลทันที อาจารย์รายวิชาอื่นที่นักศึกษาสมัครจะเห็นว่า "เคยโดนรีพอร์ท" นักศึกษาจะได้รับแจ้งและขอทบทวนได้' },
  confirm:                 { label: 'Blacklist นักศึกษา',            variant: 'danger',  needsReason: true,  prompt: 'ระบุเหตุผล — อาจารย์รายวิชาอื่นที่นักศึกษาสมัครจะเห็นว่า "เคยโดนรีพอร์ท" พร้อมเหตุผลนี้' },
  not_substantiated:       { label: 'ยกรายงาน (ไม่ Blacklist)',       variant: 'outline', needsReason: true,  prompt: 'ระบุเหตุผลที่ไม่ Blacklist — จะไม่มีผลต่อประวัติของนักศึกษา' },
  request_info:            { label: 'ขอข้อมูลเพิ่มเติม',             variant: 'outline', needsReason: true,  prompt: 'ระบุข้อมูลที่ต้องการจากนักศึกษาที่ถูกรายงานหรือผู้รายงาน' },
  reopen:                  { label: 'นำกลับมาพิจารณาใหม่',           variant: 'outline', needsReason: true,  prompt: 'ผลเดิมจะยังถูกเก็บไว้ในประวัติ และระหว่างพิจารณาจะไม่แสดงว่าเคยโดนรีพอร์ท ระบุเหตุผล' },
  withdraw:                { label: 'ถอนรายงาน',                    variant: 'danger-ghost', needsReason: true, prompt: 'ระบุเหตุผลที่ถอนรายงาน — ประวัติการดำเนินการจะยังถูกเก็บไว้' },
}

const ACTION_ORDER: ReportAction[] = ['submit', 'blacklist', 'confirm', 'not_substantiated', 'request_info', 'reopen', 'withdraw']

// Actions that blacklist the student, so they also take an end date.
const BLACKLISTING: ReportAction[] = ['blacklist', 'confirm']

function Section({ title, children, extra, count }: { title: string; children: ReactNode; extra?: ReactNode; count?: number }) {
  return (
    <Card padding={20}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', flex: 1 }}>
          {title}
          {count !== undefined && count > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-50)', borderRadius: 999, padding: '1px 8px' }}>{count}</span>}
        </h2>
        {extra}
      </div>
      {children}
    </Card>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-900)', lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}

export default function ReportDetailPage() {
  const { id } = useParams()
  const reportId = Number(id) || 0
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuth()

  const [pendingAction, setPendingAction] = useState<ReportAction | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [responseFiles, setResponseFiles] = useState<File[]>([])
  const [blacklistUntil, setBlacklistUntil] = useState(isoDateFrom(DEFAULT_BLACKLIST_DAYS))
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [editing, setEditing] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['report-detail', reportId],
    queryFn: () => reportsApi.detail(reportId),
    enabled: !!reportId,
    retry: false,
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['report-detail', reportId] })
    for (const k of ['instructor-reports', 'instructor-appeals', 'student-reports', 'student-filed-reports']) qc.invalidateQueries({ queryKey: [k] })
  }

  const actMut = useMutation({
    mutationFn: ({ action, why }: { action: ReportAction; why: string }) =>
      reportsApi.act(reportId, action, why, BLACKLISTING.includes(action) ? blacklistUntil : ''),
    onSuccess: (_, v) => {
      showToast(`${actionInfo[v.action].label} เรียบร้อยแล้ว`, 'success')
      setPendingAction(null)
      setReason('')
      refresh()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ดำเนินการไม่สำเร็จ'), 'error'),
  })

  const respondMut = useMutation({
    mutationFn: () => reportsApi.respond(reportId, message.trim(), responseFiles),
    onSuccess: () => {
      showToast('ส่งข้อความแล้ว', 'success')
      setMessage('')
      setResponseFiles([])
      refresh()
    },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'ส่งไม่สำเร็จ'), 'error'),
  })

  const evidenceMut = useMutation({
    mutationFn: () => reportsApi.uploadEvidence(reportId, evidenceFiles),
    onSuccess: () => { showToast('แนบหลักฐานแล้ว', 'success'); setEvidenceFiles([]); refresh() },
    onError: async (err) => showToast(await getApiErrorMessage(err, 'แนบไฟล์ไม่สำเร็จ'), 'error'),
  })

  async function openEvidence(e: ReportEvidence) {
    try {
      const blob = await reportsApi.evidenceFile(reportId, e.id)
      triggerBrowserDownload(blob, e.file_name)
    } catch (err) {
      showToast(await getApiErrorMessage(err, 'เปิดไฟล์ไม่สำเร็จ'), 'error')
    }
  }

  if (isLoading) return <PageLoading />
  if (isError || !data) {
    const notFound = (error as { response?: { status?: number } })?.response?.status === 404
    return notFound
      ? <ErrorState title="ไม่พบรายงาน" description="รายงานนี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง" />
      : <ErrorState onRetry={() => refetch()} />
  }

  const d: ReportDetail = data
  const r = d.report
  // The reported student, as opposed to a fellow Lab Boy who filed it.
  const isSubject = user?.role === 'student' && r.student_id === user.id
  const byStudent = r.reporter_role === 'student'
  const actions = ACTION_ORDER.filter((a) => d.allowed_actions.includes(a))
  const filesByResponse = new Map<number, ReportEvidence[]>()
  for (const e of d.evidence) {
    if (e.response_id) filesByResponse.set(e.response_id, [...(filesByResponse.get(e.response_id) ?? []), e])
  }
  const reporterFiles = d.evidence.filter((e) => !e.response_id && !e.appeal_event_id)
  const messageValid = message.trim().length > 0 && message.trim().length <= MAX_TEXT

  function evidenceLinks(list: ReportEvidence[]) {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((e) => (
          <li key={e.id}>
            <button className="report-row-link" onClick={() => openEvidence(e)} title="ดาวน์โหลดไฟล์">
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={e.content_type === 'application/pdf' ? 'file' : 'paperclip'} size={16} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.file_name}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)' }}>{Math.max(1, Math.round(e.size_bytes / 1024))} KB · {e.uploaded_by_name} · {formatDateTime(e.created_at)}</span>
              </span>
              <Icon name="upload" size={15} style={{ color: 'var(--ink-400)', transform: 'rotate(180deg)' }} />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const crumbs = user?.role === 'student'
    ? isSubject
      ? [{ label: 'รายงาน / Blacklist', to: '/student/reports?tab=about' }]
      : [{ label: 'รายงาน / Blacklist', to: '/student/reports' },
          { label: r.course_code, to: `/student/reports/courses/${encodeURIComponent(`${r.course_code}__${r.course_semester}__${r.course_academic_year}`)}` }]
    : [{ label: 'Blacklist', to: '/instructor/reports' }, { label: r.course_code, to: `/instructor/reports/courses/${r.course_id}` }]
  const isOpen = !['DRAFT', 'CONFIRMED', 'NOT_SUBSTANTIATED', 'WITHDRAWN'].includes(r.status)

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <ReportPageHeader
        crumbs={[...crumbs, { label: `รายงาน #${r.id}` }]}
        title={categoryLabel[r.category]}
        subtitle={<>{isSubject ? 'รายงานเกี่ยวกับคุณ' : `${r.student_name} (${r.student_code || '—'})`} · {r.course_code} {r.course_title} · เกิดเหตุ {formatDate(r.incident_date)}</>}
      />

      {isOpen && (
        <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg)', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--ink-700)', marginBottom: 16, lineHeight: 1.6 }}>
          <Icon name="alert" size={18} style={{ color: 'var(--primary)', marginTop: 2 }} />
          รายงานนี้รออาจารย์ประจำวิชาพิจารณา จึงยังไม่ใช่ข้อสรุปว่านักศึกษากระทำผิด และจะไม่แสดงว่า "เคยโดนรีพอร์ท" แก่อาจารย์รายวิชาอื่นจนกว่าจะถูก Blacklist
        </div>
      )}

      <div className="report-layout">
        <div className="report-main">
          <AppealSection detail={d} isSubject={isSubject} onChanged={refresh} renderFiles={evidenceLinks} />
          <Section title="รายละเอียดเหตุการณ์">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--line-soft)' }}>
              {!isSubject && <Field label="นักศึกษาที่ถูกรายงาน" value={<>{r.student_name}<div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{r.student_code}</div></>} />}
              <Field label="รายวิชา" value={<>{r.course_code}{r.course_section ? ` · Sec ${r.course_section}` : ''}<div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{r.course_title}{r.course_semester ? ` (${r.course_semester}/${r.course_academic_year})` : ''}</div></>} />
              <Field label="ผู้รายงาน" value={<>{r.reporter_name}{!isSubject && <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{byStudent ? 'Lab Boy ในรายวิชาเดียวกัน' : 'อาจารย์ประจำวิชา'}</div>}</>} />
              <Field label="วันที่เกิดเหตุ" value={formatDate(r.incident_date)} />
              <Field label="ส่งรายงานเมื่อ" value={formatDateTime(r.submitted_at)} />
            </div>
            <Field label="รายละเอียดและเหตุผลที่รายงาน" value={<div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{r.description}</div>} />
            {r.impact && <div style={{ marginTop: 16 }}><Field label="ผลกระทบ" value={<div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{r.impact}</div>} /></div>}
          </Section>

          <Section title="หลักฐานจากผู้รายงาน" count={reporterFiles.length}>
            {reporterFiles.length === 0 ? <div style={{ fontSize: 14, color: 'var(--ink-400)' }}>ไม่มีไฟล์แนบ</div> : evidenceLinks(reporterFiles)}
            {d.can_add_evidence && r.status !== 'DRAFT' && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FilePicker files={evidenceFiles} onChange={setEvidenceFiles} label="แนบหลักฐานเพิ่ม" />
                {evidenceFiles.length > 0 && (
                  <div><Button size="sm" loading={evidenceMut.isPending} onClick={() => evidenceMut.mutate()}>อัปโหลด {evidenceFiles.length} ไฟล์</Button></div>
                )}
              </div>
            )}
          </Section>

          <Section title="คำชี้แจงและข้อมูลเพิ่มเติม" count={d.responses.length}>
            {d.responses.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--ink-400)' }}>ยังไม่มีคำชี้แจง</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.responses.map((resp) => {
                  const fromStudent = resp.author_role === 'student'
                  return (
                    <div key={resp.id} style={{ background: fromStudent ? 'var(--primary-50)' : 'var(--line-soft)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: fromStudent ? 'var(--primary)' : 'var(--ink-600)' }}>{responseKindLabel[resp.kind]}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{resp.author_name} · {formatDateTime(resp.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--ink-900)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{resp.message}</div>
                      {filesByResponse.get(resp.id) && <div style={{ marginTop: 10 }}>{evidenceLinks(filesByResponse.get(resp.id)!)}</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {d.can_respond && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--line-soft)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Textarea
                  label={isSubject ? 'ส่งคำชี้แจง' : 'เพิ่มข้อมูลให้อาจารย์ประจำวิชา'}
                  rows={4}
                  value={message}
                  maxLength={MAX_TEXT}
                  onChange={(e) => setMessage(e.target.value)}
                  hint={`${message.trim().length}/${MAX_TEXT} — ข้อความที่ส่งแล้วจะถูกเก็บไว้และแก้ไขไม่ได้ ส่งเพิ่มได้หลายครั้ง`}
                />
                <FilePicker files={responseFiles} onChange={setResponseFiles} label="แนบไฟล์ประกอบ" />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button disabled={!messageValid} loading={respondMut.isPending} onClick={() => respondMut.mutate()}>
                    {isSubject ? 'ส่งคำชี้แจง' : 'ส่งข้อมูล'}
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <Section title="ผลการพิจารณาของอาจารย์" count={d.reviews.length}>
            {d.reviews.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--ink-400)' }}>ยังไม่มีผลการพิจารณา</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.reviews.map((rv) => (
                  <div key={rv.id} style={{ borderLeft: '3px solid var(--primary)', background: 'var(--line-soft)', borderRadius: '0 10px 10px 0', padding: '12px 14px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{decisionLabel[rv.decision]}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', margin: '2px 0 8px' }}>{rv.reviewer_name} · {formatDateTime(rv.created_at)}</div>
                    <div style={{ fontSize: 14, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{rv.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="report-side" aria-label="สถานะและการดำเนินการ">
          <Card padding={20}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 8 }}>สถานะปัจจุบัน</div>
            <ReportStatusBadge status={r.status} />
            <p style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 10, lineHeight: 1.6 }}>{statusInfo[r.status].hint}</p>
            {(actions.length > 0 || d.can_edit) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
                {d.can_edit && <Button variant="outline" style={{ width: '100%', minHeight: 40 }} onClick={() => setEditing(true)}>แก้ไขร่าง</Button>}
                {actions.map((a) => (
                  <Button key={a} variant={actionInfo[a].variant} style={{ width: '100%', minHeight: 40 }} onClick={() => { setReason(''); setBlacklistUntil(isoDateFrom(DEFAULT_BLACKLIST_DAYS)); setPendingAction(a) }}>
                    {actionInfo[a].label}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card padding={20}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 14 }}>ประวัติการดำเนินการ</h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {d.history.map((h, i) => {
                const last = i === d.history.length - 1
                return (
                  <li key={h.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: last ? 'var(--primary)' : '#fff', border: '2px solid var(--primary)' }} />
                      {!last && <span style={{ width: 2, flex: 1, background: 'var(--primary-100)' }} />}
                    </div>
                    <div style={{ paddingBottom: last ? 0 : 16, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>{statusInfo[h.to_status].label}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{h.actor_name} · {formatDateTime(h.created_at)}</div>
                      {h.reason && <div style={{ fontSize: 13, color: 'var(--ink-700)', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{h.reason}</div>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
        </aside>
      </div>

      {editing && (
        <ReportFormModal
          existing={r}
          as={byStudent ? 'student' : 'instructor'}
          existingEvidence={d.evidence}
          target={{
            applicationId: r.application_id, studentName: r.student_name, studentCode: r.student_code,
            courseLabel: `${r.course_code} ${r.course_title}${r.course_section ? ` · Sec ${r.course_section}` : ''}`,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}

      <Modal isOpen={!!pendingAction} onClose={() => !actMut.isPending && setPendingAction(null)} title={pendingAction ? actionInfo[pendingAction].label : ''} size="md"
        footer={pendingAction && <>
          <Button variant="outline" onClick={() => setPendingAction(null)} disabled={actMut.isPending}>ยกเลิก</Button>
          <Button
            variant={['withdraw', 'blacklist', 'confirm'].includes(pendingAction) ? 'danger' : 'primary'}
            loading={actMut.isPending}
            disabled={(actionInfo[pendingAction].needsReason && !reason.trim()) || (BLACKLISTING.includes(pendingAction) && !blacklistUntil)}
            onClick={() => actMut.mutate({ action: pendingAction, why: reason.trim() })}
          >ยืนยัน</Button>
        </>}
      >
        {pendingAction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6 }}>{actionInfo[pendingAction].prompt}</p>
            {BLACKLISTING.includes(pendingAction) && (
              <Input label="Blacklist มีผลถึงวันที่ *" type="date" min={isoDateFrom(1)} max={isoDateFrom(730)} value={blacklistUntil}
                onChange={(e) => setBlacklistUntil(e.target.value)}
                hint="หลังวันนี้ อาจารย์รายวิชาอื่นจะไม่เห็นว่าเคยโดนรีพอร์ทแล้ว นักศึกษายื่นอุทธรณ์ได้ภายใน 15 วัน" />
            )}
            {actionInfo[pendingAction].needsReason && (
              <Textarea label="เหตุผล *" rows={4} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
            )}
          </div>
        )}
      </Modal>

    </div>
  )
}
