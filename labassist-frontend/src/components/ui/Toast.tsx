import type { Toast, ToastType } from '../../hooks/useToast'

const colors: Record<ToastType, { bg: string; color: string }> = {
  success: { bg: 'var(--green)',   color: '#fff' },
  error:   { bg: 'var(--red)',     color: '#fff' },
  warning: { bg: 'var(--amber)',   color: '#fff' },
  info:    { bg: 'var(--primary)', color: '#fff' },
}

interface Props {
  toasts: Toast[]
  dismiss: (id: string) => void
}

export function ToastContainer({ toasts, dismiss }: Props) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} className="animate-fadeIn" style={{
          background: colors[t.type].bg,
          color: colors[t.type].color,
          padding: '12px 20px',
          borderRadius: 'var(--radius-card)',
          fontSize: 14,
          fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 240,
          maxWidth: 360,
          cursor: 'pointer',
        }} onClick={() => dismiss(t.id)}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ opacity: 0.7, fontSize: 16 }}>×</span>
        </div>
      ))}
    </div>
  )
}
