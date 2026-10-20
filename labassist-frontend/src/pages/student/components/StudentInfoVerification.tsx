import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Icon } from '../../../components/reports/ReportIcons'
import { studentApi } from '../../../services/api'
import type { StudentInfoComparison, StudentInfoDocument, StudentInfoFieldStr, StudentInfoKind } from '../../../types'
import { isNormalStudentStatus } from '../../../utils/studentStatus'
import type { StudentInfoDocState } from './useStudentInfoDoc'

// ─── Steps ────────────────────────────────────────────────────────────────────

interface FieldSpec {
  label: string
  pick: (cmp: StudentInfoComparison) => StudentInfoFieldStr
  /** Confirming is blocked until this field is read. */
  required?: boolean
  /** Shown small under the main fields; has no profile counterpart. */
  extra?: boolean
  status?: boolean
}

interface StepSpec {
  kind: StudentInfoKind
  title: string
  box: string
  fields: FieldSpec[]
}

// REG shows ข้อมูลส่วนตัว and ข้อมูลนักศึกษา as separate boxes, so each is its
// own screenshot and supplies its own fields.
const STEPS: StepSpec[] = [
  {
    kind: 'personal',
    title: 'หน้าข้อมูลส่วนตัว',
    box: 'ข้อมูลส่วนตัว (Personal Information)',
    fields: [
      { label: 'ชื่อ-นามสกุล (ไทย)', pick: (c) => c.full_name_th, required: true },
      { label: 'ชื่อ-นามสกุล (อังกฤษ)', pick: (c) => c.full_name_en },
    ],
  },
  {
    kind: 'student',
    title: 'หน้าข้อมูลนักศึกษา',
    box: 'ข้อมูลนักศึกษา (Student Information)',
    fields: [
      { label: 'รหัสนักศึกษา', pick: (c) => c.student_id },
      { label: 'สาขาวิชา', pick: (c) => c.faculty },
      { label: 'สถานภาพ', pick: (c) => c.student_status, required: true, status: true },
      { label: 'ระดับการศึกษา', pick: (c) => c.education_level, extra: true },
      { label: 'หลักสูตร', pick: (c) => c.curriculum, extra: true },
      { label: 'วิทยาเขต', pick: (c) => c.campus, extra: true },
    ],
  },
]

function fileNameOf(doc: StudentInfoDocument | undefined, kind: StudentInfoKind): string {
  return (kind === 'personal' ? doc?.personal_file_name : doc?.file_name) ?? ''
}

function confidenceOf(doc: StudentInfoDocument, kind: StudentInfoKind): number {
  return kind === 'personal' ? doc.personal_confidence : doc.confidence
}

// ─── Section ──────────────────────────────────────────────────────────────────

/**
 * The two REG screenshots, each beside the fields read from it, then one
 * summary line and the confirm button.
 */
