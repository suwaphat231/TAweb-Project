import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import type { DocStatus, DocType, FormReview } from '../../types'
import { docProgress, type DocProgress } from './staffCourseUtils'

// Staff do not verify or return the instructor's form: a course appears here
// once its instructor confirms the Lab Boy roster, and staff go straight to
// its documents. The tabs split courses by document progress.
type Filter = 'in_progress' | 'done' | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'done',        label: 'เอกสารครบ' },
  { value: 'all',         label: 'ทั้งหมด' },
]

const isDone = (p: DocProgress) => p.phase === 'done'

const STEP_SHORT: Partial<Record<DocType, string>> = {
  hiring_notice:   'แบบฟอร์มแจ้งความประสงค์จ้าง',
  approval_memo:   'บันทึกขออนุมัติจ้าง',
  payment_request: 'บันทึกขออนุมัติเบิกจ่าย',
  work_report:     'รายงานผลการปฏิบัติงาน',
}

const CURRENT_STATUS: Partial<Record<DocStatus | 'not_created', string>> = {
  not_created:        'รอสร้างเอกสาร',
  draft:              'ร่างเอกสาร',
  generated:          'ร่างเอกสาร',
  approved:           'ร่างเอกสาร',
  pending:            'รอตรวจสอบ',
  awaiting_signature: 'รอลงนาม',
}

function fmtDate(raw?: string): string {
  if (!raw) return '—'
  const d = new Date(raw)
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

/** ความคืบหน้าเอกสารของรายวิชา */
function ProgressCell({ p }: { p: DocProgress }) {
  const done = p.phase === 'done' || !p.current
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }} aria-label={`สร้างเอกสารแล้ว ${p.signed} จาก ${p.total} ฉบับ`}>
        {Array.from({ length: p.total }, (_, i) => (
          <span key={i} style={{
            flex: 1, height: 5, borderRadius: 3,
            background: i < p.signed ? 'var(--green)' : i === p.signed && p.current ? 'var(--amber)' : 'var(--line)',
          }} />
        ))}
      </div>
      {done ? (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>เอกสารครบ {p.total} ฉบับ</div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
            {p.current!.step}/{p.total} {STEP_SHORT[p.current!.docType] ?? p.current!.label}
          </span>
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · {CURRENT_STATUS[p.currentStatus] ?? 'ร่างเอกสาร'}</span>
        </div>
      )}
    </div>
  )
}

function DocIcon({ done }: { done: boolean }) {
  return (
    <span aria-hidden style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: done ? 'var(--primary-50)' : 'var(--line-soft)',
      color: done ? 'var(--primary)' : 'var(--ink-500)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        {done
          ? <polyline points="9 15 11 17 15 13" />
          : <><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>}
      </svg>
    </span>
  )
}

export default function StaffReview() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('in_progress')
  const [search, setSearch] = useState('')

  // ดึงทั้งหมดครั้งเดียว แล้วกรองสถานะ/ค้นหาฝั่ง client เพื่อให้ตัวเลขบนแท็บถูกต้องเสมอ
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['staff-reviews'],
    queryFn: () => staffApi.listReviews(),
  })

  const { data: allDocs = [] } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  const rows = useMemo(
    () => reviews.map((form) => ({ form, progress: docProgress(form, allDocs) })),
    [reviews, allDocs],
  )

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { in_progress: 0, done: 0, all: rows.length }
    for (const r of rows) c[isDone(r.progress) ? 'done' : 'in_progress']++
    return c
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => filter === 'all' || (filter === 'done') === isDone(r.progress))
      .filter(({ form: r }) => !q || [r.course_code, r.course_title, r.instructor_name].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(isDone(a.progress)) - Number(isDone(b.progress)))
  }, [rows, filter, search])

  function openCourse(form: FormReview) {
    navigate(`/staff/course/${form.academic_year}/${form.semester}/${encodeURIComponent(form.course_code)}/${form.section}?course=${form.course_id}`)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 4px' }}>
          จัดการเอกสาร
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          รายวิชาที่อาจารย์ยืนยันรายชื่อ Lab Boy แล้ว เข้าไปจัดการเอกสารของแต่ละรายวิชา
        </p>
      </div>

      {/* Toolbar: แท็บสถานะ + ค้นหา */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 14,
      }}>
        <div role="tablist" aria-label="กรองตามสถานะ" style={{
          display: 'inline-flex', gap: 4, padding: 4, flexWrap: 'wrap',
          background: 'var(--line-soft)', borderRadius: 10,
        }}>
          {FILTERS.map((f) => {
            const active = filter === f.value
            const n = counts[f.value]
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.value)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', minHeight: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: active ? '#fff' : 'transparent',
                  color: active ? 'var(--ink-900)' : 'var(--ink-500)',
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
                  transition: 'background .15s, color .15s',
                }}
              >
                {f.label}
                <span style={{
                  minWidth: 20, padding: '0 6px', borderRadius: 999, fontSize: 11, lineHeight: '18px',
                  background: f.value === 'in_progress' && n > 0 ? 'var(--amber)' : active ? 'var(--primary-50)' : 'rgba(0,0,0,0.05)',
                  color: f.value === 'in_progress' && n > 0 ? '#fff' : active ? 'var(--primary)' : 'var(--ink-500)',
                }}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>

        <label style={{ position: 'relative', flex: '0 1 280px', minWidth: 200 }}>
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารหัสวิชา ชื่อวิชา หรืออาจารย์"
            aria-label="ค้นหารายวิชา"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', boxSizing: 'border-box',
              border: '1px solid var(--line)', borderRadius: 'var(--radius-input)',
              fontSize: 13, color: 'var(--ink-900)', outline: 'none', background: '#fff',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
          />
        </label>
      </div>

      {/* List */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24 }}><Skeleton lines={4} height={14} /></div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 4 }}>
              {search ? 'ไม่พบรายการที่ค้นหา' : filter === 'in_progress' ? 'ไม่มีรายวิชาที่ต้องจัดการเอกสาร' : 'ไม่มีรายการ'}
            </div>
            {filter === 'in_progress' && !search && (
              <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>เอกสารครบทุกรายวิชาแล้ว</div>
            )}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {visible.map(({ form, progress }, i) => {
              return (
                <li
                  key={form.course_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(260px, 1fr) minmax(180px, 240px) auto',
                    alignItems: 'center', gap: '12px 20px',
                    padding: '16px 20px',
                    borderTop: i ? '1px solid var(--line-soft)' : 'none',
                  }}
                  className="staff-review-row"
                >
                  {/* รายวิชา */}
                  <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                    <DocIcon done={isDone(progress)} />
                    <div style={{ minWidth: 0 }}>
                      <button
                        onClick={() => openCourse(form)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                          fontSize: 14, fontWeight: 700, color: 'var(--ink-900)',
                        }}
                      >
                        {form.course_code}
                        <span style={{ fontWeight: 500, color: 'var(--ink-400)', fontSize: 12, marginLeft: 6 }}>ตอน {form.section}</span>
                      </button>
                      <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {form.course_title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                        <span>{form.instructor_name || '—'}</span>
                        <span>Lab Boy {form.labboy_accepted}/{form.labboy_slots}</span>
                        <span>ส่งเมื่อ {fmtDate(form.submitted_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* สถานะ / ความคืบหน้า */}
                  <ProgressCell p={progress} />

                  {/* การดำเนินการ */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button size="sm" variant={isDone(progress) ? 'outline' : 'primary'} onClick={() => openCourse(form)}>
                      {isDone(progress) ? 'ดูเอกสาร' : 'จัดการเอกสาร →'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
