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

const DEV_LOGIN_ENABLED = import.meta.env.VITE_DEV_LOGIN === 'true'

const devQuickAccounts: { label: string; username: string; color: string }[] = [
  { label: 'นักศึกษา',    username: 'demo_std01', color: '#0EA5E9' },
  { label: 'เจ้าหน้าที่', username: 'parinya',    color: '#10B981' },
  { label: 'Admin',        username: 'admin',      color: '#F59E0B' },
]

const devInstructors: { username: string; fullName: string }[] = [
  { username: 'puriwat',      fullName: 'ดร.ภูริวัจน์ วรวิชัยพัฒน์ (มีผู้สมัครทดสอบ)' },
  { username: 'kanraya',      fullName: 'ผศ.ดร.กรัญญา สิทธิสงวน' },
  { username: 'saowaluck',    fullName: 'อ.ดร.เสาวลักษณ์ อร่ามพงศานุวัต' },
  { username: 'kritsana',     fullName: 'ผศ.ดร.กฤษณะ สีพนมวัน' },
  { username: 'natchote',     fullName: 'ผศ.ดร.ณัฐโชติ พรหมฤทธิ์' },
  { username: 'katha',        fullName: 'ผศ.ดร.คทา ประดิษฐวงศ์' },
  { username: 'sunee',        fullName: 'ผศ.ดร.สุนีย์ พงษ์พินิจภิญโญ' },
  { username: 'buchapat',     fullName: 'นายบูชาภัทร ป้านศรี' },
  { username: 'orawan',       fullName: 'ผศ.ดร.อรวรรณ เชาวลิต' },
  { username: 'opas',         fullName: 'ผศ.โอภาส วงษ์ทวีทรัพย์' },
  { username: 'sajjaporn',    fullName: 'ผศ.ดร.สัจจาภรณ์ ไวจรรยา' },
  { username: 'setthalath',   fullName: 'อ.เสฐลัทธ์ รอดเหตุภัย' },
  { username: 'aphisek',      fullName: 'อ.อภิเษก หงษ์วิทยากร' },
  { username: 'panjai',       fullName: 'รศ.ดร.ปานใจ ธารทัศนวงศ์' },
  { username: 'weenawadee',   fullName: 'ผศ.ดร.วีณาวดี ม่วงอ้น' },
  { username: 'panyanat',     fullName: 'ผศ.ดร.ปัญญนัท อ้นพงษ์' },
  { username: 'watsara',      fullName: 'อ.ดร.วัสรา รอดเหตุภัย' },
  { username: 'ratchadaporn', fullName: 'ผศ.ดร.รัชดาพร คณาวงษ์' },
]

const demoAccounts = [
  { role: 'อาจารย์ (มีผู้สมัคร 10 คนให้ทดสอบ)', username: 'puriwat', password: 'password123' },
  { role: 'เจ้าหน้าที่', username: 'parinya', password: 'password123' },
  { role: 'Admin', username: 'admin', password: 'password123' },
]

