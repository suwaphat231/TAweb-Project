import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { studentApi } from '../../../services/api'
import { useAuth } from '../../../hooks/useAuth'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Button } from '../../../components/ui/Button'
import { Avatar } from '../../../components/ui/Avatar'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Skeleton } from '../../../components/ui/Skeleton'
import { Icon } from '../../../components/reports/ReportIcons'
import { useToast } from '../../../hooks/useToast'
import { StudentInfoVerification } from './StudentInfoVerification'
import { useStudentInfoDoc } from './useStudentInfoDoc'
import { isNormalStudentStatus } from '../../../utils/studentStatus'
import { toDMY } from '../../../utils/thaiDate'

export function ProfileInfoTab() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const avatarInput = useRef<HTMLInputElement>(null)

  const avatarMut = useMutation({
    mutationFn: studentApi.uploadAvatar,
    onSuccess: (updated) => {
      setUser(updated)
      qc.setQueryData(['student-profile'], updated)
      showToast('เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว', 'success')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(message ?? 'เปลี่ยนรูปไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const [draft, setDraft] = useState<Partial<Record<'name_prefix' | 'full_name' | 'full_name_en' | 'student_id' | 'faculty' | 'phone', string>>>({})
  const [isEditing, setIsEditing] = useState(false)
  const info = useStudentInfoDoc()

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: studentApi.profile,
  })

  const p = profile ?? user

  const form = {
    name_prefix: p?.name_prefix ?? '',
    full_name: p?.full_name ?? '',
    full_name_en: p?.full_name_en ?? '',
    student_id: p?.student_id ?? '',
    faculty: p?.faculty ?? '',
    phone: p?.phone ?? '',
    ...draft,
  }

  const updateMut = useMutation({
    mutationFn: (data: { name_prefix: string; full_name: string; full_name_en: string; student_id: string; faculty: string; phone: string }) =>
      studentApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      setDraft({})
      setIsEditing(false)
      qc.setQueryData(['student-profile'], updated)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name_prefix) {
      showToast('กรุณาเลือกคำนำหน้าชื่อ (นาย หรือ นางสาว)', 'error')
      return
    }
    updateMut.mutate({
      name_prefix: form.name_prefix,
      full_name: form.full_name,
      full_name_en: form.full_name_en.trim(),
      student_id: form.student_id.trim(),
      faculty: form.faculty,
      phone: form.phone.trim(),
    })
  }

  const status = studentStatus(info.doc?.ocr_student_status, info.doc?.confirmed_at, !!info.doc)

  const readiness = [
    { done: !!(p?.name_prefix && p?.full_name && p?.student_id && p?.faculty && p?.phone), label: 'ข้อมูลส่วนตัวครบ', hint: 'คำนำหน้าชื่อ ชื่อ รหัสนักศึกษา ภาควิชา และเบอร์ติดต่อ' },
    { done: status.variant === 'green', label: 'ยืนยันสถานภาพปกติ', hint: 'แนบรูปการ์ดโปรไฟล์จากระบบทะเบียนแล้วกดยืนยัน' },
    { done: Object.keys(p?.transcript_grades ?? {}).length > 0, label: 'ยื่นใบเกรดแล้ว', hint: 'ใช้แทนการแนบรูปเกรดตอนสมัคร', to: '/student/grade-check' },
  ]
  const readyCount = readiness.filter((r) => r.done).length

  return (
    <div className="profile-layout">
      {/* Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 56, background: 'var(--primary-50)', borderBottom: '1px solid var(--primary-100)' }} aria-hidden="true" />
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -44 }}>
            {profileLoading ? (
              <Skeleton height={88} width={88} borderRadius={999} />
            ) : (
              <div style={{ position: 'relative' }}>
                <Avatar src={p?.avatar_url} size={88} style={{ border: '4px solid #fff', boxShadow: 'var(--shadow-md)' }} />
                <button
                  type="button"
                  className="profile-avatar-btn"
                  onClick={() => avatarInput.current?.click()}
                  disabled={avatarMut.isPending}
                  aria-label="เปลี่ยนรูปโปรไฟล์ (JPG หรือ PNG ไม่เกิน 5 MB)"
                  title="เปลี่ยนรูปโปรไฟล์"
                >
                  {avatarMut.isPending ? <span className="profile-spinner" aria-hidden="true" /> : <CameraIcon />}
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="เลือกรูปโปรไฟล์"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                      showToast('กรุณาเลือกไฟล์ JPG หรือ PNG ขนาดไม่เกิน 5 MB', 'error')
                      return
                    }
                    avatarMut.mutate(file)
                  }}
                />
              </div>
            )}
            {profileLoading ? <div style={{ width: '100%', marginTop: 16 }}><Skeleton lines={2} height={14} /></div> : (
              <>
                <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.35, marginTop: 14 }}>{p?.display_name || p?.full_name || '—'}</div>
                {p?.full_name_en && <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{p.full_name_en}</div>}
                {p?.student_id && <div style={{ fontSize: 14, color: 'var(--ink-600)', fontVariantNumeric: 'tabular-nums' }}>{p.student_id}</div>}
                {p?.faculty && <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{p.faculty}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
                  <Badge variant={status.variant} showDot>{status.short}</Badge>                </div>
              </>
            )}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>ความพร้อมในการสมัคร Lab Boy</h2>
            <span style={{ fontSize: 13, fontWeight: 700, color: readyCount === readiness.length ? 'var(--green)' : 'var(--ink-500)' }}>
              {readyCount}/{readiness.length}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden', marginBottom: 14 }}
            role="progressbar" aria-valuemin={0} aria-valuemax={readiness.length} aria-valuenow={readyCount} aria-label="ความพร้อมในการสมัคร">
            <div style={{ height: '100%', width: `${(readyCount / readiness.length) * 100}%`, borderRadius: 999, background: readyCount === readiness.length ? 'var(--green)' : 'var(--primary)' }} />
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {readiness.map((r) => (
              <li key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: r.done ? 'var(--green)' : '#fff', color: '#fff',
                  border: r.done ? 'none' : '2px solid var(--line)',
                }}>
                  {r.done && <Icon name="check" size={13} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: r.done ? 'var(--ink-900)' : 'var(--ink-700)' }}>
                    {r.label}<span className="sr-only">{r.done ? ' (เสร็จแล้ว)' : ' (ยังไม่เสร็จ)'}</span>
                  </div>
                  {!r.done && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                      {r.to ? <Link to={r.to} style={{ color: 'var(--primary)', fontWeight: 600 }}>{r.hint} →</Link> : r.hint}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Personal info + verification document */}
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SectionTitle icon="user" title="ข้อมูลส่วนตัว" />
          {!isEditing && !profileLoading && (
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              แก้ไขข้อมูล
            </Button>
          )}
        </div>

        {profileLoading ? (
          <Skeleton lines={4} height={16} />
        ) : !isEditing ? (
          <dl className="profile-fields">
            <InfoRow label="คำนำหน้าชื่อ" value={p?.name_prefix || undefined} />
            <InfoRow label="ชื่อ-นามสกุล (ภาษาไทย)" value={p?.full_name} />
            <InfoRow label="ชื่อ-นามสกุล (ภาษาอังกฤษ)" value={p?.full_name_en} />
            <InfoRow label="รหัสนักศึกษา" value={p?.student_id} />
            <InfoRow label="ภาควิชา" value={p?.faculty} />
            <InfoRow label="เบอร์ติดต่อ" value={formatPhone(p?.phone)} />
            <InfoRow label="อีเมล (ใช้สำหรับเข้าสู่ระบบ)" value={p?.email} />
            <div>
              <dt style={labelStyle}>สถานภาพนักศึกษา</dt>
              <dd style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <Badge variant={status.variant} wrap>{status.label}</Badge>
                {status.note && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{status.note}</span>}
              </dd>
            </div>
          </dl>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="profile-fields">
              <Select
                disabled={updateMut.isPending}
                label="คำนำหน้าชื่อ *"
                value={form.name_prefix}
                onChange={(e) => setDraft((f) => ({ ...f, name_prefix: e.target.value }))}
                required
                options={[
                  { value: '', label: '— เลือกคำนำหน้า —' },
                  { value: 'นาย', label: 'นาย' },
                  { value: 'นางสาว', label: 'นางสาว' },
                ]}
              />
              <Input
                readOnly={updateMut.isPending}
                label="ชื่อ-นามสกุล (ภาษาไทย) *"
                placeholder="เช่น สมชาย ใจดี"
                value={form.full_name}
                onChange={(e) => setDraft((f) => ({ ...f, full_name: e.target.value }))}
                required
                autoComplete="name"
                hint="ไม่ต้องใส่คำนำหน้า"
              />
              <Input
                readOnly={updateMut.isPending}
                label="ชื่อ-นามสกุล (ภาษาอังกฤษ)"
                placeholder="เช่น Somchai Jaidee"
                value={form.full_name_en}
                onChange={(e) => setDraft((f) => ({ ...f, full_name_en: e.target.value }))}
                autoComplete="off"
                lang="en"
                hint="ตัวอักษรภาษาอังกฤษตามที่ระบบทะเบียนสะกด"
              />
              <Input
                readOnly={updateMut.isPending}
                label="รหัสนักศึกษา"
                value={form.student_id}
                onChange={(e) => setDraft((f) => ({ ...f, student_id: toStudentIdDigits(e.target.value) }))}
                placeholder="เช่น 660710260"
                inputMode="numeric"
                maxLength={10}
              />
              <Select
                disabled={updateMut.isPending}
                label="ภาควิชา"
                value={form.faculty}
                onChange={(e) => setDraft((f) => ({ ...f, faculty: e.target.value }))}
                options={[
                  { value: '', label: '— เลือกภาควิชา —' },
                  { value: 'เทคโนโลยีสารสนเทศ', label: 'เทคโนโลยีสารสนเทศ (IT)' },
                  { value: 'วิทยาการคอมพิวเตอร์', label: 'วิทยาการคอมพิวเตอร์ (CS)' },
                ]}
              />
              <Input
                readOnly={updateMut.isPending}
                label="เบอร์ติดต่อ"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setDraft((f) => ({ ...f, phone: e.target.value }))}
                placeholder="08xxxxxxxx"
              />
              <Input
                label="อีเมล (ใช้สำหรับเข้าสู่ระบบ)"
                value={p?.email ?? ''}
                disabled
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              ชื่อ-นามสกุลและสถานภาพนักศึกษายึดตามเอกสารจากระบบทะเบียนที่แนบด้านล่าง
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="ghost"
                disabled={updateMut.isPending}
                onClick={() => {
                  setDraft({})
                  setIsEditing(false)
                }}
              >
                ยกเลิก
              </Button>
              <Button type="submit" loading={updateMut.isPending} disabled={avatarMut.isPending}>
                บันทึกการเปลี่ยนแปลง
              </Button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 24, padding: 20, borderRadius: 12, background: 'var(--line-soft)' }}>
          <SectionTitle icon="file" title="เอกสารยืนยันจากระบบทะเบียน" inset
            hint="แนบรูปการ์ดโปรไฟล์จากระบบทะเบียน 1 รูป (PDF, JPG หรือ PNG) เพื่อตรวจสถานภาพ — ต้องเป็นสถานภาพปกติจึงจะสมัคร Lab Boy ได้" />
          <StudentInfoVerification info={info} />
        </div>
      </Card>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ink-500)' }

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <span style={{ fontSize: 15, color: value ? 'var(--ink-900)' : 'var(--ink-400)', wordBreak: 'break-all' }}>
          {value || '—'}
        </span>
      </dd>
    </div>
  )
}

