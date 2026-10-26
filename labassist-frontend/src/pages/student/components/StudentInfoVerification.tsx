import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Icon } from '../../../components/reports/ReportIcons'
import { studentApi } from '../../../services/api'
import type { StudentInfoComparison, StudentInfoDocument, StudentInfoFieldStr } from '../../../types'
import { isNormalStudentStatus } from '../../../utils/studentStatus'
import type { StudentInfoDocState } from './useStudentInfoDoc'

// ─── Fields ───────────────────────────────────────────────────────────────────

interface FieldSpec {
  label: string
  pick: (cmp: StudentInfoComparison) => StudentInfoFieldStr
}

// The document only verifies the status; name, ID and department are the
// student's own entries in the profile. The rest is shown for reference.
const STATUS: FieldSpec = { label: 'สถานภาพนักศึกษา', pick: (c) => c.student_status }
const REFERENCE: FieldSpec[] = [
  { label: 'รหัสนักศึกษา', pick: (c) => c.student_id },
  { label: 'ชื่อ', pick: (c) => c.full_name_th },
]

// ─── Section ──────────────────────────────────────────────────────────────────

/**
 * The REG profile-card screenshot beside the fields read from it, then one
 * summary line and the confirm button.
 */
export function StudentInfoVerification({ info }: { info: StudentInfoDocState }) {
  if (info.isLoading) return null
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CardUpload info={info} />
      <Summary info={info} />
    </div>
  )
}

// ─── Upload card ──────────────────────────────────────────────────────────────