export default function LoginPage() {
  const { isAuthenticated, user, loginWithCredentials, loginWithGoogle, loginWithDevAccount } = useAuthStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devLoadingFor, setDevLoadingFor] = useState<string | null>(null)
  const [selectedInstructor, setSelectedInstructor] = useState(devInstructors[0].username)

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
      const res = (err as { response?: { data?: { error?: string } } }).response
      // No response means the API is down or unreachable, not a bad password.
      setError(res?.data?.error || (res ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า backend ทำงานอยู่'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle(credential: string) {
    setError('')
    try {
      await loginWithGoogle(credential)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  async function handleDevLogin(username: string) {
    setError('')
    setDevLoadingFor(username)
    try {
      await loginWithDevAccount(username)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || `Dev login ล้มเหลว (${username})`)
    } finally {
      setDevLoadingFor(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Sarabun', sans-serif",
      background: 'var(--bg)',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Card header */}
        <div style={{
          background: 'var(--brand-gradient)',
          padding: '32px 40px 28px',
          textAlign: 'center',
          color: '#fff',
        }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--accent)', color: '#fff',
            borderRadius: 16,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700,
            border: 'none',
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
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '18px 20px',
            marginBottom: 14,
            background: 'var(--bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>นักศึกษา</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: 'var(--bg)', color: 'var(--primary)',
                padding: '2px 8px', borderRadius: 999, letterSpacing: '0.3px',
              }}>
                Google Sign-In
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ? <GoogleLogin
                onSuccess={(resp) => {
                  if (resp.credential) void handleGoogle(resp.credential)
                  else setError('ไม่ได้รับข้อมูลเข้าสู่ระบบจาก Google กรุณาลองใหม่')
                }}
                onError={() => setError('Google Sign-In ล้มเหลว กรุณาลองใหม่')}
                size="large"
                width={340}
              /> : <p role="status">Google Sign-In ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>}
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
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '18px 20px',
            marginBottom: 20,
            background: 'var(--bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>บุคลากร</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: 'var(--bg)', color: 'var(--primary)',
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
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
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
                  background: loading ? 'var(--ink-400)' : 'var(--primary)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  marginTop: 2, transition: 'opacity .15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: 'none',
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

          {/* Dev Quick Login panel — only shown when VITE_DEV_LOGIN=true */}
          {DEV_LOGIN_ENABLED ? (
            <div style={{
              marginTop: 4,
              background: '#FFF7ED',
              border: '1px dashed #F97316',
              borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>🛠️</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#C2410C' }}>Dev Login</span>
                <span style={{ fontSize: 11, color: '#9A3412', opacity: 0.7 }}>— เฉพาะ dev เท่านั้น</span>
              </div>

              {/* Quick roles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 8 }}>
                {devQuickAccounts.map((a) => (
                  <button
                    key={a.username}
                    type="button"
                    disabled={devLoadingFor !== null}
                    onClick={() => void handleDevLogin(a.username)}
                    style={{
                      padding: '7px 6px',
                      background: devLoadingFor === a.username ? '#E5E7EB' : '#fff',
                      border: `1.5px solid ${a.color}`,
                      borderRadius: 7,
                      cursor: devLoadingFor !== null ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'background .1s',
                    }}
                  >
                    <span style={{
                      display: 'inline-block', width: 7, height: 7,
                      borderRadius: '50%', background: a.color, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1F2937' }}>{a.label}</span>
                    {devLoadingFor === a.username && (
                      <span style={{
                        display: 'inline-block', width: 11, height: 11,
                        border: `2px solid ${a.color}40`, borderTopColor: a.color,
                        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                      }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Instructor picker */}
              <div style={{
                display: 'flex', gap: 6, alignItems: 'stretch',
                borderTop: '1px solid #FED7AA', paddingTop: 8,
              }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, color: '#9A3412', fontWeight: 600, pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}>อาจารย์</span>
                  <select
                    value={selectedInstructor}
                    onChange={(e) => setSelectedInstructor(e.target.value)}
                    disabled={devLoadingFor !== null}
                    style={{
                      width: '100%', padding: '7px 8px 7px 52px',
                      border: '1.5px solid #8B5CF6', borderRadius: 7,
                      fontSize: 11, color: '#1F2937', background: '#fff',
                      cursor: 'pointer', appearance: 'none',
                    }}
                  >
                    {devInstructors.map((ins) => (
                      <option key={ins.username} value={ins.username}>
                        {ins.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={devLoadingFor !== null}
                  onClick={() => void handleDevLogin(selectedInstructor)}
                  style={{
                    padding: '7px 12px',
                    background: devLoadingFor === selectedInstructor ? '#E5E7EB' : '#8B5CF6',
                    color: '#fff', border: 'none', borderRadius: 7,
                    fontSize: 11, fontWeight: 600,
                    cursor: devLoadingFor !== null ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    transition: 'opacity .1s',
                  }}
                >
                  {devLoadingFor === selectedInstructor ? (
                    <span style={{
                      display: 'inline-block', width: 11, height: 11,
                      border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff',
                      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                    }} />
                  ) : null}
                  เข้าสู่ระบบ
                </button>
              </div>
            </div>
          ) : (
            /* Demo accounts (fallback when DEV_LOGIN is off) */
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
                        <td style={{ color: 'var(--primary)', fontFamily: 'monospace', paddingBottom: 4 }}>{a.username}</td>
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
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
