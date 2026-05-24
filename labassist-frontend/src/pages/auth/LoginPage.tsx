import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../store/authStore'
import { useIsMobile } from '../../hooks/useMediaQuery'
import type { UserRole } from '../../types'

const roleRedirect: Record<UserRole, string> = {
  student: '/student',
  instructor: '/instructor/announce',
  staff: '/staff/docs',
  admin: '/admin',
}

const features = [
  { icon: '📋', text: 'ประกาศรับ TA/Lab boy ทุกวิชาในที่เดียว' },
  { icon: '⚡', text: 'สมัครออนไลน์ ไม่ต้องใช้กระดาษ' },
  { icon: '🔔', text: 'ติดตามสถานะการสมัครแบบ Real-time' },
  { icon: '🎓', text: 'เชื่อมต่อกับ Google Account ของมหาวิทยาลัย' },
]

const demoAccounts = [
  { role: 'อาจารย์', username: 'somchai', password: 'password123' },
  { role: 'เจ้าหน้าที่', username: 'parinya', password: 'password123' },
  { role: 'Admin', username: 'admin', password: 'admin123' },
]

export default function LoginPage() {
  const { isAuthenticated, user, loginWithCredentials, loginWithGoogle } = useAuthStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
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
    } catch {
      setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Sarabun', sans-serif" }}>
      {/* Left Panel */}
      {!isMobile && (
        <div style={{
          width: '45%',
          background: 'linear-gradient(160deg, #0F1E45 0%, #1B4FD8 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 56px',
          color: '#fff',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
            <div style={{
              width: 52, height: 52,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700,
              border: '1.5px solid rgba(255,255,255,0.25)',
            }}>
              L
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>LabAssist</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 1 }}>ภาควิชาคอมพิวเตอร์ ม.ศิลปากร</div>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.35, marginBottom: 16 }}>
            ระบบจัดการ<br />ผู้ช่วยปฏิบัติการ
          </h1>
          <p style={{ fontSize: 15, opacity: 0.75, lineHeight: 1.7, marginBottom: 48 }}>
            ค้นหา สมัคร และติดตามตำแหน่ง TA และ Lab boy<br />
            ทุกวิชาในภาคเรียนนี้ผ่านระบบออนไลน์
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {features.map((f) => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 14, opacity: 0.85 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right Panel */}
      <div style={{
        flex: 1,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '40px 24px' : '40px 56px',
        overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo */}
          {isMobile && (
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                width: 52, height: 52,
                background: 'var(--primary)',
                borderRadius: 16,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 12,
              }}>
                L
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>LabAssist</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
                ระบบจัดการผู้ช่วยปฏิบัติการ
              </div>
            </div>
          )}

          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 6 }}>
            เข้าสู่ระบบ
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginBottom: 32 }}>
            เลือกวิธีเข้าสู่ระบบตามบทบาทของคุณ
          </p>

          {/* Section A: นักศึกษา */}
          <div style={{
            border: '1.5px solid var(--line)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>นักศึกษา</span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: 'var(--blue-bg)', color: 'var(--blue)',
                padding: '2px 8px', borderRadius: 999,
              }}>
                Google Sign-In
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={(resp) => resp.credential && handleGoogle(resp.credential)}
                onError={() => setError('Google Sign-In ล้มเหลว กรุณาลองใหม่')}
                locale="th"
                size="large"
                width={340}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-400)', textAlign: 'center', marginTop: 10 }}>
              ใช้ Gmail หรืออีเมลมหาวิทยาลัยของคุณ
            </p>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>หรือ</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Section B: บุคลากร */}
          <div style={{
            border: '1.5px solid var(--line)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>บุคลากร</span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: '#F3F0FF', color: '#7C3AED',
                padding: '2px 8px', borderRadius: 999,
              }}>
                อาจารย์ / เจ้าหน้าที่
              </span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>ชื่อผู้ใช้</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--ink-400)', fontSize: 15,
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
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>รหัสผ่าน</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--ink-400)', fontSize: 15,
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
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
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
                  background: 'var(--red-bg)', color: 'var(--red)',
                  padding: '9px 13px', borderRadius: 'var(--radius-input)',
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
                  background: loading ? 'var(--primary-100)' : 'var(--primary)',
                  color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)',
                  fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: 4, transition: 'background .15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {loading && <span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%' }} />}
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </div>

          {/* Demo accounts */}
          <div style={{
            background: 'var(--line-soft)',
            borderRadius: 10,
            padding: '14px 16px',
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 10 }}>
              บัญชีทดสอบ
            </p>
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
                    <td style={{ color: 'var(--primary)', fontFamily: 'monospace', paddingBottom: 4 }}>{a.username}</td>
                    <td style={{ color: 'var(--ink-500)', fontFamily: 'monospace', paddingBottom: 4 }}>{a.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>
              คลิกแถวเพื่อกรอกอัตโนมัติ
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
