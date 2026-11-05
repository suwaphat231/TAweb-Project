import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'

export const CALENDAR_JOB_KEY = ['calendar-job']

/**
 * The admin's background calendar-PDF job, read from the server so it is
 * still there after leaving the page. The "ocr_finished" WebSocket event
 * refreshes it (see useWebSocket); the slow poll only covers a dropped socket.
 */
export function useCalendarJob(enabled = true) {
  return useQuery({
    queryKey: CALENDAR_JOB_KEY,
    queryFn: adminApi.calendarJob,
    enabled,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 15000 : false),
  })
}
