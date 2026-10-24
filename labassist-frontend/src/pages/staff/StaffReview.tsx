import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'
import type { DocStatus, DocType, FormReview, ReviewStatus } from '../../types'
import { docProgress, type DocProgress } from './staffCourseUtils'

const STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'pending',  label: 'รอตรวจสอบ' },
  { value: 'verified', label: 'ผ่านแล้ว' },
  { value: 'returned', label: 'ส่งกลับแก้ไข' },
]

const statusStyle: Record<ReviewStatus, React.CSSProperties> = {
  pending:  { background: '#FEF9C3', color: '#92400E', border: '1px solid #FDE68A' },
  verified: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
  returned: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
}
const statusLabel: Record<ReviewStatus, string> = {
  pending:  'รอตรวจสอบ',
  verified: 'ผ่านแล้ว',
  returned: 'ส่งกลับแก้ไข',
}

const STEP_SHORT: Partial<Record<DocType, string>> = {
  hiring_notice:   'แบบฟอร์มแจ้งความประสงค์จ้าง',
  approval_memo:   'บันทึกขออนุมัติจ้าง',
  payment_request: 'บันทึกขออนุมัติเบิกจ่าย',
  work_report:     'รายงานผลการปฏิบัติงาน',
}

const CURRENT_STATUS: Partial<Record<DocStatus | 'not_created', { label: string; color: string }>> = {
  not_created:        { label: 'รอสร้างเอกสาร', color: '#92400E' },
  draft:              { label: 'ร่างเอกสาร',    color: 'var(--blue)' },
  generated:          { label: 'ร่างเอกสาร',    color: 'var(--blue)' },
  approved:           { label: 'ร่างเอกสาร',    color: 'var(--blue)' },
  pending:            { label: 'รอตรวจสอบ',     color: 'var(--primary)' },
  awaiting_signature: { label: 'รอลงนาม',       color: '#92400E' },
}

function DocProgressCell({ p }: { p: DocProgress }) {
  if (p.phase === 'form_pending') {
    return <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>รอแบบฟอร์มผ่านการตรวจสอบ</span>
  }
  const st = CURRENT_STATUS[p.currentStatus] ?? CURRENT_STATUS.draft!
  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }} aria-label={`ลงนามแล้ว ${p.signed} จาก ${p.total} ฉบับ`}>
        {Array.from({ length: p.total }, (_, i) => (
          <span key={i} style={{
            flex: 1, height: 5, borderRadius: 3,
            background: i < p.signed ? 'var(--green)' : i === p.signed && p.current ? 'var(--amber)' : 'var(--line)',
          }} />
        ))}
      </div>
      {p.phase === 'done' || !p.current ? (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>เอกสารครบ {p.total} ฉบับ ลงนามแล้ว</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-900)' }}>
            {p.current.step}/{p.total} {STEP_SHORT[p.current.docType] ?? p.current.label}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: st.color, marginTop: 1 }}>{st.label}</div>
        </>
      )}
    </div>
  )
}

