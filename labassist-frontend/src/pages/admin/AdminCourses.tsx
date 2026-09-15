import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi, coursesAPI } from '../../services/api'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'
import { displayCourseTitle } from '../../utils/courseDisplay'
import { isLabCourse } from '../../utils/labCourse'
import type { Course } from '../../types'

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
  // A manually-added course (by admin or instructor) has no Excel-derived
  // `credits` string to parse hours from — labboy_slots > 0 is the same "has
  // a lab" signal for those, so it isn't silently hidden from this list.
  const visibleCourses = courses.filter((c) =>
    isLabCourse(c) &&
    (semesterFilter === '' || c.semester === semesterFilter)
  )

  const [showImport, setShowImport] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [semester, setSemester] = useState('1')
  const [academicYear, setAcademicYear] = useState('2569')

  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkSemester, setBulkSemester] = useState('1')
  const [bulkAcademicYear, setBulkAcademicYear] = useState('2569')

  const [showAddCourse, setShowAddCourse] = useState(false)
  const emptyAddCourseForm = {
    instructor_id: '', code: '', title: '', semester: '1', academic_year: '2569', labboy_slots: '0',
  }
  const [addCourseForm, setAddCourseForm] = useState(emptyAddCourseForm)
  const [showCodeSuggest, setShowCodeSuggest] = useState(false)

  // The department's required-course reference list (core_courses — used for
  // OCR transcript matching, e.g. "517121") — a much smaller, curated set
  // than the Excel-imported postings below, and often has a code before any
  // section for it has ever been imported.
  const { data: coreCourses = [] } = useQuery({
    queryKey: ['admin-core-courses'],
    queryFn: () => adminApi.coreCourseCatalog(),
    enabled: showAddCourse,
  })

  // Suggest from courses already known to the system: core_courses first,
  // then courses already imported from Excel across every term/instructor —
  // deduped by code, first title seen wins. Lets the admin type a partial
  // code (e.g. "517") and pick the matching course instead of retyping the
  // exact title by hand.
  const codeCatalog = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of coreCourses) {
      if (!isLabCourse({ ...c, labboy_slots: 0 })) continue
      if (!seen.has(c.code)) seen.set(c.code, c.title)
    }
    for (const c of courses) {
      if (!isLabCourse(c)) continue
      if (!seen.has(c.code)) seen.set(c.code, displayCourseTitle(c.title, c.english_title))
    }
    return Array.from(seen, ([code, title]) => ({ code, title }))
  }, [coreCourses, courses])

  const codeSuggestions = useMemo(() => {
    const query = addCourseForm.code.trim().toLowerCase()
    if (!query) return []
    return codeCatalog.filter((c) => c.code.toLowerCase().startsWith(query)).slice(0, 8)
  }, [codeCatalog, addCourseForm.code])

  // Instructor picker for manually-added courses — same "อาจารย์" role list
  // AdminUsers.tsx manages.
  const { data: instructors = [] } = useQuery({
    queryKey: ['admin-users', { role: 'instructor' }],
    queryFn: () => adminApi.users({ role: 'instructor', limit: 200 }),
    enabled: showAddCourse,
  })

  const importMut = useMutation({
    // Files are imported one at a time (not in parallel) so a slow/large file
    // doesn't race the next one against the same course-code-matching logic.
    // Each file's failure is caught individually so one bad file doesn't stop
    // the rest of the batch from importing.
    mutationFn: async () => {
      const failed: string[] = []
      let totalCreated = 0
      let totalSkipped = 0
      for (const f of files) {
        try {
          const res = await adminApi.importCourses(f, semester, Number(academicYear))
          totalCreated += res.created.length
          totalSkipped += res.skipped.length
        } catch (err) {
          const detail = isAxiosError(err) ? err.response?.data?.error : undefined
          failed.push(`${f.name}${detail ? ` (${detail})` : ''}`)
        }
      }
      return { failed, totalCreated, totalSkipped }
    },
    onSuccess: ({ failed, totalCreated, totalSkipped }) => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowImport(false)
      setFiles([])
      setSemesterFilter(semester)
      if (failed.length > 0) {
        showToast(`นำเข้าไม่สำเร็จ ${failed.length} ไฟล์: ${failed.join(', ')}`, 'error')
      } else if (totalCreated === 0) {
        showToast(`ไม่มีวิชาถูกนำเข้า — ข้าม ${totalSkipped} แถว (ตรวจสอบคอลัมน์หน่วยกิตในไฟล์)`, 'error')
      } else {
        const skipMsg = totalSkipped > 0 ? ` (ข้าม ${totalSkipped} แถวที่ไม่มีคาบแลป)` : ''
        showToast(`นำเข้าสำเร็จ ${totalCreated} วิชา${skipMsg}`, 'success')
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

  const addCourseMut = useMutation({
    mutationFn: () => adminApi.createCourse({
      instructor_id: Number(addCourseForm.instructor_id),
      code: addCourseForm.code,
      title: addCourseForm.title,
      semester: addCourseForm.semester,
      academic_year: Number(addCourseForm.academic_year),
      labboy_slots: Number(addCourseForm.labboy_slots),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowAddCourse(false)
      setAddCourseForm(emptyAddCourseForm)
      showToast('เพิ่มวิชาเรียบร้อยแล้ว', 'success')
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      showToast(detail ? `เพิ่มวิชาไม่สำเร็จ: ${detail}` : 'เพิ่มวิชาไม่สำเร็จ กรุณาลองใหม่', 'error')
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการรายวิชา</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>
            {visibleCourses.length} วิชา{courses.length !== visibleCourses.length ? ` (จากทั้งหมด ${courses.length} วิชา — ซ่อนวิชาที่ไม่มี Lab)` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" style={{ color: 'var(--red)', border: '1px solid var(--line)' }} onClick={() => setShowBulkDelete(true)}>
            ลบทั้งเทอม
          </Button>
          <Button variant="outline" onClick={() => setShowAddCourse(true)}>+ เพิ่มวิชา</Button>
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

      <Modal isOpen={showAddCourse} onClose={() => setShowAddCourse(false)} title="เพิ่มวิชา" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); addCourseMut.mutate() }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            สำหรับวิชาที่อาจารย์ขอเพิ่ม หรือวิชาที่ไม่มีอยู่ในไฟล์ Excel ที่นำเข้า
          </p>
          <Select
            label="อาจารย์ผู้สอน *"
            value={addCourseForm.instructor_id}
            onChange={(e) => setAddCourseForm((f) => ({ ...f, instructor_id: e.target.value }))}
            required
            options={[
              { value: '', label: 'เลือกอาจารย์' },
              ...instructors.map((u) => ({ value: String(u.id), label: u.full_name })),
            ]}
          />
          <div style={{ position: 'relative' }}>
            <Input
              label="รหัสวิชา *" value={addCourseForm.code}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, code: e.target.value }))}
              onFocus={() => setShowCodeSuggest(true)}
              onBlur={() => setTimeout(() => setShowCodeSuggest(false), 150)}
              autoComplete="off"
              required
            />
            {showCodeSuggest && codeSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
                background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
              }}>
                {codeSuggestions.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setAddCourseForm((f) => ({ ...f, code: c.code, title: c.title }))
                      setShowCodeSuggest(false)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                      background: 'none', border: 'none', borderBottom: '1px solid var(--line-soft)',
                      cursor: 'pointer', fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.code}</span>
                    {' — '}
                    <span style={{ color: 'var(--ink-700)' }}>{c.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            label="ชื่อวิชา *" value={addCourseForm.title}
            onChange={(e) => setAddCourseForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select
              label="ภาคการศึกษา *" value={addCourseForm.semester}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, semester: e.target.value }))}
              options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
            />
            <Input
              label="ปีการศึกษา *" type="number" value={addCourseForm.academic_year}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, academic_year: e.target.value }))}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowAddCourse(false)}>ยกเลิก</Button>
            <Button type="submit" loading={addCourseMut.isPending}>เพิ่มวิชา</Button>
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