function SectionTitle({ icon, title, hint, inset }: { icon: 'user' | 'file'; title: string; hint?: string; inset?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 220 }}>
      <span style={{ width: 36, height: 36, borderRadius: 8, background: inset ? '#fff' : 'var(--primary-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.4 }}>{title}</h2>
        {hint && <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>{hint}</p>}
      </div>
    </div>
  )
}

/**
 * สถานภาพนักศึกษา comes only from the confirmed registrar document; a
 * student cannot type it. Only สถานภาพปกติ may apply for Lab Boy.
 */
function studentStatus(status: string | undefined, confirmedAt: string | undefined, hasDoc: boolean): {
  variant: BadgeVariant; short: string; label: string; note?: string
} {
  if (status && confirmedAt) {
    const normal = isNormalStudentStatus(status)
    return {
      variant: normal ? 'green' : 'red',
      short: `สถานภาพ ${status}`,
      label: status,
      note: `ยืนยันจากเอกสารเมื่อ ${toDMY(confirmedAt.slice(0, 10))}${normal ? '' : ' · สมัคร Lab Boy ได้เฉพาะสถานภาพปกติ'}`,
    }
  }
  if (hasDoc) return { variant: 'amber', short: 'รอยืนยันสถานภาพ', label: 'รอยืนยันข้อมูลจากเอกสารด้านล่าง' }
  return { variant: 'gray', short: 'ยังไม่ยืนยันสถานภาพ', label: 'ยังไม่ได้ยืนยัน — แนบเอกสารด้านล่างเพื่อยืนยันสถานภาพ' }
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

/**
 * Keeps only digits, turning Thai digits (๐-๙) into 0-9. Typing with the Thai
 * keyboard layout otherwise slips in marks like "ุ" (the 6 key).
 */
function toStudentIdDigits(value: string): string {
  return value
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/\D/g, '')
    .slice(0, 10)
}

/** "0812345678" → "081-234-5678" for display. */
function formatPhone(phone?: string): string {
  if (!phone) return ''
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
  if (phone.length === 9) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`
  return phone
}
