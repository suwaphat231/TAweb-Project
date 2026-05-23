import { useToast } from './hooks/useToast'
import { ToastContainer } from './components/ui/Toast'
import { AppRouter } from './router'

export default function App() {
  const { toasts, dismiss } = useToast()
  return (
    <>
      <AppRouter />
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  )
}
