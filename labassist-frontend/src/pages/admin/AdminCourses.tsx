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
import type { Course } from '../../types'

// Thai credit notation is "หน่วยกิต (บรรยาย-ปฏิบัติ-ศึกษาด้วยตนเอง)", e.g. "3 (2-2-5)" —
// the middle number is lab/practice hours; 2+ means the course has a lab component.
function labHours(credits?: string): number | null {
  const m = credits?.match(/\((\d+)-(\d+)-(\d+)\)/)
  return m ? Number(m[2]) : null
}

// RESEARCH PROJECT I/II ("โครงงานวิจัย 1/2") are thesis-style courses with no
// real lab/TA hiring need — always excluded from this list regardless of filter.
function isResearchProject(c: Course): boolean {
  return c.title.includes('โครงงานวิจัย') || (c.english_title ?? '').toUpperCase().includes('RESEARCH PROJECT')
}

const SEMESTER_TABS: { label: string; value: string }[] = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'ภาค 1', value: '1' },
  { label: 'ภาค 2', value: '2' },
  { label: 'ภาค 3', value: '3' },
]

export default function AdminCourses() {
  const qc = useQueryClient()
  const showToast = useToast()
  const { data: courses = [], isLoading } = useQuery({ queryKey: ['all-courses'], queryFn: () => coursesAPI.getAll() })

  const [semesterFilter, setSemesterFilter] = useState('1')

  // This page only manages lab courses, excludes RESEARCH PROJECT I/II, and
  // never mixes semesters — a semester must be picked explicitly (or "ทั้งหมด").
  const visibleCourses = courses.filter((c) =>
    (labHours(c.credits) ?? 0) >= 2 &&
    !isResearchProject(c) &&
    (semesterFilter === '' || c.semester === semesterFilter)
  )

  const [showImport, setShowImport] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [semester, setSemester] = useState('1')
  const [academicYear, setAcademicYear] = useState('2569')

  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkSemester, setBulkSemester] = useState('1')
  const [bulkAcademicYear, setBulkAcademicYear] = useState('2569')

  const importMut = useMutation({
    // Files are imported one at a time (not in parallel) so a slow/large file
    // doesn't race the next one against the same course-code-matching logic.
    // Each file's failure is caught individually so one bad file doesn't stop
    // the rest of the batch from importing.
    mutationFn: async () => {
      const failed: string[] = []
      for (const f of files) {
        try {
          await adminApi.importCourses(f, semester, Number(academicYear))
        } catch (err) {
          const detail = isAxiosError(err) ? err.response?.data?.error : undefined
          failed.push(`${f.name}${detail ? ` (${detail})` : ''}`)
        }
      }
      return failed
    },
    onSuccess: (failed) => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowImport(false)
      setFiles([])
      // Silent on success — only surface a toast when something went wrong.
      if (failed.length > 0) {
        showToast(`นำเข้าไม่สำเร็จ ${failed.length} ไฟล์: ${failed.join(', ')}`, 'error')
      }
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {SEMESTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSemesterFilter(tab.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              border: '1.5px solid var(--line)',
              background: semesterFilter === tab.value ? 'var(--primary)' : '#fff',
              color: semesterFilter === tab.value ? '#fff' : 'var(--ink-700)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading
        ? <Skeleton lines={6} height={48} />
        : <Table columns={columns as never} data={visibleCourses as never} emptyText="ไม่มีวิชาที่มี Lab ในภาคการศึกษานี้" />
      }

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="นำเข้ารายวิชาจากไฟล์ Excel" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); importMut.mutate() }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            ไฟล์ .xlsx ต้องมีคอลัมน์: รายวิชา, ชื่อรายวิชา, COURSENAME, หน่วยกิต, เวลา, ผู้สอน
            — ชื่อผู้สอนจะแสดงตามที่พิมพ์ในไฟล์เสมอ ระบบจะพยายามผูกวิชากับบัญชีอาจารย์ที่มีอยู่จริงให้อัตโนมัติ (ถ้าชื่อตรงกัน) เพื่อให้อาจารย์ล็อกอินดูวิชาของตัวเองได้ — เลือกได้หลายไฟล์พร้อมกัน
          </p>
          <Input
            label="ไฟล์ Excel (.xlsx) *" type="file" accept=".xlsx" multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            required
          />
          {files.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              เลือกไว้ {files.length} ไฟล์: {files.map((f) => f.name).join(', ')}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="ภาคการศึกษา *" value={semester} onChange={(e) => setSemester(e.target.value)} required />
            <Input label="ปีการศึกษา *" type="number" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>ยกเลิก</Button>
            <Button type="submit" loading={importMut.isPending} disabled={files.length === 0}>นำเข้า</Button>
          </div>
        </form>
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
