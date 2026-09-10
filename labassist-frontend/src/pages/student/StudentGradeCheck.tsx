import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { studentApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'

const statusLabels = {
  pass: 'อ่านข้อมูลสำเร็จ',
  needs_review: 'ควรตรวจสอบข้อมูลอีกครั้ง',
  fail: 'อ่านข้อมูลไม่สำเร็จ',
}

export default function StudentGradeCheck() {
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [pdpaConsent, setPdpaConsent] = useState(false)
  const [consentError, setConsentError] = useState('')
  const { setUser } = useAuth()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['student-profile'], queryFn: studentApi.profile })
  const upload = useMutation({
    mutationFn: studentApi.ocrTranscript,
    onSuccess: (result) => {
      setUser(result.user)
      qc.setQueryData(['student-profile'], result.user)
    },
  })

  const result = upload.data
  const status = result?.status ?? profile.data?.transcript_status
  const message = result?.message ?? profile.data?.transcript_message
  const courses = result?.courses ?? Object.entries(profile.data?.transcript_grades ?? {}).map(([code, grade]) => ({
    code, title: '', grade, found: true,
  }))
  const uploadError = isAxiosError<{ error?: string }>(upload.error)
    ? upload.error.response?.data?.error
    : undefined

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 16 }}>ตรวจสอบเกรด</h1>
      <p style={{ color: 'var(--ink-500)', marginBottom: 20 }}>อัปโหลดใบเกรดเพื่ออ่านผลการเรียน กรุณาตรวจสอบผลที่อ่านได้กับเอกสารต้นฉบับ</p>
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <form onSubmit={(event) => {
          event.preventDefault()
          if (!pdpaConsent) {
            setConsentError('กรุณายืนยันความยินยอมก่อนส่งเอกสาร')
            return
          }
          if (file && !fileError) upload.mutate(file)
        }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '14px 16px', border: '1px solid var(--primary-100)', borderRadius: 8, background: 'var(--primary-50)' }} role="note">
            <p style={{ fontWeight: 600, color: 'var(--ink-900)', marginBottom: 6 }}>คำแจ้งการคุ้มครองข้อมูลส่วนบุคคล</p>
            <p style={{ fontSize: 13, color: 'var(--ink-600)' }}>
              เอกสารนี้อาจมีข้อมูลส่วนบุคคล เช่น ชื่อ รหัสนักศึกษา และผลการเรียน ระบบจะส่งเอกสารไปประมวลผลด้วย OCR เพื่ออ่านเกรดและตรวจสอบคุณสมบัติการสมัคร จากนั้นจัดเก็บผลการอ่านไว้ในบัญชีของคุณ กรุณาตรวจสอบเอกสารก่อนส่งและอย่าแนบข้อมูลที่ไม่จำเป็น
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--ink-700)', cursor: upload.isPending ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={pdpaConsent}
              disabled={upload.isPending}
              onChange={(event) => {
                setPdpaConsent(event.target.checked)
                if (event.target.checked) setConsentError('')
              }}
              aria-describedby="pdpa-consent-help"
              style={{ marginTop: 4, accentColor: 'var(--primary)' }}
            />
            <span id="pdpa-consent-help">ฉันรับทราบรายละเอียดข้างต้นและยินยอมให้ระบบเก็บและประมวลผลเอกสารกับข้อมูลส่วนบุคคลตามวัตถุประสงค์นี้</span>
          </label>
          {consentError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{consentError}</p>}
          <label htmlFor="grade-transcript">ไฟล์ใบเกรด (PNG, JPG หรือ PDF)</label>
          <input id="grade-transcript" type="file" accept=".png,.jpg,.jpeg,.pdf" required disabled={upload.isPending}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              setFile(selected)
              setFileError(selected && !/\.(png|jpe?g|pdf)$/i.test(selected.name) ? 'กรุณาเลือกไฟล์ PNG, JPG หรือ PDF' : '')
            }} />
          {fileError && <p role="alert">{fileError}</p>}
          {upload.isError && <p role="alert">{uploadError ?? 'ไม่สามารถอ่านใบเกรดได้ กรุณาลองใหม่อีกครั้ง'}</p>}
          <div><Button type="submit" loading={upload.isPending} disabled={!file || !!fileError || !pdpaConsent}>อ่านใบเกรด</Button></div>
          {upload.isPending && <p role="status">กำลังอ่านใบเกรด กรุณารอสักครู่…</p>}
        </form>
      </Card>
      <Card style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>ผลการอ่านเกรดล่าสุด</h2>
        {profile.isLoading ? <Skeleton lines={3} /> : profile.isError && !result ? (
          <div role="alert">
            <p>โหลดผลการอ่านเกรดไม่สำเร็จ</p>
            <Button variant="outline" onClick={() => profile.refetch()}>ลองอีกครั้ง</Button>
          </div>
        ) : (
          <div aria-live="polite">
            {status && <p>{statusLabels[status]}</p>}
            {message && <p>{message}</p>}
            {courses.length === 0 ? <p>ยังไม่มีข้อมูลเกรดที่อ่านได้</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead><tr><th scope="col">รหัสวิชา</th><th scope="col">รายวิชา</th><th scope="col">เกรดที่อ่านได้</th></tr></thead>
                  <tbody>{courses.map((course) => (
                    <tr key={course.code}>
                      <td style={{ padding: '12px 0' }}>{course.code}</td>
                      <td>{course.title || '—'}</td>
                      <td>{course.found ? course.grade : 'ไม่พบข้อมูล'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
