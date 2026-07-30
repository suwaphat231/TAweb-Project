import { useEffect } from 'react'
import { ToastProvider } from './components/ui/Toast'
import { AppRouter } from './router'
import { useAuthStore } from './store/authStore'
import { authApi } from './services/api'

export default function App() {
  useEffect(() => {
    const { token, setUser } = useAuthStore.getState()
    if (token) {
      authApi.me().then(setUser).catch(() => { /* 401 handled by response interceptor */ })
    }
  }, [])

  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  )
}
