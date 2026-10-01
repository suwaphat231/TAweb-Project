import { useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../services/api'
import { useToast } from './useToast'
import { useAuth } from './useAuth'
import type { BlacklistEntry } from '../types'

type ApiError = { response?: { data?: { error?: string } } }

// Revoke is allowed for whoever filed the entry, or an admin — mirrors the
// backend check in Teacher/blacklist.go.
export function useBlacklistRevoke() {
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuth()
  const mut = useMutation({
    mutationFn: (id: number) => instructorApi.revokeBlacklist(id),
    onSuccess: () => {
      invalidateBlacklistQueries(qc)
      showToast('ยกเลิก blacklist แล้ว', 'success')
    },
    onError: (err: ApiError) => showToast(err?.response?.data?.error ?? 'ไม่สามารถยกเลิก blacklist ได้', 'error'),
  })
  const canRevoke = (b: BlacklistEntry) => user?.role === 'admin' || b.reported_by_id === user?.id
  return { mut, canRevoke }
}

export function invalidateBlacklistQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['blacklist'] })
  qc.invalidateQueries({ queryKey: ['applicants'] })
  qc.invalidateQueries({ queryKey: ['course-applicants'] })
}
