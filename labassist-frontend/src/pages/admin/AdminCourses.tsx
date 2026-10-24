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
import type { Course, SkippedCourse } from '../../types'
import { formatSchedule } from '../../utils/schedule'
import { CourseEditRequestsModal } from './CourseEditRequestsModal'

// Meeting days for a manually added course, stored in the classlist format
// ("Tu 13:00 - 16:00", one line per meeting) like the Excel import, so each
// day becomes its own course row and conflict checks read it the same way.
const MEETING_DAYS = [
  { value: 'Mo', label: 'จันทร์' }, { value: 'Tu', label: 'อังคาร' }, { value: 'We', label: 'พุธ' },
  { value: 'Th', label: 'พฤหัสบดี' }, { value: 'Fr', label: 'ศุกร์' }, { value: 'Sa', label: 'เสาร์' },
  { value: 'Su', label: 'อาทิตย์' },
]

interface Meeting { day: string; start: string; end: string }

const emptyMeeting = (): Meeting => ({ day: '', start: '', end: '' })

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

  // Instructors' proposed course-detail changes, waiting for approval here.
  const [showEditRequests, setShowEditRequests] = useState(false)
  const { data: editRequests = [] } = useQuery({
    queryKey: ['admin-course-edit-requests'],
    queryFn: () => adminApi.courseEditRequests('pending'),
  })

  // This page only manages lab courses, excludes RESEARCH PROJECT I/II, and
  // never mixes semesters — a semester must be picked explicitly (or "ทั้งหมด").
  // A manually-added course (by admin or instructor) has no Excel-derived
  // `credits` string to parse hours from, and is added on purpose as a lab
  // course — even before anyone sets its Lab Boy slots — so it is always
  // listed (unless its title is an excluded non-lab course). The API lists
  // newest first, so a course just added sits at the top of its term.
  const visibleCourses = courses.filter((c) =>
    (isLabCourse(c) || (!c.credits?.trim() && isLabCourse({ ...c, labboy_slots: 1 }))) &&
    (semesterFilter === '' || c.semester === semesterFilter)
  )

  const [showImport, setShowImport] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [semester, setSemester] = useState('1')
  const [academicYear, setAcademicYear] = useState('2569')
  const [duplicateNotice, setDuplicateNotice] = useState<{ duplicates: number; created: number } | null>(null)
  // Courses "ลบทั้งเทอม" had to keep, shown with the reason for each.
  const [bulkSkipped, setBulkSkipped] = useState<{ deleted: number; skipped: SkippedCourse[] } | null>(null)

  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkSemester, setBulkSemester] = useState('1')
  const [bulkAcademicYear, setBulkAcademicYear] = useState('2569')

  const [showAddCourse, setShowAddCourse] = useState(false)
  const emptyAddCourseForm = {
    instructor_id: '', code: '', title: '', semester: '1', academic_year: '2569', labboy_slots: '0',
    section: '1', credit_total: '', credit_lecture: '', credit_lab: '', credit_self: '',
  }
  const [addCourseForm, setAddCourseForm] = useState(emptyAddCourseForm)
  const [meetings, setMeetings] = useState<Meeting[]>([emptyMeeting()])
  const [addCourseError, setAddCourseError] = useState('')
  const setMeeting = (i: number, patch: Partial<Meeting>) =>
    setMeetings((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const labHours = addCourseForm.credit_lab === '' ? null : Number(addCourseForm.credit_lab)

  // Checks the parts the browser can't, then returns the credits and
  // schedule strings to send; sets the error and returns null otherwise.
  const buildCourseDetails = (): { credits: string; schedule: string } | null => {
    const { credit_total, credit_lecture, credit_lab, credit_self } = addCourseForm
    if ([credit_total, credit_lecture, credit_lab, credit_self].some((v) => v === '')) {
      setAddCourseError('กรุณากรอกหน่วยกิตให้ครบทั้ง 4 ช่อง')
      return null
    }
    for (const m of meetings) {
      if (!m.day || !m.start || !m.end) {
        setAddCourseError('กรุณากรอกวันและเวลาเรียนให้ครบทุกแถว')
        return null
      }
      if (m.start >= m.end) {
        setAddCourseError('เวลาเริ่มเรียนต้องก่อนเวลาเลิกเรียน')
        return null
      }
    }
    setAddCourseError('')
    return {
      credits: `${credit_total} (${credit_lecture}-${credit_lab}-${credit_self})`,
      schedule: meetings.map((m) => `${m.day} ${m.start} - ${m.end}`).join('\n'),
    }
  }
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
      let totalDuplicates = 0
      for (const f of files) {
        try {
          const res = await adminApi.importCourses(f, semester, Number(academicYear))
          totalCreated += res.created.length
          totalSkipped += res.skipped.length
          // Courses already in the system (identical or with differing data)
          // are left untouched — existing data is always kept.
          totalDuplicates += (res.duplicates?.length ?? 0) + (res.conflicts?.length ?? 0)
        } catch (err) {
          const detail = isAxiosError(err) ? err.response?.data?.error : undefined
          failed.push(`${f.name}${detail ? ` (${detail})` : ''}`)
        }
      }
      return { failed, totalCreated, totalSkipped, totalDuplicates }
    },
    onSuccess: ({ failed, totalCreated, totalSkipped, totalDuplicates }) => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowImport(false)
      setFiles([])
      setSemesterFilter(semester)
      if (failed.length > 0) {
        showToast(`นำเข้าไม่สำเร็จ ${failed.length} ไฟล์: ${failed.join(', ')}`, 'error')
      } else if (totalDuplicates > 0) {
        // Any course already in the system replaces the success message — the
        // admin sees an "already exists" popup in the middle of the screen.
        setDuplicateNotice({ duplicates: totalDuplicates, created: totalCreated })
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
      if (data.skipped?.length) setBulkSkipped({ deleted: data.deleted, skipped: data.skipped })
      else showToast(`ลบวิชาเทอม ${bulkSemester}/${bulkAcademicYear} ไปแล้ว ${data.deleted} วิชา`, 'success')
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      showToast(detail ? `ลบวิชาไม่สำเร็จ: ${detail}` : 'ลบวิชาไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const addCourseMut = useMutation({
    mutationFn: (details: { credits: string; schedule: string }) => adminApi.createCourse({
      instructor_id: Number(addCourseForm.instructor_id),
      code: addCourseForm.code,
      title: addCourseForm.title,
      semester: addCourseForm.semester,
      academic_year: Number(addCourseForm.academic_year),
      labboy_slots: Number(addCourseForm.labboy_slots),
      credits: details.credits,
      sections: [{ section: Number(addCourseForm.section), schedule: details.schedule }],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-courses'] })
      setShowAddCourse(false)
      // Show the new course's term so it appears at the top of the list.
      setSemesterFilter(addCourseForm.semester)
      setAddCourseForm(emptyAddCourseForm)
      setMeetings([emptyMeeting()])
      showToast(`เพิ่มวิชา ${addCourseForm.code} เรียบร้อยแล้ว`, 'success')
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
    { key: 'schedule', header: 'เวลาเรียน', render: (c: Course) => <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{formatSchedule(c.schedule) || '—'}</span> },
    {
      key: 'instructor_name', header: 'อาจารย์',
      render: (c: Course) => <span style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.instructors_raw || c.instructor_name || '—'}</span>,
    },
    { key: 'term', header: 'เทอม', render: (c: Course) => <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>ภาคเรียนที่ {c.semester}{c.section ? ` · กลุ่ม ${c.section}` : ''}</span> },
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
          <Button variant="outline" onClick={() => setShowEditRequests(true)}>
            คำขอแก้ไขวิชา
            {editRequests.length > 0 && (
              <span style={{
                marginLeft: 6, minWidth: 20, padding: '0 6px', borderRadius: 999,
                background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: '20px',
              }}>
                {editRequests.length}
              </span>
            )}
          </Button>
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

      <CourseEditRequestsModal isOpen={showEditRequests} onClose={() => setShowEditRequests(false)} requests={editRequests} />

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

      <Modal isOpen={duplicateNotice !== null} onClose={() => setDuplicateNotice(null)} title="แจ้งเตือน" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>รายวิชานี้มีอยู่ในระบบแล้ว</div>
          {duplicateNotice && (
            <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>
              พบรายวิชาที่มีอยู่แล้ว {duplicateNotice.duplicates} วิชา
              {duplicateNotice.created > 0 && <><br />นำเข้าวิชาใหม่ {duplicateNotice.created} วิชา</>}
            </div>
          )}
          <Button type="button" onClick={() => setDuplicateNotice(null)} style={{ marginTop: 8, minWidth: 120 }}>ตกลง</Button>
        </div>
      </Modal>

      <Modal isOpen={showAddCourse} onClose={() => setShowAddCourse(false)} title="เพิ่มวิชา" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const details = buildCourseDetails()
            if (details) addCourseMut.mutate(details)
          }}
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
              label="รหัสวิชา * (ตัวเลขเท่านั้น)" value={addCourseForm.code}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
              inputMode="numeric"
              pattern="[0-9]+"
              title="รหัสวิชาต้องเป็นตัวเลขเท่านั้น"
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
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
              หน่วยกิต * <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>— เช่น 3 (2-2-5)</span>
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {([
                ['credit_total', 'หน่วยกิต'], ['credit_lecture', 'บรรยาย'],
                ['credit_lab', 'ปฏิบัติ'], ['credit_self', 'ศึกษาเอง'],
              ] as const).map(([key, label]) => (
                <Input
                  key={key} label={label} type="number" min={0} max={20} inputMode="numeric"
                  value={addCourseForm[key]}
                  onChange={(e) => setAddCourseForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              ))}
            </div>
            {labHours !== null && labHours < 2 && (
              <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>
                ชั่วโมงปฏิบัติน้อยกว่า 2 — ระบบจะถือว่าไม่ใช่วิชาแลป และวิชานี้จะไม่แสดงในรายการ
              </p>
            )}
          </fieldset>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
              เวลาเรียน * <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>— เรียนหลายวัน ระบบจะแยกเป็นวิชาละ 1 วัน</span>
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {meetings.map((m, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Select
                    aria-label={`วันเรียนแถวที่ ${i + 1}`} value={m.day}
                    onChange={(e) => setMeeting(i, { day: e.target.value })}
                    options={[{ value: '', label: 'เลือกวัน' }, ...MEETING_DAYS]}
                  />
                  <Input aria-label={`เวลาเริ่มแถวที่ ${i + 1}`} type="time" value={m.start}
                    onChange={(e) => setMeeting(i, { start: e.target.value })} />
                  <Input aria-label={`เวลาเลิกแถวที่ ${i + 1}`} type="time" value={m.end}
                    onChange={(e) => setMeeting(i, { end: e.target.value })} />
                  <Button
                    type="button" size="sm" variant="ghost" aria-label={`ลบเวลาเรียนแถวที่ ${i + 1}`}
                    disabled={meetings.length === 1}
                    onClick={() => setMeetings((ms) => ms.filter((_, j) => j !== i))}
                  >
                    ลบ
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setMeetings((ms) => [...ms, emptyMeeting()])}>
                  + เพิ่มวันเรียน
                </Button>
              </div>
            </div>
          </fieldset>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Input
              label="กลุ่มเรียน *" type="number" min={1} value={addCourseForm.section}
              onChange={(e) => setAddCourseForm((f) => ({ ...f, section: e.target.value }))}
              required
            />
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
          {addCourseError && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{addCourseError}</p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowAddCourse(false)}>ยกเลิก</Button>
            <Button type="submit" loading={addCourseMut.isPending}>เพิ่มวิชา</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={bulkSkipped !== null} onClose={() => setBulkSkipped(null)} title="ผลการลบวิชาทั้งเทอม" size="lg">
        {bulkSkipped && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, color: 'var(--ink-700)' }}>
              ลบแล้ว <b>{bulkSkipped.deleted}</b> วิชา — ลบไม่ได้ <b>{bulkSkipped.skipped.length}</b> วิชา ดังนี้
            </p>
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
              {bulkSkipped.skipped.map((s) => (
                <div key={s.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-800)' }}>
                    {s.code} กลุ่ม {s.section} · {displayCourseTitle(s.title)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{s.reason}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
              วิชาที่มีแต่ใบสมัครที่นักศึกษาถอนแล้วจะลบได้ ส่วนวิชาที่อาจารย์ยังเปิดรับสมัคร ให้อาจารย์ปิดหรือลบประกาศก่อน
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="button" onClick={() => setBulkSkipped(null)}>ตกลง</Button>
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
            ลบเฉพาะวิชาที่ไม่มีใบสมัคร ผลตรวจ หรือเอกสาร ในภาคการศึกษาและปีการศึกษาที่ระบุ วิชาที่มีประวัติจะถูกข้าม
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
