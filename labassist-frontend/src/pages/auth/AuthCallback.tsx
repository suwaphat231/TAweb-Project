import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../services/api'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()
  const pending = useRef<{ credential: string; result: ReturnType<typeof authApi.google> } | null>(null)

  useEffect(() => {
    let active = true
    const credential = params.get('credential')
    if (!credential) { navigate('/login'); return }
    if (pending.current?.credential !== credential) {
      pending.current = { credential, result: authApi.google({ credential }) }
    }
    pending.current.result
      .then(({ token, user }) => { if (active) { login(token, user); navigate('/') } })
      .catch(() => { if (active) navigate('/login?error=google_failed') })
    return () => { active = false }
  }, [params, login, navigate])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--primary-100)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} className="animate-spin" />
    </div>
  )
}
