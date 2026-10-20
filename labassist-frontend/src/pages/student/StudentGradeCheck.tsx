import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { studentApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { Badge, type BadgeVariant } from '../../components/ui/Badge'
import { Icon } from '../../components/reports/ReportIcons'
import { cleanCourseTitle } from '../../utils/courseTitle'

const statusBadges: Record<string, { variant: BadgeVariant; label: string }> = {
  pass: { variant: 'green', label: 'อ่านข้อมูลสำเร็จ' },
  needs_review: { variant: 'amber', label: 'ควรตรวจสอบข้อมูลอีกครั้ง' },
  fail: { variant: 'red', label: 'อ่านข้อมูลไม่สำเร็จ' },
}

const ACCEPTED_FILE = /\.(png|jpe?g|pdf)$/i

export default function StudentGradeCheck() {
  const fileInputId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pdpaConsent, setPdpaConsent] = useState(false)
  const [consentError, setConsentError] = useState('')
  const { setUser } = useAuth()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['student-profile'], queryFn: studentApi.profile })
  // Same query as the apply page's "ทั้งหมด" filter, so the cache is shared.
  const { data: catalog = [] } = useQuery({
    queryKey: ['student-courses', ''],
    queryFn: () => studentApi.courses({ status: undefined }),
  })
  const openCodes = new Set(catalog.filter((c) => c.status === 'open' || c.status === 'closing_soon').map((c) => c.code))
  const upload = useMutation({
    mutationFn: studentApi.ocrTranscript,
    onSuccess: (result) => {
      setUser(result.user)
      qc.setQueryData(['student-profile'], result.user)
      setFile(null)
    },
  })

  const result = upload.data
  const status = result?.status ?? profile.data?.transcript_status
  const message = result?.message ?? profile.data?.transcript_message
  const updatedAt = result?.updated_at ?? profile.data?.transcript_updated_at
  // The OCR looks for every course in the system, so list only the ones it
  // found.
  const titles = profile.data?.transcript_course_titles ?? {}
  const courses = (result?.courses ?? Object.entries(profile.data?.transcript_grades ?? {}).map(([code, grade]) => ({
    code, title: titles[code] ?? '', grade, found: true,
  }))).filter((course) => course.found)
    // Courses open for Lab Boy applications first — their grade is ready to use.
    .sort((a, b) => Number(openCodes.has(b.code)) - Number(openCodes.has(a.code)) || a.code.localeCompare(b.code))
  const openCount = courses.filter((course) => openCodes.has(course.code)).length
  const uploadError = isAxiosError<{ error?: string }>(upload.error)
    ? upload.error.response?.data?.error
    : undefined
  const statusBadge = status ? statusBadges[status] : undefined

  function pickFile(selected: File | null) {
    setFile(selected)
    setFileError(selected && !ACCEPTED_FILE.test(selected.name) ? 'กรุณาเลือกไฟล์ PNG, JPG หรือ PDF' : '')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>ตรวจสอบเกรด</h1>
        <p style={{ color: 'var(--ink-500)', fontSize: 14, maxWidth: 720 }}>
          อัปโหลดใบเกรดครั้งเดียว ระบบจะเก็บเกรดรายวิชาไว้ เมื่อสมัครวิชาที่ต้องแนบรูปภาพเกรด ระบบจะใช้เกรดที่นี่ให้ทันทีโดยไม่ต้องแนบรูปซ้ำ
        </p>
      </div>

      <Card style={{ padding: 24 }}>
        <SectionTitle icon="upload" title="อัปโหลดใบเกรด" hint="ทรานสคริปต์หรือภาพหน้าผลการเรียนจาก MyReg — อัปโหลดหลายไฟล์ได้ เกรดจะถูกรวมกัน" />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!pdpaConsent) {
              setConsentError('กรุณายืนยันความยินยอมก่อนส่งเอกสาร')
              return
            }
            if (file && !fileError) upload.mutate(file)
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}
        >
          {file ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px',
              border: `1.5px solid ${fileError ? 'var(--red)' : 'var(--primary-100)'}`, borderRadius: 10, background: 'var(--primary-50)',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="file" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{Math.max(1, Math.round(file.size / 1024))} KB</div>
              </div>
              <button type="button" className="report-icon-btn" disabled={upload.isPending}
                onClick={() => pickFile(null)} aria-label={`เอาไฟล์ ${file.name} ออก`}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ) : (
            <label
              htmlFor={fileInputId}
              className={`grade-dropzone${dragging ? ' is-dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pickFile(event.dataTransfer.files?.[0] ?? null)
              }}
            >
              <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <Icon name="upload" size={22} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>
                ลากไฟล์มาวางที่นี่ หรือ <span style={{ color: 'var(--primary)', textDecoration: 'underline' }}>เลือกไฟล์</span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>PNG, JPG หรือ PDF</span>
            </label>
          )}
          <input id={fileInputId} type="file" accept=".png,.jpg,.jpeg,.pdf" className="sr-only" disabled={upload.isPending}
            onChange={(event) => { pickFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
          {fileError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{fileError}</p>}

          <div style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10, background: 'var(--line-soft)' }} role="note">
            <Icon name="alert" size={18} style={{ color: 'var(--primary)', marginTop: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)', marginBottom: 2 }}>คำแจ้งการคุ้มครองข้อมูลส่วนบุคคล</p>
                <p style={{ fontSize: 13, color: 'var(--ink-600)' }}>
                  เอกสารอาจมีข้อมูลส่วนบุคคล เช่น ชื่อ รหัสนักศึกษา และผลการเรียน ระบบจะส่งไปอ่านด้วย OCR เพื่อตรวจสอบคุณสมบัติการสมัคร แล้วเก็บเฉพาะผลการอ่านไว้ในบัญชีของคุณ
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--ink-700)', cursor: upload.isPending ? 'not-allowed' : 'pointer', minHeight: 24 }}>
                <input
                  type="checkbox"
                  checked={pdpaConsent}
                  disabled={upload.isPending}
                  onChange={(event) => {
                    setPdpaConsent(event.target.checked)
                    if (event.target.checked) setConsentError('')
                  }}
                  style={{ marginTop: 4, width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0 }}
                />
                <span>ฉันรับทราบและยินยอมให้ระบบเก็บและประมวลผลเอกสารตามวัตถุประสงค์นี้</span>
              </label>
              {consentError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{consentError}</p>}
            </div>
          </div>

          {upload.isError && (
            <p role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>
              <Icon name="alert" size={16} />
              {uploadError ?? 'ไม่สามารถอ่านใบเกรดได้ กรุณาลองใหม่อีกครั้ง'}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button type="submit" loading={upload.isPending} disabled={!file || !!fileError || !pdpaConsent}>อ่านใบเกรด</Button>
            {upload.isPending && (
              <span role="status" style={{ fontSize: 13, color: 'var(--ink-500)' }}>กำลังอ่านใบเกรด อาจใช้เวลาประมาณ 30 วินาที…</span>
            )}
          </div>
        </form>
      </Card>

      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <SectionTitle icon="book" title="ผลการอ่านเกรดล่าสุด"
            hint={updatedAt ? `อัปเดตเมื่อ ${new Date(updatedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : undefined} />
          {statusBadge && <Badge variant={statusBadge.variant} showDot>{statusBadge.label}</Badge>}
        </div>

        {profile.isLoading ? <div style={{ marginTop: 16 }}><Skeleton lines={3} /></div> : profile.isError && !result ? (
          <div role="alert" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, color: 'var(--ink-600)' }}>โหลดผลการอ่านเกรดไม่สำเร็จ</p>
            <Button variant="outline" size="sm" onClick={() => profile.refetch()}>ลองอีกครั้ง</Button>
          </div>
        ) : (
          <div aria-live="polite" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {message && status !== 'pass' && (
              <p style={{ fontSize: 13, color: 'var(--ink-600)' }}>{message}</p>
            )}
            {courses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', border: '1.5px dashed var(--line)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--ink-400)', marginBottom: 10 }}><Icon name="file" size={32} /></div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-700)' }}>ยังไม่มีข้อมูลเกรด</p>
                <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>อัปโหลดใบเกรดด้านบนเพื่อเริ่มต้น</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <Stat label="วิชาที่อ่านได้" value={courses.length} />
                  <Stat label="เปิดรับสมัครอยู่ตอนนี้" value={openCount} highlight={openCount > 0} />
                </div>
                {openCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 10, background: 'var(--green-bg)', border: '1px solid #BBF7D0' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-700)' }}>
                      <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
                      สมัครวิชาที่เปิดรับได้โดยใช้เกรดนี้ ไม่ต้องแนบรูปภาพเกรดเพิ่ม
                    </span>
                    <Link to="/student/apply" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--primary)', minHeight: 32 }}>
                      ไปสมัคร Lab Boy <Icon name="chevron-right" size={14} />
                    </Link>
                  </div>
                )}
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'var(--line-soft)' }}>
                        <th scope="col" style={thStyle}>รหัสวิชา</th>
                        <th scope="col" style={thStyle}>รายวิชา</th>
                        <th scope="col" style={{ ...thStyle, textAlign: 'center' }}>เกรด</th>
                      </tr>
                    </thead>
                    <tbody>{courses.map((course) => {
                      const isOpen = openCodes.has(course.code)
                      return (
                        <tr key={course.code} style={{ borderTop: '1px solid var(--line-soft)', background: isOpen ? 'var(--green-bg)' : undefined }}>
                          <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{course.code}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--ink-700)' }}>{course.title ? cleanCourseTitle(course.title) : '—'}</span>
                              {isOpen && <Badge variant="green" showDot>เปิดรับสมัครอยู่</Badge>}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, height: 32, padding: '0 8px',
                              borderRadius: 8, background: '#fff', border: '1px solid var(--line)', fontWeight: 700, color: 'var(--ink-900)',
                            }}>{course.grade}</span>
                          </td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                  เกรดอ่านด้วย OCR — หากไม่ตรงกับเอกสารต้นฉบับ ให้อัปโหลดไฟล์ที่ชัดกว่าเดิมอีกครั้ง ระบบจะใช้ผลล่าสุดแทน
                </p>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function SectionTitle({ icon, title, hint }: { icon: 'upload' | 'book'; title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.4 }}>{title}</h2>
        {hint && <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>{hint}</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line)', background: highlight ? 'var(--green-bg)' : '#fff' }}>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: highlight ? 'var(--green)' : 'var(--ink-900)' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{label}</div>
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
