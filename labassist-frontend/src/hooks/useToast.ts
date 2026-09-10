import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'
export const ToastContext = createContext<{ show: (message: string, type?: ToastType) => void } | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context.show
}
