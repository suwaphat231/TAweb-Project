import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../services/api'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useToast } from '../hooks/useToast'
import { GRADE_OPTIONS } from '../utils/grades'
import { cleanCourseTitle } from '../utils/courseTitle'
import { getAppliedSections, groupSectionsByTime, timeOptionSecLabel, type CourseGroup } from '../utils/courseGrouping'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

// Shared "สมัคร Lab Boy" modal flow (pick one or more times, optionally a grade,
// confirm) so any page showing a CourseCard — the apply-to-courses page and
// the student home dashboard alike — can open the same modal via onApply.
export function useApplyLabboy() {
  const [applyTarget, setApplyTarget] = useState<CourseGroup | null>(null)
  // One section id per picked time — a student may apply to several times
  // of the same course, each becoming its own application.
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([])
  // Sections already applied to when the modal opened; they stay listed but
  // can't be picked again.
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set())
  const [grade, setGrade] = useState('')
  const [gradeProofFile, setGradeProofFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Progress of a multi-time submission keyed by course_id, so a retry after
  // a partial failure doesn't re-apply what already went through: an app id
  // means the application exists but its grade-proof upload is still owed,
  // null means that section is fully done.
  const submittedRef = useRef<Map<number, number | null>>(new Map())
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: myApps = [] } = useQuery({
    queryKey: ['my-applications'],
    queryFn: studentApi.applications,
  })

  const { data: scheduleConfirmed } = useQuery({
    queryKey: ['term-schedule-status'],
    queryFn: studentApi.termScheduleStatus,
  })

  const applyMutation = useMutation({
    mutationFn: async (vars: { course_ids: number[]; grade?: string; gradeProofFile: File | null }) => {
      let ocrWarning: string | undefined
      for (const course_id of vars.course_ids) {
        const prior = submittedRef.current.get(course_id)
        if (prior === null) continue
        let appId = prior
        if (appId === undefined) {
          const app = await studentApi.apply({ course_id, role_applied: 'labboy', grade: vars.grade })
          appId = app.id
          // Record before the upload so a failed upload is retried alone.
          submittedRef.current.set(course_id, vars.gradeProofFile ? appId : null)
        }
        if (vars.gradeProofFile) {
          const result = await studentApi.uploadGradeProof(appId, vars.gradeProofFile)
          submittedRef.current.set(course_id, null)
          if (result && typeof result === 'object' && 'ocr_warning' in result) {
            ocrWarning = (result as { ocr_warning: string }).ocr_warning
          }
        }
      }
      return { ocrWarning, count: vars.course_ids.length }
    },
    onSuccess: ({ ocrWarning, count }) => {
      const code = applyTarget?.code ?? ''
      if (ocrWarning) {
        showToast(ocrWarning, 'warning')
      } else {
        showToast(`ส่งใบสมัคร Lab Boy วิชา ${code}${count > 1 ? ` ${count} ช่วงเวลา` : ''} เรียบร้อย รออาจารย์พิจารณา`, 'success')
      }
      setApplyTarget(null)
      setSelectedSectionIds([])
      setGrade('')
      setGradeProofFile(null)
      submittedRef.current = new Map()
    },
    // Refresh even after a partial failure so cards reflect what went through.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
    },
    onError: (err: { response?: { data?: { error?: string }; status?: number } }) => {
      showToast(err?.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        setFileError('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
        setGradeProofFile(null)
        e.target.value = ''
        return
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError('รองรับเฉพาะไฟล์ .jpg และ .png')
        setGradeProofFile(null)
        e.target.value = ''
        return
      }
    }
    setFileError(null)
    setGradeProofFile(file)
  }

  function openApply(group: CourseGroup) {
    setGrade('')
    setGradeProofFile(null)
    setFileError(null)
    submittedRef.current = new Map()
    setAppliedIds(new Set(getAppliedSections(group, myApps).map((s) => s.id)))
    // With several times to choose from the student ticks them explicitly;
    // a single-time posting is preselected as before.
    const options = groupSectionsByTime(group.sections)
    setSelectedSectionIds(options.length === 1 && group.sections[0] ? [group.sections[0].id] : [])
    setApplyTarget(group)
  }

  function toggleSection(id: number) {
    setSelectedSectionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function confirmApply() {
    if (selectedSectionIds.length === 0) return
    if (scheduleConfirmed !== true) return
    if (requireGradeProof && !gradeProofFile) return
    if (fileError) return
    applyMutation.mutate({ course_ids: selectedSectionIds, grade: grade || undefined, gradeProofFile })
  }

  const selectedSections = applyTarget?.sections.filter((s) => selectedSectionIds.includes(s.id)) ?? []
  // Single-time postings show that one section's schedule/conflict inline.
  const selectedSection = selectedSections.length === 1 ? selectedSections[0] : null
  const timeOptions = applyTarget ? groupSectionsByTime(applyTarget.sections) : []
  const requireGradeProof = selectedSections.some((s) => s.require_grade_proof)

  const modal = (
    <Modal
      isOpen={!!applyTarget}
      onClose={() => setApplyTarget(null)}
      title={`สมัคร Lab Boy — ${applyTarget?.code ?? ''}`}
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {applyTarget && (
          <div style={{ fontSize: 14, color: 'var(--ink-700)' }}>
            <strong>{cleanCourseTitle(applyTarget.title)}</strong>
            {applyTarget.english_title && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', textTransform: 'uppercase', marginTop: 2 }}>
                {applyTarget.english_title}
              </div>
            )}
            <div style={{ marginTop: 4 }}>{applyTarget.instructor_name}</div>
          </div>
        )}

        {scheduleConfirmed === false && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 13 }}>
            กรุณากรอกและบันทึกตารางเรียนของคุณในหน้าโปรไฟล์ก่อนสมัคร Lab Boy
            <a href="/student/profile" style={{ display: 'inline-block', marginTop: 6, color: 'var(--primary)', fontWeight: 700 }}>
              ไปกรอกตารางเรียน
            </a>
          </div>
        )}

        {timeOptions.length > 1 ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>
              เลือกช่วงเวลาที่ว่าง <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(เลือกได้มากกว่า 1 ช่วงเวลา)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timeOptions.map((opt) => {
                // Secs merged into one time keep their own slot counts; the
                // application goes to the first sec at this time with room.
                const sectionFull = (s: (typeof opt.sections)[number]) => s.labboy_slots > 0 && s.labboy_accepted >= s.labboy_slots
                const target = opt.sections.find((s) => !sectionFull(s) && !s.conflict_day)
                const isApplied = opt.sections.some((s) => appliedIds.has(s.id))
                const isFull = !isApplied && opt.sections.every(sectionFull)
                const isConflict = !isApplied && !isFull && !target && opt.sections.some((s) => !!s.conflict_day)
                const isDisabled = isApplied || !target
                const selectedId = opt.sections.find((s) => selectedSectionIds.includes(s.id))?.id
                const isSelected = selectedId !== undefined
                const accepted = opt.sections.reduce((n, s) => n + s.labboy_accepted, 0)
                const slots = opt.sections.reduce((n, s) => n + s.labboy_slots, 0)
                const secLabel = timeOptionSecLabel(opt)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (selectedId !== undefined) toggleSection(selectedId)
                      else if (target) toggleSection(target.id)
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : isConflict ? '1.5px solid var(--amber)' : '1.5px solid var(--line)',
                      background: isSelected ? 'var(--primary-50)' : isConflict ? 'var(--amber-bg)' : isFull || isApplied ? '#F5F5F5' : '#fff',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: isFull || isApplied ? 0.6 : 1,
                      transition: 'border .15s, background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input type="checkbox" checked={isSelected || isApplied} disabled={isDisabled} readOnly tabIndex={-1} style={{ marginTop: 2, pointerEvents: 'none' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--primary)' : isConflict ? 'var(--amber)' : 'var(--ink-900)', whiteSpace: 'pre-line' }}>
                          {opt.schedule || secLabel}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-500)', flexShrink: 0 }}>{accepted} / {slots} คน</span>
                    </div>
                    <div style={{ fontSize: 12, color: isConflict ? 'var(--amber)' : 'var(--ink-500)', marginTop: 2, paddingLeft: 21 }}>
                      {!!opt.schedule && secLabel}
                      {isApplied && <span style={{ marginLeft: 6, color: 'var(--green)' }}>สมัครแล้ว</span>}
                      {isFull && <span style={{ marginLeft: 6, color: 'var(--red)' }}>เต็มแล้ว</span>}
                      {isConflict && <span style={{ marginLeft: 6 }}>ชนตาราง</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : selectedSection ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedSection.schedule && (
              <div style={{ fontSize: 13, color: selectedSection.conflict_day ? 'var(--amber)' : 'var(--ink-500)', whiteSpace: 'pre-line' }}>
                {selectedSection.schedule}
              </div>
            )}
            {selectedSection.conflict_day && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber)', fontWeight: 600,
                padding: '8px 12px', background: 'var(--amber-bg)', borderRadius: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                ชนกับช่วงเวลาที่ติดเรียน ไม่สามารถสมัครได้
              </div>
            )}
          </div>
        ) : null}

        <Select
          label="เกรดที่เคยได้ในวิชานี้ (ไม่บังคับ)"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          options={GRADE_OPTIONS}
        />

        {requireGradeProof && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
              แนบรูปภาพเกรด * <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(เช่น ภาพจาก MyReg — วิชานี้ต้องแนบเพื่อยืนยันเกรด)</span>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileChange}
              style={{ fontSize: 13 }}
            />
            {fileError && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{fileError}</div>
            )}
            {!fileError && gradeProofFile && (
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>เลือกไฟล์: {gradeProofFile.name}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setApplyTarget(null)}>ยกเลิก</Button>
          <Button
            onClick={confirmApply}
            loading={applyMutation.isPending}
            disabled={scheduleConfirmed !== true || selectedSectionIds.length === 0 || selectedSections.some((s) => !!s.conflict_day) || (requireGradeProof && !gradeProofFile) || !!fileError}
          >
            ยืนยันสมัคร{selectedSectionIds.length > 1 ? ` (${selectedSectionIds.length} ช่วงเวลา)` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )

  return { openApply, modal, scheduleConfirmed }
}
