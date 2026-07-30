import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../services/api'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { GRADE_OPTIONS } from '../utils/grades'
import { cleanCourseTitle } from '../utils/courseTitle'
import type { CourseGroup } from '../utils/courseGrouping'

// Shared "สมัคร Lab Boy" modal flow (pick a section, optionally a grade,
// confirm) so any page showing a CourseCard — the apply-to-courses page and
// the student home dashboard alike — can open the same modal via onApply.
export function useApplyLabboy() {
  const [applyTarget, setApplyTarget] = useState<CourseGroup | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [grade, setGrade] = useState('')
  const [gradeProofFile, setGradeProofFile] = useState<File | null>(null)
  const qc = useQueryClient()
  const showToast = useToast()

  const applyMutation = useMutation({
    mutationFn: async (vars: { course_id: number; grade?: string; gradeProofFile: File | null }) => {
      const app = await studentApi.apply({ course_id: vars.course_id, role_applied: 'labboy', grade: vars.grade })
      if (vars.gradeProofFile) {
        await studentApi.uploadGradeProof(app.id, vars.gradeProofFile)
      }
      return app
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      const code = applyTarget?.code ?? ''
      showToast(`ส่งใบสมัคร Lab Boy วิชา ${code} เรียบร้อย รออาจารย์พิจารณา`, 'success')
      setApplyTarget(null)
      setSelectedSectionId(null)
      setGrade('')
      setGradeProofFile(null)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  function openApply(group: CourseGroup) {
    setGrade('')
    setGradeProofFile(null)
    const firstAvailable = group.sections.find((s) => !(s.labboy_slots > 0 && s.labboy_accepted >= s.labboy_slots))
    setSelectedSectionId((firstAvailable ?? group.sections[0])?.id ?? null)
    setApplyTarget(group)
  }

  function confirmApply() {
    if (!selectedSectionId) return
    if (requireGradeProof && !gradeProofFile) return
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
                const isSelected = selectedSectionId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={isFull}
                    onClick={() => !isFull && setSelectedSectionId(s.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--line)',
                      background: isSelected ? 'var(--primary-50)' : isFull ? '#F5F5F5' : '#fff',
                      cursor: isFull ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: isFull ? 0.5 : 1,
                      transition: 'border .15s, background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--ink-900)' }}>
                        Sec {s.section}
                        {isFull && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--red)' }}>เต็มแล้ว</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{s.labboy_accepted} / {s.labboy_slots} คน</span>
                    </div>
                    {s.schedule && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>🕐 {s.schedule}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : selectedSection?.schedule ? (
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>🕐 {selectedSection.schedule}</div>
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
              onChange={(e) => setGradeProofFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 13 }}
            />
            {gradeProofFile && (
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>เลือกไฟล์: {gradeProofFile.name}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setApplyTarget(null)}>ยกเลิก</Button>
          <Button
            onClick={confirmApply}
            loading={applyMutation.isPending}
            disabled={!selectedSectionId || (requireGradeProof && !gradeProofFile)}
          >
            ยืนยันสมัคร
          </Button>
        </div>
      </div>
    </Modal>
  )

  return { openApply, modal }
}