export default function StaffReview() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FormReview | null>(null)
  const [showReturn, setShowReturn] = useState(false)
  const [returnNote, setReturnNote] = useState('')

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['staff-reviews', statusFilter, search],
    queryFn: () => staffApi.listReviews({ status: statusFilter || undefined, q: search || undefined }),
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  function openCourse(form: FormReview) {
    navigate(`/staff/course/${form.academic_year}/${form.semester}/${encodeURIComponent(form.course_code)}/${form.section}?course=${form.course_id}`)
  }

  const verifyMut = useMutation({
    mutationFn: (courseId: number) => staffApi.verifyForm(courseId),
    onSuccess: (_, courseId) => {
      qc.invalidateQueries({ queryKey: ['staff-reviews'] })
      showToast(`ยืนยันแบบฟอร์ม course #${courseId} เรียบร้อยแล้ว`, 'success')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const returnMut = useMutation({
    mutationFn: ({ courseId, note }: { courseId: number; note: string }) =>
      staffApi.returnForm(courseId, note),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['staff-reviews'] })
      showToast(`ส่งแบบฟอร์ม ${r.course_code} กลับให้อาจารย์แก้ไขแล้ว`, 'info')
      setShowReturn(false)
      setSelected(null)
      setReturnNote('')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const pendingCount = reviews.filter((r) => r.status === 'pending').length

  function handleOpenReturn(form: FormReview) {
    setSelected(form)
    setReturnNote(form.note ?? '')
    setShowReturn(true)
  }

  function handleSubmitReturn(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !returnNote.trim()) return
    returnMut.mutate({ courseId: selected.course_id, note: returnNote.trim() })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 3 }}>
            ตรวจสอบแบบฟอร์ม
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            ตรวจสอบแบบฟอร์มแจ้งความประสงค์ที่อาจารย์ส่งมา และติดตามเอกสารของแต่ละรายวิชาว่าดำเนินการถึงขั้นไหนแล้ว
          </p>
        </div>
        {!isLoading && pendingCount > 0 && (
          <div style={{
            fontSize: 12, fontWeight: 700, padding: '5px 14px',
            background: 'var(--amber-bg)', color: '#92400E',
            borderRadius: 999, border: '1px solid #FDE68A',
          }}>
            {pendingCount} รายการรอตรวจสอบ
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap',
        background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
        padding: '10px 14px',
      }}>
        <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัสวิชา / อาจารย์..."
          style={{
            padding: '7px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 13, color: 'var(--ink-900)', outline: 'none', width: 220,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'auto', border: '1.5px solid var(--line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
              {['รายวิชา / ตอน', 'อาจารย์ผู้สอน', 'ที่รับ / ที่เปิดรับ', 'วันที่ส่ง', 'แบบฟอร์ม', 'ความคืบหน้าเอกสาร', ''].map((h) => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 24 }}><Skeleton lines={4} height={14} /></td></tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '52px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ไม่พบรายการ</div>
                </td>
              </tr>
            ) : reviews.map((form, i) => {
              const progress = docProgress(form, allDocs)
              return (
              <tr key={form.course_id}
                style={{ borderBottom: i < reviews.length - 1 ? '1px solid var(--line-soft)' : 'none', transition: 'background .1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>
                    {form.course_code}{' '}
                    <span style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: 12 }}>ตอน {form.section}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 2 }}>{form.course_title}</div>
                  {form.status === 'returned' && form.note && (
                    <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 4, background: '#FEE2E2', padding: '4px 8px', borderRadius: 6, maxWidth: 300 }}>
                      หมายเหตุ: {form.note}
                    </div>
                  )}
                </td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--ink-700)' }}>{form.instructor_name || '—'}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{form.labboy_accepted}</span>
                  <span style={{ color: 'var(--ink-400)', fontSize: 13 }}> / {form.labboy_slots}</span>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{form.submitted_at}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...statusStyle[form.status] }}>
                    {statusLabel[form.status]}
                  </span>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <DocProgressCell p={progress} />
                </td>
                <td style={{ padding: '13px 16px' }}>
                  {form.status !== 'verified' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" loading={verifyMut.isPending} onClick={() => verifyMut.mutate(form.course_id)}>ผ่านแล้ว</Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenReturn(form)}>ส่งกลับ</Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {progress.phase === 'done' ? (
                        <Button size="sm" variant="outline" onClick={() => openCourse(form)}>ดูเอกสาร</Button>
                      ) : (
                        <Button size="sm" onClick={() => openCourse(form)}>ดำเนินการต่อ</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleOpenReturn(form)}>ส่งกลับแก้ไข</Button>
                    </div>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Return Modal */}
      <Modal isOpen={showReturn} onClose={() => setShowReturn(false)} title="ส่งแบบฟอร์มกลับให้อาจารย์แก้ไข" size="md">
        {selected && (
          <form onSubmit={handleSubmitReturn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              <span style={{ color: 'var(--ink-500)' }}>วิชา: </span>
              <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{selected.course_code} {selected.course_title}</span>
              <span style={{ color: 'var(--ink-400)', marginLeft: 6 }}>ตอน {selected.section}</span>
            </div>
            <Textarea
              label="หมายเหตุ / เหตุผลที่ส่งกลับ *"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              placeholder="ระบุสิ่งที่อาจารย์ต้องแก้ไขหรือเพิ่มเติม..."
              required
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => setShowReturn(false)}>ยกเลิก</Button>
              <Button type="submit" variant="outline" loading={returnMut.isPending}>ส่งกลับแก้ไข</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
