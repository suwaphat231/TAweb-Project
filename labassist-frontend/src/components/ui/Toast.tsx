import { useCallback, useState, type ReactNode } from 'react'
import { ToastContext, type ToastType } from '../../hooks/useToast'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

const typeConfig: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'var(--green)',   icon: '✓' },
  error:   { bg: 'var(--red)',     icon: '✕' },
  warning: { bg: 'var(--amber)',   icon: '!' },
  info:    { bg: 'var(--primary)', icon: 'i' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <style>{`@keyframes toastIn { from { transform:translateX(110%); opacity:0; } to { transform:none; opacity:1; } }`}</style>
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: typeConfig[t.type].bg, color: '#fff',
              padding: '12px 20px',
              borderRadius: 'var(--radius-card)',
              fontSize: 14, fontWeight: 500,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'center', gap: 10,
              minWidth: 240, maxWidth: 360,
              cursor: 'pointer', pointerEvents: 'auto',
              animation: 'toastIn .25s ease',
            }}
            onClick={() => dismiss(t.id)}
          >
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {typeConfig[t.type].icon}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <span style={{ opacity: 0.7, fontSize: 18, lineHeight: 1 }}>×</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
