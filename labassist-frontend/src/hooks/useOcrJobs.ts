import { useQuery } from '@tanstack/react-query'
import { studentApi } from '../services/api'
import type { OcrJobKind } from '../types'

/**
 * The student's background OCR job of one kind, read from the server so a
 * page left mid-upload still shows it running when the student comes back.
 * The "ocr_finished" WebSocket event refreshes it (see useWebSocket); the
 * slow poll only covers a dropped socket.
 */
export function useOcrJob(kind: OcrJobKind) {
  const { data } = useQuery({
    queryKey: ['ocr-jobs'],
    queryFn: studentApi.ocrJobs,
    refetchInterval: (query) =>
      query.state.data && Object.values(query.state.data).some((j) => j?.status === 'processing') ? 15000 : false,
  })
  const job = data?.[kind] ?? null
  return {
    processing: job?.status === 'processing',
    error: job?.status === 'failed' ? job.error ?? 'อ่านเอกสารไม่สำเร็จ กรุณาลองใหม่' : undefined,
  }
}
