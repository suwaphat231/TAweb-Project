import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { useToast } from './useToast'
import { studentApi } from '../services/api'
import type { OcrFinishedEvent } from '../types'

export function useWebSocket() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()
  const showToast = useToast()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const currentToken = token
    let isCancelled = false

    function invalidateApplications() {
      qc.invalidateQueries({ queryKey: ['my-applications'] })
      qc.invalidateQueries({ queryKey: ['student', 'my-applications'] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      qc.invalidateQueries({ queryKey: ['applicants'] })
      qc.invalidateQueries({ queryKey: ['course-applicants'] })
      qc.invalidateQueries({ queryKey: ['instructor-courses'] })
    }

    function connect() {
      if (isCancelled) return

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(currentToken)}`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[WebSocket] Connected')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('[WebSocket] Message received:', data)

            if (data.type === 'notification') {
              // Real-time cache invalidation so UI updates instantly
              qc.invalidateQueries({ queryKey: ['notifications'] })
              invalidateApplications()

              const title = data.payload?.title || 'มีการแจ้งเตือนใหม่'
              showToast(title, 'info')
            } else if (data.type === 'application_updated') {
              // An application was submitted, accepted, rejected or withdrawn:
              // refresh both the student's own list and instructor/staff views.
              invalidateApplications()
            } else if (data.type === 'ocr_finished') {
              // A background OCR upload ended — maybe while the student was on
              // another page — so refresh what it wrote and say how it went.
              const event = data.payload as OcrFinishedEvent
              qc.invalidateQueries({ queryKey: ['ocr-jobs'] })
              if (event.status === 'done') {
                if (event.kind === 'transcript') {
                  qc.invalidateQueries({ queryKey: ['transcript-images'] })
                } else {
                  qc.invalidateQueries({ queryKey: ['student-info-doc'] })
                }
                // The grades (and status) live on the profile, which the auth
                // store also holds.
                qc.fetchQuery({ queryKey: ['student-profile'], queryFn: studentApi.profile, staleTime: 0 })
                  .then((user) => useAuthStore.getState().setUser(user))
                  .catch(() => {})
                showToast(event.kind === 'transcript' ? 'อ่านใบเกรดเสร็จแล้ว' : 'อ่านเอกสารสถานภาพเสร็จแล้ว', 'success')
              } else {
                const what = event.kind === 'transcript' ? 'อ่านใบเกรดไม่สำเร็จ' : 'อ่านเอกสารสถานภาพไม่สำเร็จ'
                showToast(event.error ? `${what}: ${event.error}` : what, 'error')
              }
            } else if (data.type === 'courses_updated') {
              // A posting was opened, closed or changed: refresh course lists
              // so students see newly opened courses without reloading.
              qc.invalidateQueries({ queryKey: ['student-courses'] })
              qc.invalidateQueries({ queryKey: ['student-dashboard'] })
              qc.invalidateQueries({ queryKey: ['courses'] })
            }
          } catch (e) {
            console.error('[WebSocket] Failed to parse message', e)
          }
        }

        ws.onclose = (event) => {
          console.log('[WebSocket] Disconnected:', event.code, event.reason)
          wsRef.current = null
          if (!isCancelled) {
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect()
            }, 4000)
          }
        }

        ws.onerror = (err) => {
          console.warn('[WebSocket] Connection error:', err)
          ws.close()
        }
      } catch (err) {
        console.error('[WebSocket] Setup error:', err)
      }
    }

    connect()

    return () => {
      isCancelled = true
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [token, qc, showToast])
}
