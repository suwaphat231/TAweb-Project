import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import type { StudentInfoKind } from '../../../types'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * The student's registrar (REG) screenshots — one of the ข้อมูลนักศึกษา box
 * and one of the ข้อมูลส่วนตัว box — with the OCR result, attaching either
 * one and confirming them together.
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

  const uploadMut = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: StudentInfoKind }) => studentApi.uploadStudentInfo(file, kind),
    onSuccess: (result) => {
      qc.setQueryData(['student-info-doc'], result)
      showToast('อ่านข้อมูลจากเอกสารเรียบร้อยแล้ว', 'success')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const confirmMut = useMutation({
    mutationFn: (applyToProfile: boolean) => studentApi.confirmStudentInfo(applyToProfile),
    onSuccess: (result, applyToProfile) => {
      qc.setQueryData(['student-info-doc'], result)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast(
        applyToProfile ? 'ยืนยันและอัปเดตโปรไฟล์เรียบร้อยแล้ว' : 'ยืนยันเอกสารเรียบร้อยแล้ว',
        'success',
      )
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      showToast(err?.response?.data?.error ?? 'ยืนยันไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const onFileChange = (kind: StudentInfoKind) => (e: React.ChangeEvent<HTMLInputElement>) => {
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
    uploadMut.mutate({ file, kind })
  }

  return {
    doc: data?.document,
    cmp: data?.comparison,
    isLoading,
    isUploading: uploadMut.isPending,
    uploadingKind: uploadMut.isPending ? uploadMut.variables?.kind : undefined,
    isConfirming: confirmMut.isPending,
    confirm: (applyToProfile: boolean) => confirmMut.mutate(applyToProfile),
    onFileChange,
    accept: ACCEPTED_TYPES.join(','),
  }
}

export type StudentInfoDocState = ReturnType<typeof useStudentInfoDoc>
