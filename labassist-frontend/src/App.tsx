import { useEffect } from 'react'
import { ToastProvider } from './components/ui/Toast'
import { AppRouter } from './router'
import { useAuthStore } from './store/authStore'
import { authApi } from './services/api'

export default function App() {
  const token = useAuthStore((state) => state.token)
  useEffect(() => {
    let active = true
    if (token) {
      authApi.me().then((user) => {
        if (active && useAuthStore.getState().token === token) useAuthStore.getState().setUser(user)
      }).catch(() => { /* 401 handled by response interceptor */ })
    }
    return () => { active = false }
  }, [token])

  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  )
}
