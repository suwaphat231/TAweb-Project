import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../services/api'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  return (
    <header style={{
      height: 'var(--topbar-h)',
      background: '#fff',
      borderBottom: '1.5px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, background: 'var(--primary)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink-900)' }}>LabAssist</span>
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>ภาควิชาคอมพิวเตอร์ ม.ศิลปากร</span>
      </div>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={user.full_name} size={32} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.2 }}>{user.full_name}</div>
            <Badge value={user.role} size="sm" />
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'var(--line-soft)', border: 'none', borderRadius: 'var(--radius-btn)', padding: '6px 14px', fontSize: 13, color: 'var(--ink-700)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
          >
            ออกจากระบบ
          </button>
        </div>
      )}
    </header>
  )
}
