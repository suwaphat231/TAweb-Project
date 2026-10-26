import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { useOcrJob } from '../../../hooks/useOcrJobs'
import type { OcrJobs } from '../../../types'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * The student's registrar (REG) profile-card screenshot with the OCR result,
 * attaching it and confirming it.
 */
export function useStudentInfoDoc() {
  const qc = useQueryClient()
  const showToast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['student-info-doc'],
    queryFn: studentApi.getStudentInfo,
    retry: (failCount, err) => {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return false
      return failCount < 2
    },
  })

  // The OCR runs on the server in the background, so the student may leave
  // the page; the "ocr_finished" WebSocket event refreshes the document.
  const job = useOcrJob('student_info')
  const uploadMut = useMutation({
    mutationFn: (file: File) => studentApi.uploadStudentInfo(file),
    onSuccess: () => {
      qc.setQueryData<OcrJobs>(['ocr-jobs'], (old) => ({
        transcript: old?.transcript ?? null,
        student_info: { status: 'processing', started_at: new Date().toISOString() },
      }))
      showToast('กำลังอ่านเอกสาร ไปหน้าอื่นได้ ระบบจะแจ้งเมื่ออ่านเสร็จ', 'info')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const confirmMut = useMutation({
    mutationFn: () => studentApi.confirmStudentInfo(),
    onSuccess: (result) => {
      qc.setQueryData(['student-info-doc'], result)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast('ยืนยันสถานภาพเรียบร้อยแล้ว', 'success')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'ยืนยันไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast('รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('ไฟล์ขนาดใหญ่เกินไป (สูงสุด 10 MB)', 'error')
      return
    }
    uploadMut.mutate(file)
  }

  return {
    doc: data?.document,
    cmp: data?.comparison,
    isLoading,
    isUploading: uploadMut.isPending || job.processing,
    /** Why the last background read failed, until the student retries. */
    uploadError: job.processing ? undefined : job.error,
    isConfirming: confirmMut.isPending,
    confirm: () => confirmMut.mutate(),
    onFileChange,
    accept: ACCEPTED_TYPES.join(','),
  }
}

export type StudentInfoDocState = ReturnType<typeof useStudentInfoDoc>