export function StudentInfoVerification({ info }: { info: StudentInfoDocState }) {
  if (info.isLoading) return null
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {STEPS.map((step, i) => <StepCard key={step.kind} n={i + 1} step={step} info={info} />)}
      </div>
      <Summary info={info} />
    </div>
  )
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ n, step, info }: { n: number; step: StepSpec; info: StudentInfoDocState }) {
  const input = useRef<HTMLInputElement>(null)
  const { doc, cmp } = info
  const fileName = fileNameOf(doc, step.kind)
  const uploading = info.uploadingKind === step.kind
  const attached = !!fileName && !uploading
  const confirmed = !!doc?.confirmed_at
  const lowConfidence = attached && doc && confidenceOf(doc, step.kind) > 0 && confidenceOf(doc, step.kind) < 0.6

  return (
    <section style={{
      background: '#fff', borderRadius: 12, padding: 16,
      border: `1px ${attached ? 'solid' : 'dashed'} var(--line)`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background: attached ? 'var(--green-bg)' : 'var(--line-soft)',
          color: attached ? 'var(--green)' : 'var(--ink-500)',
        }}>
          {attached ? <Icon name="check" size={14} /> : n}
        </span>
        <h4 style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>{step.title}</h4>
        {attached && (
          <Button type="button" size="sm" variant="ghost"
            disabled={info.isUploading || info.isConfirming}
            onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} /> แนบใหม่
          </Button>
        )}
      </header>

      <input ref={input} type="file" accept={info.accept} hidden onChange={info.onFileChange(step.kind)} />

      {!attached ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-600)', margin: 0, lineHeight: 1.6 }}>
            แคปหน้าจอกล่อง <b>{step.box}</b> จากระบบทะเบียน ให้เห็นหัวกล่องและข้อความชัดเจน
          </p>
          <Button type="button" size="sm" loading={uploading}
            disabled={info.isUploading || info.isConfirming}
            onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} /> {uploading ? 'กำลังอ่านรูป…' : 'แนบรูป'}
          </Button>
          {uploading && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>อาจใช้เวลาสักครู่</span>}
        </div>
      ) : (
        <>
          <Preview kind={step.kind} version={`${fileName}|${doc?.updated_at ?? ''}`} />
          {lowConfidence && (
            <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>
              รูปนี้อ่านได้ไม่ค่อยชัด — เทียบค่าด้านล่างกับรูปให้ดี ถ้าผิดให้แนบรูปที่ชัดกว่า
            </p>
          )}
          {cmp && (
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {step.fields.filter((f) => !f.extra).map((f) => (
                <FieldLine key={f.label} spec={f} field={f.pick(cmp)} confirmed={confirmed} />
              ))}
            </dl>
          )}
          {cmp && step.fields.some((f) => f.extra && f.pick(cmp).ocr) && (
            <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {step.fields.filter((f) => f.extra && f.pick(cmp).ocr).map((f) => (
                <span key={f.label}>{f.label}: {f.pick(cmp).ocr}</span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FieldLine({ spec, field, confirmed }: { spec: FieldSpec; field: StudentInfoFieldStr; confirmed: boolean }) {
  const value = field.ocr?.trim()
  const current = field.current?.trim()
  const differs = !!value && !!current && !field.match

  let badge: React.ReactNode = null
  if (!value) {
    badge = <Badge variant={spec.required ? 'red' : 'amber'}>อ่านไม่ได้</Badge>
  } else if (spec.status) {
    badge = isNormalStudentStatus(value) ? <Badge variant="green">สมัครได้</Badge> : <Badge variant="red">สมัครไม่ได้</Badge>
  } else if (field.match) {
    badge = <Badge variant="green">ตรงกับโปรไฟล์</Badge>
  } else if (differs && !confirmed) {
    badge = <Badge variant="amber">จะอัปเดต</Badge>
  }

  return (
    <div>
      <dt style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>{spec.label}</dt>
      <dd style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: value ? 'var(--ink-900)' : 'var(--ink-400)' }}>
          {value || '—'}
        </span>
        {badge}
      </dd>
      {differs && !spec.status && (
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
          ในโปรไฟล์ตอนนี้: <s>{current}</s>
        </div>
      )}
    </div>
  )
}

// The uploaded screenshot, so the student can check the read values against it.
function Preview({ kind, version }: { kind: StudentInfoKind; version: string }) {
  const { data: url } = useQuery({
    queryKey: ['student-info-file', kind, version],
    queryFn: async () => URL.createObjectURL(await studentApi.getStudentInfoFile(kind)),
    staleTime: Infinity,
    gcTime: 0,
  })
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <div style={{ height: 96, borderRadius: 8, background: 'var(--line-soft)' }} />
  return (
    <a href={url} target="_blank" rel="noreferrer" title="เปิดรูปขนาดเต็ม"
      style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--line-soft)' }}>
      <img src={url} alt="รูปที่แนบ" style={{ display: 'block', width: '100%', maxHeight: 140, objectFit: 'cover', objectPosition: 'top left' }} />
    </a>
  )
}

// ─── Summary + confirm ────────────────────────────────────────────────────────

type Tone = 'neutral' | 'amber' | 'red' | 'green'

const toneStyle: Record<Tone, React.CSSProperties> = {
  neutral: { background: '#fff', border: '1px solid var(--line)', color: 'var(--ink-700)' },
  amber: { background: 'var(--amber-bg)', border: '1px solid #FDE68A', color: 'var(--amber)' },
  red: { background: 'var(--red-bg)', border: '1px solid #FECACA', color: 'var(--red)' },
  green: { background: 'var(--green-bg)', border: '1px solid #BBF7D0', color: 'var(--green)' },
}

// The one thing the student should do next, most blocking first.
function nextStep(doc: StudentInfoDocument | undefined, cmp: StudentInfoComparison | undefined): { tone: Tone; text: React.ReactNode; canConfirm: boolean } {
  const missing = STEPS.filter((s) => !fileNameOf(doc, s.kind)).map((s) => s.title)
  if (!doc || !cmp || missing.length === 2) {
    return { tone: 'neutral', text: 'แนบรูปทั้ง 2 หน้าจากระบบทะเบียน ระบบจะอ่านข้อมูลให้อัตโนมัติ', canConfirm: false }
  }
  const confirmed = !!doc.confirmed_at
  const nameMismatch = !!(cmp.full_name_th.ocr && cmp.full_name_th.current && !cmp.full_name_th.match)
  const status = doc.ocr_student_status

  if (confirmed) {
    if (nameMismatch) {
      return { tone: 'red', text: 'ชื่อในโปรไฟล์ไม่ตรงกับเอกสารที่ยืนยันไว้ — แนบเอกสารใหม่และยืนยันอีกครั้งก่อนสมัคร Lab Boy', canConfirm: false }
    }
    return {
      tone: 'green',
      text: `ยืนยันแล้วเมื่อ ${new Date(doc.confirmed_at!).toLocaleDateString('th-TH')} — ถ้าข้อมูลในระบบทะเบียนเปลี่ยน ให้กด "แนบใหม่"`,
      canConfirm: false,
    }
  }
  if (missing.length) {
    return { tone: 'neutral', text: <>แนบ<b>{missing.join(' และ ')}</b>ต่อ จึงจะยืนยันได้</>, canConfirm: false }
  }
  if (!doc.ocr_full_name_th?.trim()) {
    return { tone: 'red', text: 'อ่านชื่อจากหน้าข้อมูลส่วนตัวไม่ได้ — กรุณาแนบรูปที่ชัดกว่า', canConfirm: false }
  }
  if (!status) {
    return { tone: 'amber', text: 'อ่านสถานภาพจากหน้าข้อมูลนักศึกษาไม่ได้ — กรุณาแนบรูปที่เห็นช่องสถานภาพชัดเจน', canConfirm: false }
  }
  if (!isNormalStudentStatus(status)) {
    return { tone: 'red', text: <>สถานภาพในเอกสารคือ <b>{status}</b> — สมัคร Lab Boy ได้เฉพาะนักศึกษาสถานภาพปกติ</>, canConfirm: true }
  }
  return { tone: 'neutral', text: 'ตรวจว่าข้อมูลที่อ่านได้ตรงกับรูป แล้วกดยืนยัน — ช่องที่ขึ้น "จะอัปเดต" จะถูกแก้ในโปรไฟล์ให้ตรงกับเอกสาร', canConfirm: true }
}

function Summary({ info }: { info: StudentInfoDocState }) {
  const { doc, cmp } = info
  const step = nextStep(doc, cmp)
  return (
    <div style={{
      ...toneStyle[step.tone], borderRadius: 10, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <Icon name={step.tone === 'green' ? 'check' : step.tone === 'neutral' ? 'file' : 'alert'} size={18} />
      <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.6 }}>{step.text}</span>
      {doc && !doc.confirmed_at && (
        <Button loading={info.isConfirming} disabled={!step.canConfirm || info.isUploading} onClick={() => info.confirm(true)}>
          ยืนยันข้อมูล
        </Button>
      )}
    </div>
  )
}
