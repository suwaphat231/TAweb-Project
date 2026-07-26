import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi, coursesAPI } from '../../services/api'
import { Table } from '../../components/ui/Table'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import type { Course, ImportCoursesResponse } from '../../types'

// Thai credit notation is "หน่วยกิต (บรรยาย-ปฏิบัติ-ศึกษาด้วยตนเอง)", e.g. "3 (2-2-5)" —
// the middle number is lab/practice hours; 2+ means the course has a lab component.
function labHours(credits?: string): number | null {
  const m = credits?.match(/\((\d+)-(\d+)-(\d+)\)/)
  return m ? Number(m[2]) : null
}

export default function AdminCourses() {
  const qc = useQueryClient()
  const showToast = useToast()
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['all-courses'], queryFn: () => coursesAPI.getAll() })

  // This page only manages lab courses — always filtered, no toggle needed.
  const visibleCourses = courses.filter((c) => (labHours(c.credits) ?? 0) >= 2)

  const [showImport, setShowImport] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [semester, setSemester] = useState('1')
  const [academicYear, setAcademicYear] = useState('2569')
  const [result, setResult] = useState<ImportCoursesResponse | null>(null)

  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkSemester, setBulkSemester] = useState('1')
  const [bulkAcademicYear, setBulkAcademicYear] = useState('2569')

  const importMut = useMutation({
    mutationFn: () => adminApi.importCourses(file as File, semester, Number(academicYear)),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowImport(false)
      setFile(null)
      setResult(data)
      showToast(`นำเข้าสำเร็จ ${data.created.length} รายวิชา${data.skipped.length ? ` (ข้าม ${data.skipped.length} แถว)` : ''}`, data.skipped.length ? 'warning' : 'success')
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      showToast(detail ? `นำเข้าไฟล์ไม่สำเร็จ: ${detail}` : 'นำเข้าไฟล์ไม่สำเร็จ กรุณาตรวจสอบไฟล์และลองใหม่', 'error')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => coursesAPI.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      showToast('ลบวิชาเรียบร้อยแล้ว', 'success')
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      showToast(detail ? `ลบวิชาไม่สำเร็จ: ${detail}` : 'ลบวิชาไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const bulkDeleteMut = useMutation({
    mutationFn: () => adminApi.deleteCoursesByTerm(bulkSemester, Number(bulkAcademicYear)),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowBulkDelete(false)
      showToast(`ลบวิชาเทอม ${bulkSemester}/${bulkAcademicYear} ไปแล้ว ${data.deleted} วิชา`, 'success')
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      showToast(detail ? `ลบวิชาไม่สำเร็จ: ${detail}` : 'ลบวิชาไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const columns = [
    { key: 'code',  header: 'รหัสวิชา', render: (c: Course) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.code}</span> },
    {
      key: 'title', header: 'ชื่อวิชา', width: 300,
      render: (c: Course) => (
        <div>
          <div style={{ fontWeight: 600 }}>{c.title}</div>
          {c.english_title && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{c.english_title}</div>}
        </div>
      ),
    },
    { key: 'credits', header: 'หน่วยกิต', render: (c: Course) => <span style={{ fontSize: 13 }}>{c.credits || '—'}</span> },
    { key: 'schedule', header: 'เวลาเรียน', render: (c: Course) => <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.schedule || '—'}</span> },
    {
      key: 'instructor_name', header: 'อาจารย์',
      render: (c: Course) => <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.instructors_raw || c.instructor_name || '—'}</span>,
    },
    { key: 'term', header: 'เทอม', render: (c: Course) => <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>{c.semester}/{c.academic_year}{c.section ? ` · กลุ่ม ${c.section}` : ''}</span> },
    {
      key: 'actions', header: '',
      render: (c: Course) => (
        <Button
          size="sm" variant="ghost"
          onClick={() => {
            if (confirm(`ยืนยันลบวิชา ${c.code} - ${c.title}?`)) deleteMut.mutate(c.id)
          }}
          style={{ color: 'var(--red)', border: '1px solid var(--line)' }}
        >
          ลบ
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการรายวิชา (มี Lab)</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>
            {visibleCourses.length} วิชา{courses.length !== visibleCourses.length ? ` (จากทั้งหมด ${courses.length} วิชา — ซ่อนวิชาที่ไม่มี Lab)` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" style={{ color: 'var(--red)', border: '1px solid var(--line)' }} onClick={() => setShowBulkDelete(true)}>
            ลบทั้งเทอม
          </Button>
          <Button onClick={() => setShowImport(true)}>นำเข้าจาก Excel</Button>
        </div>
      </div>

      {isLoading
        ? <Skeleton lines={6} height={48} />
        : <Table columns={columns as never} data={visibleCourses as never} emptyText="ไม่มีวิชาที่มี Lab" />
      }

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="นำเข้ารายวิชาจากไฟล์ Excel" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); importMut.mutate() }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            ไฟล์ .xlsx ต้องมีคอลัมน์: รายวิชา, ชื่อรายวิชา, COURSENAME, หน่วยกิต, เวลา, ผู้สอน
            — ชื่อผู้สอนจะแสดงตามที่พิมพ์ในไฟล์เสมอ ระบบจะพยายามผูกวิชากับบัญชีอาจารย์ที่มีอยู่จริงให้อัตโนมัติ (ถ้าชื่อตรงกัน) เพื่อให้อาจารย์ล็อกอินดูวิชาของตัวเองได้
          </p>
          <Input
            label="ไฟล์ Excel (.xlsx) *" type="file" accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="ภาคการศึกษา *" value={semester} onChange={(e) => setSemester(e.target.value)} required />
            <Input label="ปีการศึกษา *" type="number" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>ยกเลิก</Button>
            <Button type="submit" loading={importMut.isPending} disabled={!file}>นำเข้า</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!result} onClose={() => setResult(null)} title="ผลการนำเข้ารายวิชา" size="lg">
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 14, color: 'var(--ink-700)' }}>
              นำเข้าสำเร็จ <strong style={{ color: 'var(--green)' }}>{result.created.length}</strong> รายวิชา
              {result.skipped.length > 0 && (
                <> · ข้ามไป <strong style={{ color: 'var(--red)' }}>{result.skipped.length}</strong> แถว (แถวว่างจริงๆ เท่านั้น)</>
              )}
            </div>

            {result.skipped.length > 0 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 8 }}>แถวที่ข้าม</h4>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>แถวที่</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>สาเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.skipped.map((s, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '8px 12px' }}>{s.row}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--red)' }}>{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 8 }}>วิชาที่นำเข้า</h4>
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>รหัสวิชา</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>ชื่อวิชา</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>ผู้สอน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.created.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--line-soft)' }}>
                        <td style={{ padding: '8px 12px' }}>{r.code}</td>
                        <td style={{ padding: '8px 12px' }}>{r.title}</td>
                        <td style={{ padding: '8px 12px' }}>{r.instructor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => setResult(null)}>ปิด</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showBulkDelete} onClose={() => setShowBulkDelete(false)} title="ลบวิชาทั้งเทอม" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (confirm(`ยืนยันลบวิชาทั้งหมดของเทอม ${bulkSemester}/${bulkAcademicYear}? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
              bulkDeleteMut.mutate()
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            ลบวิชาทั้งหมดที่ตรงกับภาคการศึกษาและปีการศึกษาที่ระบุ พร้อมใบสมัครที่เกี่ยวข้อง — ใช้เพื่อล้างข้อมูลที่นำเข้าผิดพลาด
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="ภาคการศึกษา *" value={bulkSemester} onChange={(e) => setBulkSemester(e.target.value)} required />
            <Input label="ปีการศึกษา *" type="number" value={bulkAcademicYear} onChange={(e) => setBulkAcademicYear(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowBulkDelete(false)}>ยกเลิก</Button>
            <Button type="submit" loading={bulkDeleteMut.isPending} style={{ background: 'var(--red)' }}>ลบวิชาทั้งเทอม</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
