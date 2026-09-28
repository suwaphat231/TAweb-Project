import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../services/api'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useToast } from '../hooks/useToast'
import { GRADE_OPTIONS } from '../utils/grades'
import { cleanCourseTitle } from '../utils/courseTitle'
import type { CourseGroup } from '../utils/courseGrouping'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

// Shared "สมัคร Lab Boy" modal flow (pick a section, optionally a grade,
// confirm) so any page showing a CourseCard — the apply-to-courses page and
// the student home dashboard alike — can open the same modal via onApply.
export function useApplyLabboy() {
  const [applyTarget, setApplyTarget] = useState<CourseGroup | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [grade, setGrade] = useState('')
  const [gradeProofFile, setGradeProofFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Tracks an application that was created but whose grade-proof upload failed,
  // so a retry can skip re-creating the application and only redo the upload.
  // pendingCourseIdRef is kept in sync so that changing Sec between retries
  // is detected: if the course_id no longer matches, the stale app is discarded
  // and a fresh application is submitted for the newly selected section.
  const pendingAppIdRef = useRef<number | null>(null)
  const pendingCourseIdRef = useRef<number | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const applyMutation = useMutation({
    mutationFn: async (vars: { course_id: number; grade?: string; gradeProofFile: File | null }) => {
      let appId = pendingAppIdRef.current
      // If the user changed Sec between retries, the pending app belongs to a
      // different section — discard it and create a fresh application instead.
      if (appId !== null && pendingCourseIdRef.current !== vars.course_id) {
        appId = null
        pendingAppIdRef.current = null
        pendingCourseIdRef.current = null
      }
      if (appId === null) {
        const app = await studentApi.apply({ course_id: vars.course_id, role_applied: 'labboy', grade: vars.grade })
        appId = app.id
        if (vars.gradeProofFile) {
          // Record the ID before the upload attempt so a failure here is
          // recoverable — the next retry skips apply() and goes straight to
          // uploadGradeProof() with this ID.
          pendingAppIdRef.current = appId
          pendingCourseIdRef.current = vars.course_id
        }
      }
      if (vars.gradeProofFile) {
        const result = await studentApi.uploadGradeProof(appId, vars.gradeProofFile)
        pendingAppIdRef.current = null
        pendingCourseIdRef.current = null
        return result
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      const code = applyTarget?.code ?? ''
      const hasOcrWarning = result && typeof result === 'object' && 'ocr_warning' in result
      if (hasOcrWarning) {
        showToast((result as { ocr_warning: string }).ocr_warning, 'warning')
      } else {
        showToast(`ส่งใบสมัคร Lab Boy วิชา ${code} เรียบร้อย รออาจารย์พิจารณา`, 'success')
      }
      setApplyTarget(null)
      setSelectedSectionId(null)
      setGrade('')
      setGradeProofFile(null)
      pendingAppIdRef.current = null
      pendingCourseIdRef.current = null
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
    pendingAppIdRef.current = null
    pendingCourseIdRef.current = null
    const firstAvailable = group.sections.find((s) => !(s.labboy_slots > 0 && s.labboy_accepted >= s.labboy_slots) && !s.conflict_day)
    setSelectedSectionId((firstAvailable ?? group.sections[0])?.id ?? null)
    setApplyTarget(group)
  }

  function confirmApply() {
    if (!selectedSectionId) return
    if (requireGradeProof && !gradeProofFile) return
    if (fileError) return
    applyMutation.mutate({ course_id: selectedSectionId, grade: grade || undefined, gradeProofFile })
  }

  const selectedSection = applyTarget?.sections.find((s) => s.id === selectedSectionId) ?? null
  const requireGradeProof = !!selectedSection?.require_grade_proof

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

        {applyTarget && applyTarget.sections.length > 1 ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>เลือก Sec ตามเวลาที่ว่าง</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {applyTarget.sections.map((s) => {
                const isFull = s.labboy_slots > 0 && s.labboy_accepted >= s.labboy_slots
                const isConflict = !!s.conflict_day
                const isDisabled = isFull || isConflict
                const isSelected = selectedSectionId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setSelectedSectionId(s.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : isConflict ? '1.5px solid var(--amber)' : '1.5px solid var(--line)',
                      background: isSelected ? 'var(--primary-50)' : isConflict ? 'var(--amber-bg)' : isFull ? '#F5F5F5' : '#fff',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: isFull ? 0.5 : 1,
                      transition: 'border .15s, background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--primary)' : isConflict ? 'var(--amber)' : 'var(--ink-900)' }}>
                        Sec {s.section}
                        {isFull && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--red)' }}>เต็มแล้ว</span>}
                        {isConflict && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--amber)' }}>ชนตาราง</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{s.labboy_accepted} / {s.labboy_slots} คน</span>
                    </div>
                    {s.schedule && <div style={{ fontSize: 12, color: isConflict ? 'var(--amber)' : 'var(--ink-500)', marginTop: 2 }}>🕐 {s.schedule}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : selectedSection ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedSection.schedule && (
              <div style={{ fontSize: 13, color: selectedSection.conflict_day ? 'var(--amber)' : 'var(--ink-500)' }}>
                🕐 {selectedSection.schedule}
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
            disabled={!selectedSectionId || !!selectedSection?.conflict_day || (requireGradeProof && !gradeProofFile) || !!fileError}
          >
            ยืนยันสมัคร
          </Button>
        </div>
      </div>
    </Modal>
  )

  return { openApply, modal }
}
