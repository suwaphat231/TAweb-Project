import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi, applicationsAPI } from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'
import { triggerBrowserDownload } from '../../utils/download'
import type { DocType, DocStatus, StaffDocument, CreateStaffDocumentPayload } from '../../types'

const TYPE_LABELS: Record<DocType, string> = {
  hiring_notice:    'แบบฟอร์มแจ้งความประสงค์',
  approval_memo:    'บันทึกขออนุมัติจ้าง',
  work_report:      'รายงานผลการปฏิบัติงาน',
  payment_evidence: 'หลักฐานการจ่ายเงิน',
  payment_request:  'บันทึกขอเบิกจ่าย',
}
const TYPE_STEP: Record<DocType, string> = {
  hiring_notice:    'ขั้นตอนที่ 1',
  approval_memo:    'ขั้นตอนที่ 3',
  work_report:      'ขั้นตอนที่ 4',
  payment_evidence: 'ขั้นตอนที่ 5',
  payment_request:  'ขั้นตอนที่ 6',
}
const TYPE_COLOR: Record<DocType, string> = {
  hiring_notice:    '#7C3AED',
  approval_memo:    'var(--primary)',
  work_report:      '#059669',
  payment_evidence: 'var(--primary-700)',
  payment_request:  'var(--primary-700)',
}
const STATUS_BADGE: Record<DocStatus, React.CSSProperties> = {
  draft:    { background: '#F3F4F6', color: 'var(--ink-500)', border: '1px solid var(--line)' },
  pending:  { background: '#FEF9C3', color: '#92400E',        border: '1px solid #FDE68A' },
  approved: { background: '#DCFCE7', color: '#166534',        border: '1px solid #86EFAC' },
}
const STATUS_LABEL: Record<DocStatus, string> = { draft: 'ร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว' }

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const NEEDS_COURSE_TYPES: DocType[] = ['hiring_notice', 'payment_evidence', 'payment_request', 'work_report']
const LINE_ITEM_TYPES: DocType[] = ['payment_evidence', 'payment_request', 'work_report']

const nowBE = new Date().getFullYear() + 543

const THAI_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']

const FORM_EMPTY = {
  type: '' as DocType | '',
  course_ref: '',
  note: '',
  course_id: '',
  month: String(new Date().getMonth() + 1),
  year: String(nowBE),
  session_dates: '',
  hours_per_session: '2',
  rate: '50',
  work_day: '',
  work_time_start: '',
  work_time_end: '',
  ref_number: '',
  prior_memo_ref: '',
  prior_memo_date: '',
  dept_head_name: '',
  dean_name: '',
  staff_officer_name: '',
}

// Status filter options
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',         label: 'ทุกสถานะ'  },
  { value: 'draft',    label: 'ร่าง'      },
  { value: 'pending',  label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
]

