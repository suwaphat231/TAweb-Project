import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { UserRole } from '../../types'

const roleRedirect: Record<UserRole, string> = {
  student: '/student',
  instructor: '/instructor/announce',
  staff: '/staff/docs',
  admin: '/admin',
}

export default function LoginPage() {
  const { isAuthenticated, login, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated && user) navigate(roleRedirect[user.role] || '/', { replace: true })
  }, [isAuthenticated, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user: u } = await authApi.login({ username, password })
      login(token, u)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle(credential: string) {
    try {
      const { token, user: u } = await authApi.google({ credential })
      login(token, u)
    } catch {
      setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--primary-50) 0%, #fff 60%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 60, height: 60, background: 'var(--primary)', borderRadius: 18,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 10px 30px rgba(27,79,216,.28)',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>LabAssist</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
            ระบบจัดการผู้ช่วยปฏิบัติการ<br />
            ภาควิชาคอมพิวเตอร์ มหาวิทยาลัยศิลปากร
          </p>
        </div>

        <Card padding={36}>
          {/* Google section */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-500)', textAlign: 'center', marginBottom: 14 }}>
              สำหรับนักศึกษา — เข้าสู่ระบบด้วย Google
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={(resp) => resp.credential && handleGoogle(resp.credential)}
                onError={() => setError('Google Sign-In ล้มเหลว')}
                locale="th"
                size="large"
                width={320}
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>
              เจ้าหน้าที่ / อาจารย์ / Admin
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Password form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label="ชื่อผู้ใช้"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
              required
            />
            <Input
              label="รหัสผ่าน"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            {error && (
              <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-input)', fontSize: 13 }}>
                {error}
              </div>
            )}
            <Button type="submit" loading={loading} fullWidth style={{ marginTop: 4 }}>
              เข้าสู่ระบบ
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
