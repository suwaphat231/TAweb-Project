import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'

export default function StudentProfile() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({ full_name: '', year: '', faculty: '' })
  const [gradeFile, setGradeFile] = useState<File | null>(null)
  const gradeFileInputRef = useRef<HTMLInputElement>(null)

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: studentApi.profile,
  })

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const updateMut = useMutation({
    mutationFn: (data: { full_name: string; year: number; faculty: string }) =>
      studentApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => studentApi.uploadTranscript(file),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      if (updated.transcript_status === 'pass') {
        showToast('อ่านใบเกรดสำเร็จ ผ่านการตรวจสอบ', 'success')
      } else if (updated.transcript_status === 'needs_review') {
        showToast('อ่านใบเกรดสำเร็จ แต่ต้องการการตรวจสอบเพิ่มเติม', 'warning')
      } else {
        showToast(updated.transcript_message ?? 'อ่านใบเกรดไม่ผ่านเกณฑ์', 'error')
      }
    },
    onError: () => showToast('เกิดข้อผิดพลาดในการประมวลผลใบเกรดด้วย OCR', 'error'),
  })

  const p = profile ?? user

  function openEdit() {
    setForm({
      full_name: p?.full_name ?? '',
      year: String(p?.year ?? ''),
      faculty: p?.faculty ?? '',
    })
    setGradeFile(null)
    setShowEdit(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tasks: Promise<unknown>[] = [
      updateMut.mutateAsync({ full_name: form.full_name, year: Number(form.year) || 0, faculty: form.faculty }),
    ]
    if (gradeFile) {
      tasks.push(uploadMut.mutateAsync(gradeFile))
    }
    await Promise.allSettled(tasks)
    setShowEdit(false)
  }

  const gpa = p?.gpa ?? 0
  const gpaPercent = Math.min(100, (gpa / 4) * 100)

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>ข้อมูลส่วนตัว</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }}>
        {/* Left column */}
        <Card style={{ padding: 24, textAlign: 'center' }}>
          {profileLoading ? (
            <Skeleton height={64} borderRadius={999} width={64} />
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <Avatar initials={getInitials(p?.full_name ?? '?')} color="blue" size={72} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{p?.full_name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 12 }}>{p?.email}</div>

              {/* GPA bar */}
              {gpa > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>GPA</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{gpa.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: gpaPercent >= 75 ? 'var(--green)' : gpaPercent >= 50 ? 'var(--primary)' : 'var(--amber, #F59E0B)',
                      width: `${gpaPercent}%`,
                      transition: 'width .5s',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 3, textAlign: 'right' }}>จาก 4.00</div>
                </div>
              )}

              {/* Info list */}
              <div style={{ textAlign: 'left', marginBottom: 18 }}>
                <InfoRow label="รหัสนักศึกษา" value={p?.student_id ?? '—'} />
                <InfoRow label="ชั้นปี" value={p?.year ? `ปีที่ ${p.year}` : '—'} />
                <InfoRow label="คณะ / ภาควิชา" value={p?.faculty ?? '—'} />
              </div>

              {p?.transcript_status && (
                <div style={{ textAlign: 'left', marginBottom: 18, padding: 12, borderRadius: 8, background: '#F8F9FB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>ผลตรวจสอบใบเกรด (OCR)</span>
                    <StatusBadge value={p.transcript_status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 8 }}>{p.transcript_message}</div>
                  {p.transcript_confidence != null && (
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 8 }}>
                      ความมั่นใจในการอ่าน: {Math.round(p.transcript_confidence * 100)}%
                    </div>
                  )}
                  {p.transcript_grades && Object.keys(p.transcript_grades).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(p.transcript_grades).map(([code, grade]) => (
                        <span key={code} style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--ink-700)',
                          background: '#fff', border: '1px solid var(--line-soft)',
                          borderRadius: 6, padding: '3px 8px',
                        }}>
                          {code}: {grade}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={openEdit} style={{ width: '100%' }}>แก้ไขข้อมูล</Button>
            </>
          )}
        </Card>

        {/* Right column: application history */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>ประวัติการสมัคร</span>
            <span style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 8 }}>{apps.length} รายการ</span>
          </div>
          {appsLoading ? (
            <div style={{ padding: 20 }}><Skeleton lines={5} height={20} /></div>
          ) : apps.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-400)', fontSize: 14 }}>ยังไม่มีประวัติการสมัคร</div>
          ) : (
            apps.map((app, i) => (
              <div key={app.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 20px',
                borderBottom: i < apps.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{app.course_code}</span>
                    <StatusBadge value={app.role_applied} />
                    <StatusBadge value={app.status} />
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--ink-700)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.course_title}</div>
                  {app.note && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2, fontStyle: 'italic' }}>"{app.note}"</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>
                  {new Date(app.applied_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="แก้ไขข้อมูลส่วนตัว" size="sm">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label="ชื่อ-นามสกุล *"
            value={form.full_name}
            onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
            required
          />
          <Select
            label="ชั้นปี"
            value={form.year}
            onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
            options={[
              { value: '', label: '— เลือกชั้นปี —' },
              { value: '1', label: 'ปีที่ 1' },
              { value: '2', label: 'ปีที่ 2' },
              { value: '3', label: 'ปีที่ 3' },
              { value: '4', label: 'ปีที่ 4' },
            ]}
          />
          <Input
            label="คณะ / ภาควิชา"
            value={form.faculty}
            onChange={(e) => setForm(f => ({ ...f, faculty: e.target.value }))}
          />
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
              ใบเกรด (Transcript)
            </label>
            <input
              ref={gradeFileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={(e) => setGradeFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadMut.isPending}
                onClick={() => gradeFileInputRef.current?.click()}
              >
                แนบไฟล์ใบเกรด
              </Button>
              <span style={{ fontSize: 12, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gradeFile ? gradeFile.name : 'ยังไม่ได้แนบไฟล์'}
              </span>
            </div>
            {gradeFile && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--amber)', background: '#FEF9E7', padding: '6px 10px', borderRadius: 6 }}>
                การประมวลผล OCR ใช้เวลาประมาณ 1–2 นาที (ไฟล์ PDF หลายหน้าอาจใช้เวลานานกว่านี้) กรุณาอย่าปิดหน้านี้
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', background: '#F8F9FB', padding: '8px 12px', borderRadius: 8 }}>
            อีเมลและรหัสนักศึกษาไม่สามารถแก้ไขได้
          </div>
          {uploadMut.isPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--primary)', background: 'var(--primary-50)', padding: '8px 12px', borderRadius: 8 }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
              กำลังประมวลผล OCR อยู่ กรุณารอสักครู่...
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)} disabled={uploadMut.isPending}>ยกเลิก</Button>
            <Button type="submit" loading={updateMut.isPending || uploadMut.isPending}>
              {uploadMut.isPending ? 'กำลังประมวลผล OCR...' : 'บันทึก'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-900)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