export default function StaffDocs() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set())
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['staff-documents', typeFilter, statusFilter, search],
    queryFn: () => staffApi.listDocuments({
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      q: search || undefined,
    }),
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  const { data: reviews = [] } = useQuery({
    queryKey: ['staff-reviews-for-doc-picker'],
    queryFn: () => staffApi.listReviews(),
    enabled: showCreate,
  })

  const needsCourse = NEEDS_COURSE_TYPES.includes(form.type as DocType)
  const isLineItem = LINE_ITEM_TYPES.includes(form.type as DocType)
  const courseId = form.course_id ? Number(form.course_id) : undefined

  const { data: applicants = [] } = useQuery({
    queryKey: ['course-applicants-for-doc', courseId],
    queryFn: () => applicationsAPI.getCourseApplicants(courseId as number),
    enabled: needsCourse && !!courseId,
  })
  const roster = useMemo(() => applicants.filter((a) => a.status === 'accepted'), [applicants])

  const sessionDates = useMemo(
    () => form.session_dates.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 31),
    [form.session_dates]
  )
  const includedCount = roster.filter((r) => !excludedIds.has(r.student_id)).length
  const hoursPerSession = Number(form.hours_per_session) || 0
  const rate = Number(form.rate) || 0
  const totalHours = sessionDates.length * hoursPerSession
  const totalAmount = totalHours * rate * includedCount

  const createMut = useMutation({
    mutationFn: (data: CreateStaffDocumentPayload) => staffApi.createDocument(data),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`สร้างเอกสาร "${doc.name}" สำเร็จ`, 'success')
      setForm(FORM_EMPTY)
      setExcludedIds(new Set())
      setShowCreate(false)
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const submitMut = useMutation({
    mutationFn: (doc: StaffDocument) => staffApi.updateDocumentStatus(doc.id, 'pending'),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`ส่งเอกสาร "${doc.name}" เพื่ออนุมัติแล้ว`, 'info')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  async function handleDownload(doc: StaffDocument) {
    setDownloadingId(doc.id)
    try {
      const blob = await staffApi.downloadDocument(doc.id)
      triggerBrowserDownload(blob, `${doc.name}.docx`)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 501) showToast('เอกสารประเภทนี้ยังไม่รองรับการสร้างไฟล์', 'info')
      else showToast('ดาวน์โหลดไม่สำเร็จ', 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type || !form.course_ref) return

    const payload: CreateStaffDocumentPayload = {
      type: form.type,
      course_ref: form.course_ref,
      note: form.note || undefined,
    }

    if (needsCourse) {
      if (!courseId) {
        showToast('กรุณาเลือกรายวิชา', 'error')
        return
      }
      payload.course_id = courseId
      payload.excluded_student_ids = Array.from(excludedIds)

      if (isLineItem) {
        payload.month = Number(form.month)
        payload.year = Number(form.year)
        payload.session_dates = sessionDates
        payload.hours_per_session = hoursPerSession
        payload.rate = rate
        payload.work_day = form.work_day || undefined
        payload.work_time_start = form.work_time_start || undefined
        payload.work_time_end = form.work_time_end || undefined
        if (form.type === 'payment_request') {
          payload.ref_number = form.ref_number || undefined
          payload.prior_memo_ref = form.prior_memo_ref || undefined
          payload.prior_memo_date = form.prior_memo_date || undefined
          payload.dept_head_name = form.dept_head_name || undefined
          payload.staff_officer_name = form.staff_officer_name || undefined
        }
        if (form.type === 'work_report') {
          payload.dept_head_name = form.dept_head_name || undefined
          payload.dean_name = form.dean_name || undefined
        }
      }
    }

    createMut.mutate(payload)
  }

  function handleCourseChange(value: string) {
    const r = reviews.find((r) => String(r.course_id) === value)
    setForm((f) => ({
      ...f,
      course_id: value,
      course_ref: r ? `${r.course_code} ตอน ${r.section}` : f.course_ref,
    }))
    setExcludedIds(new Set())
  }

  function toggleExclude(studentId: number) {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const draftCount    = allDocs.filter((d) => d.status === 'draft').length
  const pendingCount  = allDocs.filter((d) => d.status === 'pending').length
  const approvedCount = allDocs.filter((d) => d.status === 'approved').length

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการเอกสาร</h1>
        <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
          <DocStatChip label="ร่าง" value={draftCount} />
          <DocStatChip label="รออนุมัติ" value={pendingCount} color="#92400E" bg="var(--amber-bg)" />
          <DocStatChip label="อนุมัติแล้ว" value={approvedCount} color="#166534" bg="#DCFCE7" />
        </div>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setShowCreate(true)}>+ สร้างเอกสาร</Button>
      </div>

      {/* Filter toolbar */}
      <div style={{
        background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)',
        padding: '10px 14px', marginBottom: 16,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterPill label="ทั้งหมด" active={typeFilter === ''} color="var(--ink-600)" onClick={() => setTypeFilter('')} />
          {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
            <FilterPill key={t} label={TYPE_LABELS[t]} active={typeFilter === t} color={TYPE_COLOR[t]} onClick={() => setTypeFilter(t === typeFilter ? '' : t)} />
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />
        {/* Status select */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '6px 10px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 12, color: 'var(--ink-700)', background: '#fff', outline: 'none', cursor: 'pointer',
          }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรายวิชา..."
          style={{
            padding: '7px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 13, color: 'var(--ink-900)', outline: 'none', width: 200,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'auto', border: '1.5px solid var(--line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
              {['ชื่อเอกสาร', 'ประเภท', 'รายวิชา / อ้างอิง', 'วันที่สร้าง', 'สถานะ', ''].map((h) => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 24 }}><Skeleton lines={4} height={14} /></td></tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '52px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ไม่พบเอกสาร</div>
                </td>
              </tr>
            ) : docs.map((doc, i) => (
              <tr key={doc.id}
                style={{ borderBottom: i < docs.length - 1 ? '1px solid var(--line-soft)' : 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.name}
                  </div>
                  {doc.note && <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>{doc.note}</div>}
                </td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    background: TYPE_COLOR[doc.type] + '18', color: TYPE_COLOR[doc.type],
                  }}>
                    {TYPE_STEP[doc.type]} {TYPE_LABELS[doc.type]}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{doc.course_ref}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>
                  {new Date(doc.created_at).toLocaleDateString('th-TH')}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...STATUS_BADGE[doc.status] }}>
                    {STATUS_LABEL[doc.status]}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button title="ดาวน์โหลด" style={iconBtn} disabled={downloadingId === doc.id} onClick={() => handleDownload(doc)}>
                      <DownloadIcon />
                    </button>
                    {doc.status === 'draft' && (
                      <Button size="sm" variant="outline" loading={submitMut.isPending} onClick={() => submitMut.mutate(doc)}>
                        ส่งอนุมัติ
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="สร้างเอกสารใหม่" size="md">
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--ink-600)' }}>
          เลือกประเภทเอกสารให้ตรงกับขั้นตอนการดำเนินงาน:
          <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            <li><b>ขั้นตอนที่ 1</b> — แบบฟอร์มแจ้งความประสงค์จ้าง (แนบรายชื่อนักศึกษา)</li>
            <li><b>ขั้นตอนที่ 3</b> — บันทึกขออนุมัติจ้าง (หลังตรวจสอบแบบฟอร์มผ่านแล้ว)</li>
            <li><b>ขั้นตอนที่ 4</b> — รายงานผลการปฏิบัติงาน (สิ้นสุดภาคการศึกษา)</li>
            <li><b>ขั้นตอนที่ 5</b> — หลักฐานการจ่ายเงิน (สิ้นสุดภาคการศึกษา)</li>
            <li><b>ขั้นตอนที่ 6</b> — บันทึกขอเบิกจ่าย (ส่งต่อฝ่ายงบประมาณ)</li>
          </ul>
        </div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="ประเภทเอกสาร *"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DocType }))}
            options={[
              { value: '', label: '— เลือกประเภท —' },
              { value: 'hiring_notice',    label: 'ขั้นตอนที่ 1 — แบบฟอร์มแจ้งความประสงค์จ้าง' },
              { value: 'approval_memo',    label: 'ขั้นตอนที่ 3 — บันทึกขออนุมัติจ้าง' },
              { value: 'work_report',      label: 'ขั้นตอนที่ 4 — รายงานผลการปฏิบัติงาน' },
              { value: 'payment_evidence', label: 'ขั้นตอนที่ 5 — หลักฐานการจ่ายเงิน' },
              { value: 'payment_request',  label: 'ขั้นตอนที่ 6 — บันทึกขอเบิกจ่าย' },
            ]}
            required
          />

          {needsCourse ? (
            <Select
              label="รายวิชา *"
              value={form.course_id}
              onChange={(e) => handleCourseChange(e.target.value)}
              options={[
                { value: '', label: '— เลือกรายวิชา —' },
                ...reviews.map((r) => ({
                  value: String(r.course_id),
                  label: `${r.course_code} ตอน ${r.section} — ${r.course_title}`,
                })),
              ]}
              required
            />
          ) : (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', display: 'block', marginBottom: 6 }}>
                อ้างอิงรายวิชา *
              </label>
              <input
                value={form.course_ref}
                onChange={(e) => setForm((f) => ({ ...f, course_ref: e.target.value }))}
                placeholder="เช่น 204223 ตอน 1 หรือ 204223/1/2568"
                required
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius-input)', fontSize: 13, color: 'var(--ink-900)', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
              />
            </div>
          )}

          {needsCourse && courseId && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', display: 'block', marginBottom: 6 }}>
                รายชื่อนักศึกษา (ผ่านการคัดเลือก)
              </label>
              {roster.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีนักศึกษาที่ผ่านการคัดเลือกในวิชานี้</p>
              ) : (
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 8, maxHeight: 180, overflow: 'auto' }}>
                  {roster.map((s) => (
                    <label key={s.student_id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      borderBottom: '1px solid var(--line-soft)', fontSize: 13, cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={!excludedIds.has(s.student_id)}
                        onChange={() => toggleExclude(s.student_id)}
                      />
                      <span>{s.student_name}</span>
                      <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>({s.student_code})</span>
                    </label>
                  ))}
                </div>
              )}
              {isLineItem && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--ink-700)' }}>
                  รวม {includedCount} คน × {totalHours} ชม. × {rate.toLocaleString()} บาท/ชม. = <b>{totalAmount.toLocaleString()} บาท</b>
                </div>
              )}
            </div>
          )}

          {isLineItem && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Select
                    label="เดือน"
                    value={form.month}
                    onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                    options={THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="ปี พ.ศ." type="number" value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
                </div>
              </div>

              <Input
                label="วันที่ปฏิบัติงาน (คั่นด้วยจุลภาค)"
                value={form.session_dates}
                onChange={(e) => setForm((f) => ({ ...f, session_dates: e.target.value }))}
                placeholder="เช่น 3, 17, 24"
                hint="ระบุวันที่ในเดือนนี้ที่มีการปฏิบัติงาน"
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Input label="ชั่วโมง/ครั้ง" type="number" min={0} step="0.5" value={form.hours_per_session}
                    onChange={(e) => setForm((f) => ({ ...f, hours_per_session: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="อัตราค่าจ้าง (บาท/ชม.)" type="number" min={0} value={form.rate}
                    onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', display: 'block', marginBottom: 6 }}>
                  ตารางปฏิบัติงานประจำสัปดาห์
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: '0 0 140px' }}>
                    <Select
                      label="วัน"
                      value={form.work_day}
                      onChange={(e) => setForm((f) => ({ ...f, work_day: e.target.value }))}
                      options={[
                        { value: '', label: '— เลือกวัน —' },
                        ...THAI_DAYS.map((d) => ({ value: d, label: d })),
                      ]}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input
                      label="เวลาเริ่ม"
                      type="time"
                      value={form.work_time_start}
                      onChange={(e) => setForm((f) => ({ ...f, work_time_start: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input
                      label="เวลาสิ้นสุด"
                      type="time"
                      value={form.work_time_end}
                      onChange={(e) => setForm((f) => ({ ...f, work_time_end: e.target.value }))}
                    />
                  </div>
                </div>
                {form.work_day && form.work_time_start && form.work_time_end && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                    วัน{form.work_day} เวลา {form.work_time_start} น. – {form.work_time_end} น.
                    {' '}({form.hours_per_session} ชม./ครั้ง)
                  </div>
                )}
              </div>

              {form.type === 'payment_request' && (
                <>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Input label="เลขที่หนังสือ" value={form.ref_number}
                      onChange={(e) => setForm((f) => ({ ...f, ref_number: e.target.value }))} placeholder="อว 8613.7/999" />
                    <Input label="อ้างอิงบันทึกขออนุมัติจ้าง" value={form.prior_memo_ref}
                      onChange={(e) => setForm((f) => ({ ...f, prior_memo_ref: e.target.value }))} placeholder="อว 8613.7/171" />
                  </div>
                  <Input label="ลงวันที่บันทึกฉบับก่อน" value={form.prior_memo_date}
                    onChange={(e) => setForm((f) => ({ ...f, prior_memo_date: e.target.value }))} placeholder="1 ธันวาคม 2568" />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Input label="ชื่อเจ้าหน้าที่ผู้จัดทำ" value={form.staff_officer_name}
                      onChange={(e) => setForm((f) => ({ ...f, staff_officer_name: e.target.value }))} />
                    <Input label="ชื่อหัวหน้าภาควิชา" value={form.dept_head_name}
                      onChange={(e) => setForm((f) => ({ ...f, dept_head_name: e.target.value }))} />
                  </div>
                </>
              )}

              {form.type === 'work_report' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Input label="ชื่อหัวหน้าภาควิชา" value={form.dept_head_name}
                    onChange={(e) => setForm((f) => ({ ...f, dept_head_name: e.target.value }))} />
                  <Input label="ชื่อคณบดี" value={form.dean_name}
                    onChange={(e) => setForm((f) => ({ ...f, dean_name: e.target.value }))} />
                </div>
              )}
            </>
          )}

          <Textarea
            label="หมายเหตุ"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            rows={3}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending}>สร้างเอกสาร</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line)', borderRadius: 6,
  cursor: 'pointer', color: 'var(--ink-500)', padding: '4px 6px',
  display: 'flex', alignItems: 'center',
}

function FilterPill({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', border: '1.5px solid',
        borderColor: active ? color : 'var(--line)',
        background: active ? color : '#fff',
        color: active ? '#fff' : 'var(--ink-600)',
        transition: 'all .12s',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )
}

function DocStatChip({ label, value, color = 'var(--ink-500)', bg = '#F3F4F6' }: { label: string; value: number; color?: string; bg?: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', background: bg, borderRadius: 999, fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color }}>{value}</span>
      <span style={{ color: 'var(--ink-500)' }}>{label}</span>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
