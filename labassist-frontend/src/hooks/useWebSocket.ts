import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { useToast } from './useToast'

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
              qc.invalidateQueries({ queryKey: ['student', 'applications'] })
              qc.invalidateQueries({ queryKey: ['instructor'] })

              const title = data.payload?.title || 'มีการแจ้งเตือนใหม่'
              showToast(title, 'info')
            } else if (data.type === 'application_updated') {
              qc.invalidateQueries({ queryKey: ['student', 'applications'] })
              qc.invalidateQueries({ queryKey: ['instructor'] })
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
