import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../services/api'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const credential = params.get('credential')
    if (!credential) { navigate('/login'); return }
    authApi.google({ credential })
      .then(({ token, user }) => { login(token, user); navigate('/') })
      .catch(() => navigate('/login?error=google_failed'))
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--primary-100)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} className="animate-spin" />
    </div>
  )
}
