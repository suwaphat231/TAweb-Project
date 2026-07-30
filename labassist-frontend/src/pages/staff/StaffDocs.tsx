import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { FilterChips } from '../../components/ui/FilterChips'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import type { DocType, DocStatus, StaffDocument } from '../../types'

const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'draft',    label: 'ร่าง' },
  { value: 'pending',  label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
]

const TYPE_LABELS: Record<DocType, string> = {
  approval_memo:    'บันทึกขออนุมัติจ้าง',
  payment_evidence: 'หลักฐานการจ่ายเงิน',
  payment_request:  'บันทึกขอเบิกจ่าย',
}
const TYPE_STEP: Record<DocType, string> = {
  approval_memo:    'ขั้นตอนที่ 3',
  payment_evidence: 'ขั้นตอนที่ 5',
  payment_request:  'ขั้นตอนที่ 6',
}
const TYPE_COLOR: Record<DocType, string> = {
  approval_memo:    '#1B4FD8',
  payment_evidence: '#0891B2',
  payment_request:  '#7C3AED',
}
const STATUS_BADGE: Record<DocStatus, React.CSSProperties> = {
  draft:    { background: '#F3F4F6', color: 'var(--ink-500)', border: '1px solid var(--line)' },
  pending:  { background: '#FEF9C3', color: '#92400E',        border: '1px solid #FDE68A' },
  approved: { background: '#DCFCE7', color: '#166534',        border: '1px solid #86EFAC' },
}
const STATUS_LABEL: Record<DocStatus, string> = { draft: 'ร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว' }

const FORM_EMPTY = { type: '' as DocType | '', course_ref: '', note: '' }

export default function StaffDocs() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['staff-documents', typeFilter, statusFilter, search],
    queryFn: () => staffApi.listDocuments({
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      q: search || undefined,
    }),
  })

  const createMut = useMutation({
    mutationFn: (data: { type: string; course_ref: string; note?: string }) =>
      staffApi.createDocument(data),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      showToast(`สร้างเอกสาร "${doc.name}" สำเร็จ`, 'success')
      setForm(FORM_EMPTY)
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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type || !form.course_ref) return
    createMut.mutate({ type: form.type, course_ref: form.course_ref, note: form.note || undefined })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการเอกสาร</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>{docs.length} เอกสาร</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ สร้างเอกสาร</Button>
      </div>

      {/* Step filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
          <div key={t} onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
              borderColor: typeFilter === t ? TYPE_COLOR[t] : 'var(--line)',
              background: typeFilter === t ? TYPE_COLOR[t] : '#fff',
              color: typeFilter === t ? '#fff' : 'var(--ink-600)',
              transition: 'all .15s',
            }}>
            <span style={{ opacity: .7, marginRight: 4, fontWeight: 400 }}>{TYPE_STEP[t]}</span>{TYPE_LABELS[t]}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรายวิชา..."
          style={{
            padding: '7px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 13, color: 'var(--ink-900)', outline: 'none', minWidth: 200,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'auto', boxShadow: 'var(--shadow-md)' }}>
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
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)', fontSize: 14 }}>ไม่พบเอกสาร</td></tr>
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
                    <button title="ดาวน์โหลด" style={iconBtn} onClick={() => showToast(`กำลังดาวน์โหลด: ${doc.name}`, 'info')}>
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
            <li><b>ขั้นตอนที่ 3</b> — บันทึกขออนุมัติจ้าง (หลังตรวจสอบแบบฟอร์มผ่านแล้ว)</li>
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
              { value: 'approval_memo',    label: 'ขั้นตอนที่ 3 — บันทึกขออนุมัติจ้าง' },
              { value: 'payment_evidence', label: 'ขั้นตอนที่ 5 — หลักฐานการจ่ายเงิน' },
              { value: 'payment_request',  label: 'ขั้นตอนที่ 6 — บันทึกขอเบิกจ่าย' },
            ]}
            required
          />
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

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
