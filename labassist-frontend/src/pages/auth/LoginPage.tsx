import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../store/authStore'
import { authApi } from '../../services/api'
import { signOutOfGoogle } from '../../services/googleAccount'
import { Avatar, Button, Modal } from '../../components/ui'
import type { User, UserRole } from '../../types'

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
  const { isAuthenticated, user, login, loginWithCredentials, loginWithDevAccount } = useAuthStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devLoadingFor, setDevLoadingFor] = useState<string | null>(null)
  const [selectedInstructor, setSelectedInstructor] = useState(devInstructors[0].username)
  // A Google sign-in waits here until the person confirms it is their account,
  // so nobody continues in a previous person's Google session by mistake.
  const [pendingGoogle, setPendingGoogle] = useState<{ token: string; user: User } | null>(null)
  const [googleNotice, setGoogleNotice] = useState('')

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
    setGoogleNotice('')
    try {
      const { token, user } = await authApi.google({ credential })
      setPendingGoogle({ token, user })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  function confirmGoogle() {
    if (pendingGoogle) login(pendingGoogle.token, pendingGoogle.user)
    setPendingGoogle(null)
  }

  function rejectGoogle() {
    setPendingGoogle(null)
    signOutOfGoogle()
    setGoogleNotice('ออกจากบัญชี Google เดิมในแท็บใหม่แล้ว กดปุ่ม Google อีกครั้งแล้วเข้าสู่ระบบด้วยบัญชีของคุณ')
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
    <div className="lg-root">
      {/* Brand panel (hidden on small screens) */}
      <aside className="lg-brand" aria-hidden="true">
        <span className="lg-orb lg-orb-a" />
        <span className="lg-orb lg-orb-b" />
        <div className="lg-brand-inner">
          <div className="lg-logo-row">
            <span className="lg-logo">L</span>
            <span className="lg-logo-text">LabAssist</span>
          </div>
          <h1 className="lg-hero">ระบบจัดการ<br />ผู้ช่วยปฏิบัติการ</h1>
          <p className="lg-hero-sub">ภาควิชาคอมพิวเตอร์ คณะวิทยาศาสตร์ มหาวิทยาลัยศิลปากร</p>
          <ul className="lg-points">
            {[
              'สมัครเป็น Lab Boy และติดตามสถานะได้ในที่เดียว',
              'อาจารย์ประกาศรับสมัครและคัดเลือกผู้ช่วยได้ง่าย',
              'เอกสารและตารางปฏิบัติงานครบ จบในระบบเดียว',
            ].map((t) => (
              <li key={t}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="lg-main">
        <div className="lg-card">
          <div className="lg-mobile-logo">
            <span className="lg-logo">L</span>
            <span className="lg-logo-text-dark">LabAssist</span>
          </div>

          <h2 className="lg-title">เข้าสู่ระบบ</h2>
          <p className="lg-sub">เลือกวิธีเข้าสู่ระบบตามบทบาทของคุณ</p>

          {/* Section A: นักศึกษา */}
          <section className="lg-section" aria-labelledby="lg-student">
            <div className="lg-section-head">
              <span id="lg-student" className="lg-section-title">นักศึกษา</span>
              <span className="lg-badge">Google Sign-In</span>
            </div>
            <div className="lg-google">
              {import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ? <GoogleLogin
                onSuccess={(resp) => {
                  if (resp.credential) void handleGoogle(resp.credential)
                  else setError('ไม่ได้รับข้อมูลเข้าสู่ระบบจาก Google กรุณาลองใหม่')
                }}
                onError={() => setError('Google Sign-In ล้มเหลว กรุณาลองใหม่')}
                // Never sign in with whichever account the browser last used,
                // and hint Google to offer university accounts (GIS calls the
                // option `hd`; the library's types do not list it).
                auto_select={false}
                {...{ hd: 'silpakorn.edu' }}
                size="large"
                width={340}
              /> : <p role="status" className="lg-hint">Google Sign-In ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>}
            </div>
            <p className="lg-hint">ต้องใช้อีเมลมหาวิทยาลัย (@silpakorn.edu) เท่านั้น</p>
            {googleNotice && <div role="status" className="lg-notice">{googleNotice}</div>}
          </section>

          <div className="lg-divider"><span>หรือ</span></div>

          {/* Section B: บุคลากร */}
          <section className="lg-section" aria-labelledby="lg-staff">
            <div className="lg-section-head">
              <span id="lg-staff" className="lg-section-title">บุคลากร</span>
              <span className="lg-badge">อาจารย์ / เจ้าหน้าที่</span>
            </div>

            <form onSubmit={handleSubmit} className="lg-form">
              <div className="lg-field">
                <label htmlFor="lg-username">ชื่อผู้ใช้</label>
                <div className="lg-input-wrap">
                  <svg className="lg-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                  <input
                    id="lg-username"
                    className="lg-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="lg-field">
                <label htmlFor="lg-password">รหัสผ่าน</label>
                <div className="lg-input-wrap">
                  <svg className="lg-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  <input
                    id="lg-password"
                    className="lg-input lg-input-pw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="lg-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <div role="alert" className="lg-error">{error}</div>}

              <button type="submit" disabled={loading} className="lg-submit">
                {loading && <span className="lg-spinner" />}
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          </section>

          <div style={{ height: 16 }} />
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
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes lg-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes lg-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .lg-root { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); font-family: 'Sarabun', sans-serif; background: var(--bg); }
        .lg-brand { position: relative; overflow: hidden; display: flex; align-items: center; padding: 56px; color: #fff;
          background: radial-gradient(900px 500px at 10% 0%, rgba(56,135,190,.45), transparent 60%), var(--brand-gradient); }
        .lg-orb { position: absolute; border-radius: 50%; background: rgba(255,255,255,.08); animation: lg-float 9s ease-in-out infinite; }
        .lg-orb-a { width: 340px; height: 340px; right: -90px; top: -80px; }
        .lg-orb-b { width: 220px; height: 220px; left: -60px; bottom: -70px; animation-delay: -4s; background: rgba(255,255,255,.06); }
        .lg-brand-inner { position: relative; max-width: 460px; }
        .lg-logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 44px; }
        .lg-logo { width: 44px; height: 44px; border-radius: 13px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #fff; background: var(--accent); box-shadow: 0 6px 16px rgba(56,135,190,.4); }
        .lg-logo-text { font-size: 22px; font-weight: 700; letter-spacing: -.2px; }
        .lg-logo-text-dark { font-size: 22px; font-weight: 700; color: var(--ink-900); }
        .lg-hero { font-size: 40px; line-height: 1.25; font-weight: 700; margin: 0 0 14px; letter-spacing: -.5px; }
        .lg-hero-sub { font-size: 15px; line-height: 1.6; opacity: .8; margin: 0 0 36px; }
        .lg-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        .lg-points li { display: flex; align-items: flex-start; gap: 12px; font-size: 15px; line-height: 1.5; }
        .lg-points li svg { flex-shrink: 0; margin-top: 0; padding: 4px; border-radius: 50%; background: rgba(255,255,255,.18); }

        .lg-main { display: flex; align-items: center; justify-content: center; padding: 32px 20px; background: var(--primary-50); }
        .lg-card { width: 100%; max-width: 440px; background: var(--bg); border: 1px solid var(--line); border-radius: 20px; padding: 36px 36px 32px; box-shadow: 0 20px 50px -20px rgba(42,34,98,.25), 0 2px 6px rgba(42,34,98,.05); animation: lg-in .35s ease-out; }
        .lg-mobile-logo { display: none; align-items: center; justify-content: center; gap: 10px; margin-bottom: 20px; }
        .lg-title { font-size: 26px; font-weight: 700; color: var(--ink-900); margin: 0 0 4px; text-align: center; }
        .lg-sub { font-size: 14px; color: var(--ink-500); margin: 0 0 24px; text-align: center; }

        .lg-section { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; background: var(--bg); }
        .lg-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
        .lg-section-title { font-size: 15px; font-weight: 700; color: var(--ink-900); }
        .lg-badge { font-size: 11px; font-weight: 600; color: var(--primary); background: var(--primary-50); padding: 3px 10px; border-radius: 999px; }
        .lg-google { display: flex; justify-content: center; min-height: 44px; max-width: 100%; overflow: hidden; }
        .lg-hint { font-size: 12px; color: var(--ink-500); text-align: center; margin: 10px 0 0; }
        .lg-notice { background: var(--primary-50); color: var(--ink-700); border: 1px solid var(--line); padding: 9px 13px; border-radius: 10px; font-size: 13px; margin-top: 10px; }
        .lg-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; color: var(--ink-500); font-size: 12px; }
        .lg-divider::before, .lg-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }

        .lg-form { display: flex; flex-direction: column; gap: 14px; }
        .lg-field { display: flex; flex-direction: column; gap: 6px; }
        .lg-field label { font-size: 13px; font-weight: 600; color: var(--ink-700); }
        .lg-input-wrap { position: relative; }
        .lg-ic { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--ink-500); pointer-events: none; }
        .lg-input { width: 100%; box-sizing: border-box; height: 46px; padding: 0 14px 0 42px; border: 1.5px solid var(--line); border-radius: 12px; font-size: 15px; font-family: inherit; color: var(--ink-900); background: var(--bg); transition: border-color .15s, box-shadow .15s; }
        .lg-input-pw { padding-right: 46px; }
        .lg-input::placeholder { color: var(--ink-400); opacity: .7; }
        .lg-input:hover { border-color: var(--ink-400); }
        .lg-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(56,65,157,.14); }
        .lg-eye { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; border-radius: 10px; color: var(--ink-500); cursor: pointer; }
        .lg-eye:hover { background: var(--primary-50); color: var(--primary); }
        .lg-eye:focus-visible, .lg-submit:focus-visible { outline: 3px solid rgba(56,65,157,.35); outline-offset: 2px; }
        .lg-error { background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; }
        .lg-submit { width: 100%; height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: inherit; color: #fff; cursor: pointer; background: var(--brand-gradient); box-shadow: 0 8px 20px -8px rgba(56,65,157,.6); transition: transform .15s, box-shadow .15s, opacity .15s; }
        .lg-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 24px -8px rgba(56,65,157,.65); }
        .lg-submit:active:not(:disabled) { transform: translateY(0); }
        .lg-submit:disabled { opacity: .65; cursor: not-allowed; }
        .lg-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }

        @media (max-width: 960px) {
          .lg-root { grid-template-columns: 1fr; }
          .lg-brand { display: none; }
          .lg-mobile-logo { display: flex; }
        }
        @media (max-width: 480px) { .lg-card { padding: 28px 20px 24px; border-radius: 16px; } .lg-main { padding: 20px 16px; } }
        @media (prefers-reduced-motion: reduce) { .lg-orb, .lg-card, .lg-spinner { animation: none; } .lg-submit { transition: none; } }
      `}</style>

      <Modal
        isOpen={pendingGoogle !== null}
        onClose={rejectGoogle}
        title="ใช่บัญชีของคุณไหม?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={rejectGoogle}>ไม่ใช่ฉัน</Button>
            <Button type="button" onClick={confirmGoogle}>ใช่ ดำเนินการต่อ</Button>
          </>
        }
      >
        {pendingGoogle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar src={pendingGoogle.user.avatar_url} size={48} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>{pendingGoogle.user.full_name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', overflowWrap: 'anywhere' }}>{pendingGoogle.user.email}</div>
              {pendingGoogle.user.student_id && (
                <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>รหัสนักศึกษา {pendingGoogle.user.student_id}</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
