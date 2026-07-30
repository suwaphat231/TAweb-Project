import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types'

const roleRedirect: Record<UserRole, string> = {
  student:    '/student/home',
  instructor: '/instructor/home',
  staff:      '/staff/home',
  admin:      '/admin/overview',
}

const demoAccounts = [
  { role: 'อาจารย์ (มีผู้สมัคร 10 คนให้ทดสอบ)', username: 'somchai', password: 'password123' },
  { role: 'เจ้าหน้าที่', username: 'parinya', password: 'password123' },
  { role: 'Admin', username: 'admin', password: 'password123' },
]

export default function LoginPage() {
  const { isAuthenticated, user, loginWithCredentials, loginWithGoogle } = useAuthStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated && user) navigate(roleRedirect[user.role] || '/', { replace: true })
  }, [isAuthenticated, user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginWithCredentials(username, password)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle(credential: string) {
    try {
      await loginWithGoogle(credential)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Sarabun', sans-serif",
      background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 40%, #EDE9FE 100%)',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: -80, left: -80,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -100, right: -60,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', right: '8%',
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 8px 40px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Card header */}
        <div style={{
          background: 'linear-gradient(135deg, #1B4FD8 0%, #4F46E5 100%)',
          padding: '32px 40px 28px',
          textAlign: 'center',
          color: '#fff',
        }}>
          <div style={{
            width: 56, height: 56,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 16,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700,
            border: '1.5px solid rgba(255,255,255,0.3)',
            marginBottom: 14,
            backdropFilter: 'blur(4px)',
          }}>
            L
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 4 }}>
            LabAssist
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            ระบบจัดการผู้ช่วยปฏิบัติการ · ภาควิชาคอมพิวเตอร์ ม.ศิลปากร
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: '28px 32px 32px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4, textAlign: 'center' }}>
            เข้าสู่ระบบ
          </h2>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 24, textAlign: 'center' }}>
            เลือกวิธีเข้าสู่ระบบตามบทบาทของคุณ
          </p>

          {/* Section A: นักศึกษา */}
          <div style={{
            border: '1.5px solid #E0E7FF',
            borderRadius: 12,
            padding: '18px 20px',
            marginBottom: 14,
            background: '#FAFBFF',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>นักศึกษา</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: '#EEF2FF', color: '#4F46E5',
                padding: '2px 8px', borderRadius: 999, letterSpacing: '0.3px',
              }}>
                Google Sign-In
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={(resp) => resp.credential && handleGoogle(resp.credential)}
                onError={() => setError('Google Sign-In ล้มเหลว กรุณาลองใหม่')}
                size="large"
                width={340}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-400)', textAlign: 'center', marginTop: 10 }}>
              ต้องใช้อีเมลมหาวิทยาลัย (@silpakorn.edu) เท่านั้น
            </p>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500 }}>หรือ</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Section B: บุคลากร */}
          <div style={{
            border: '1.5px solid #F3F0FF',
            borderRadius: 12,
            padding: '18px 20px',
            marginBottom: 20,
            background: '#FDFCFF',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>บุคลากร</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: '#F3F0FF', color: '#7C3AED',
                padding: '2px 8px', borderRadius: 999, letterSpacing: '0.3px',
              }}>
                อาจารย์ / เจ้าหน้าที่
              </span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>ชื่อผู้ใช้</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--ink-400)', fontSize: 14,
                  }}>👤</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    autoComplete="username"
                    required
                    style={{
                      width: '100%', padding: '9px 12px 9px 34px',
                      border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
                      fontSize: 14, color: 'var(--ink-900)', outline: 'none', background: '#fff',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#4F46E5')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>รหัสผ่าน</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--ink-400)', fontSize: 14,
                  }}>🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    style={{
                      width: '100%', padding: '9px 38px 9px 34px',
                      border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
                      fontSize: 14, color: 'var(--ink-900)', outline: 'none', background: '#fff',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#4F46E5')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-400)', fontSize: 14, padding: 2,
                    }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                  padding: '9px 13px', borderRadius: 8,
                  fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 0',
                  background: loading ? '#A5B4FC' : 'linear-gradient(135deg, #1B4FD8 0%, #4F46E5 100%)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: 2, transition: 'opacity .15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: loading ? 'none' : '0 2px 8px rgba(79,70,229,0.3)',
                }}
              >
                {loading && (
                  <span style={{
                    display: 'inline-block', width: 15, height: 15,
                    border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff',
                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  }} />
                )}
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>

          {/* Demo accounts */}
          <details style={{ marginTop: 4 }}>
            <summary style={{
              fontSize: 12, color: 'var(--ink-400)', cursor: 'pointer',
              listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
              userSelect: 'none',
            }}>
              <span style={{
                display: 'inline-block', width: 16, height: 16,
                background: 'var(--line)', borderRadius: 4,
                fontSize: 9, textAlign: 'center', lineHeight: '16px',
              }}>▾</span>
              บัญชีทดสอบ
            </summary>
            <div style={{
              marginTop: 10,
              background: '#F8F9FB',
              borderRadius: 8,
              padding: '12px 14px',
              border: '1px solid var(--line)',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['บทบาท', 'Username', 'Password'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', color: 'var(--ink-400)', fontWeight: 600, paddingBottom: 6 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demoAccounts.map((a) => (
                    <tr
                      key={a.username}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setUsername(a.username); setPassword(a.password) }}
                    >
                      <td style={{ color: 'var(--ink-700)', paddingBottom: 4 }}>{a.role}</td>
                      <td style={{ color: '#4F46E5', fontFamily: 'monospace', paddingBottom: 4 }}>{a.username}</td>
                      <td style={{ color: 'var(--ink-500)', fontFamily: 'monospace', paddingBottom: 4 }}>{a.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                คลิกแถวเพื่อกรอกอัตโนมัติ
              </p>
            </div>
          </details>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