function CardUpload({ info }: { info: StudentInfoDocState }) {
  const input = useRef<HTMLInputElement>(null)
  const { doc, cmp } = info
  const fileName = doc?.file_name ?? ''
  const uploading = info.isUploading
  const attached = !!fileName && !uploading
  const lowConfidence = attached && doc && doc.confidence > 0 && doc.confidence < 0.6
  const extras = cmp ? REFERENCE.filter((f) => f.pick(cmp).ocr) : []

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
          background: attached ? 'var(--green-bg)' : 'var(--line-soft)',
          color: attached ? 'var(--green)' : 'var(--ink-500)',
        }}>
          <Icon name={attached ? 'check' : 'file'} size={14} />
        </span>
        <h4 style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>การ์ดโปรไฟล์จากระบบทะเบียน</h4>
        {attached && (
          <Button type="button" size="sm" variant="ghost"
            disabled={info.isUploading || info.isConfirming}
            onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} /> แนบใหม่
          </Button>
        )}
      </header>

      <input ref={input} type="file" accept={info.accept} hidden onChange={info.onFileChange} />

      {!attached ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-600)', margin: 0, lineHeight: 1.6 }}>
              แคปหน้าจอ<b>การ์ดโปรไฟล์ด้านซ้ายบน</b>ของระบบทะเบียน (reg.su.ac.th) ให้เห็นบรรทัดสถานภาพนักศึกษาชัดเจน ดูตัวอย่างได้ที่รูปด้านข้าง
            </p>
            <Button type="button" size="sm" loading={uploading}
              disabled={info.isUploading || info.isConfirming}
              onClick={() => input.current?.click()}>
              <Icon name="upload" size={14} /> {uploading ? 'กำลังอ่านรูป…' : 'แนบรูป'}
            </Button>
            {uploading && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>อาจใช้เวลาสักครู่ ไปหน้าอื่นได้ ระบบจะแจ้งเมื่ออ่านเสร็จ</span>}
            {info.uploadError && <span role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{info.uploadError}</span>}
          </div>
          <ExampleCard />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Preview version={`${fileName}|${doc?.updated_at ?? ''}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lowConfidence && (
              <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>
                รูปนี้อ่านได้ไม่ค่อยชัด — เทียบค่าด้านล่างกับรูปให้ดี ถ้าผิดให้แนบรูปที่ชัดกว่า
              </p>
            )}
            {cmp && (
              <dl style={{ margin: 0 }}>
                <StatusLine value={STATUS.pick(cmp).ocr} />
              </dl>
            )}
            {cmp && extras.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {extras.map((f) => <span key={f.label}>{f.label}: {f.pick(cmp).ocr}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function StatusLine({ value }: { value?: string | null }) {
  const v = value?.trim()
  return (
    <div>
      <dt style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>{STATUS.label}</dt>
      <dd style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: v ? 'var(--ink-900)' : 'var(--ink-400)' }}>{v || '—'}</span>
        {!v ? <Badge variant="red">อ่านไม่ได้</Badge>
          : isNormalStudentStatus(v) ? <Badge variant="green">สมัครได้</Badge>
          : <Badge variant="red">สมัครไม่ได้</Badge>}
      </dd>
    </div>
  )
}

// A mock of the REG profile card with placeholder data, so the student knows
// what to capture. Drawn rather than a real screenshot to keep anyone's
// personal details out of the bundle; the status line the OCR reads is ringed.
function ExampleCard() {
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>ตัวอย่างรูปที่ต้องแนบ</figcaption>
      <div aria-hidden style={{
        position: 'relative', border: '1px solid var(--line)', borderRadius: 8, background: '#fff',
        textAlign: 'center', overflow: 'hidden', maxWidth: 260, width: '100%',
      }}>
        <span style={{
          position: 'absolute', top: 6, right: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1,
          color: 'var(--ink-400)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px',
        }}>ตัวอย่าง</span>
        <div style={{ padding: '14px 12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 52, height: 52, borderRadius: '50%', background: 'var(--line-soft)', color: 'var(--ink-400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
          }}>
            <Icon name="user" size={26} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0F766E' }}>นักศึกษา</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-500)' }}>6607XXXXX</span>
          <span style={{ fontSize: 12, color: 'var(--ink-700)' }}>นายตัวอย่าง นามสมมติ</span>
          <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>tuayang namsommut</span>
          <span style={{
            marginTop: 6, padding: '4px 8px', borderRadius: 6, outline: '2px solid var(--red)', outlineOffset: 2,
            fontSize: 12, fontWeight: 700, color: '#1D4ED8', lineHeight: 1.5,
          }}>
            สถานภาพนักศึกษา : นักศึกษาปัจจุบัน<br />สถานะปกติ
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px', fontSize: 11, color: 'var(--ink-500)' }}>
          XXXXXXXX_X@su.ac.th
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--red)' }}>บรรทัดในกรอบแดงต้องอ่านออกชัดเจน</span>
    </figure>
  )
}

// The uploaded screenshot, so the student can check the read values against it.
function Preview({ version }: { version: string }) {
  const { data: url } = useQuery({
    queryKey: ['student-info-file', version],
    queryFn: async () => URL.createObjectURL(await studentApi.getStudentInfoFile()),
    staleTime: Infinity,
    gcTime: 0,
  })
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <div style={{ height: 96, borderRadius: 8, background: 'var(--line-soft)' }} />
  return (
    <a href={url} target="_blank" rel="noreferrer" title="เปิดรูปขนาดเต็ม"
      style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--line-soft)' }}>
      <img src={url} alt="รูปที่แนบ" style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain' }} />
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
  if (!doc || !cmp || !doc.file_name) {
    return { tone: 'neutral', text: 'แนบรูปการ์ดโปรไฟล์จากระบบทะเบียน ระบบจะอ่านข้อมูลให้อัตโนมัติ', canConfirm: false }
  }
  const status = doc.ocr_student_status

  if (doc.confirmed_at) {
    return {
      tone: 'green',
      text: `ยืนยันแล้วเมื่อ ${new Date(doc.confirmed_at!).toLocaleDateString('th-TH')} — ถ้าข้อมูลในระบบทะเบียนเปลี่ยน ให้กด "แนบใหม่"`,
      canConfirm: false,
    }
  }
  if (!status) {
    return { tone: 'amber', text: 'อ่านสถานภาพจากรูปไม่ได้ — กรุณาแนบรูปที่เห็นบรรทัดสถานภาพนักศึกษาชัดเจน', canConfirm: false }
  }
  if (!isNormalStudentStatus(status)) {
    return { tone: 'red', text: <>สถานภาพในเอกสารคือ <b>{status}</b> — สมัคร Lab Boy ได้เฉพาะนักศึกษาสถานภาพปกติ</>, canConfirm: true }
  }
  return { tone: 'neutral', text: 'ตรวจว่าสถานภาพที่อ่านได้ตรงกับรูป แล้วกดยืนยัน', canConfirm: true }
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
        <Button loading={info.isConfirming} disabled={!step.canConfirm || info.isUploading} onClick={() => info.confirm()}>
          ยืนยันสถานภาพ
        </Button>
      )}
    </div>
  )
}
