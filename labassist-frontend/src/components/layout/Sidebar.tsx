import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authApi } from '../../services/api'
import { Avatar, getInitials } from '../ui/Avatar'
import type { UserRole } from '../../types'

interface Props {
  collapsed?: boolean
  onClose?: () => void
}

function Ico({ name }: { name: string }): ReactNode {
  const s = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'home':      return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    case 'search':    return <svg {...s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    case 'check-square': return <svg {...s}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    case 'user':      return <svg {...s}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case 'megaphone': return <svg {...s}><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
    case 'users':     return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'file-text': return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
    case 'layout':    return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
    case 'book':      return <svg {...s}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    case 'log-out':   return <svg {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    case 'x':         return <svg {...s}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    default: return null
  }
}

interface NavItem { to: string; label: string; icon: string }

const navMap: Record<UserRole, NavItem[]> = {
  student: [
    { to: '/student/home',    label: 'หน้าหลัก',        icon: 'home' },
    { to: '/student/apply',   label: 'ค้นหาและสมัคร',   icon: 'search' },
    { to: '/student/status',  label: 'สถานะการสมัคร',   icon: 'check-square' },
    { to: '/student/profile', label: 'โปรไฟล์ของฉัน',   icon: 'user' },
  ],
  instructor: [
    { to: '/instructor/home',     label: 'ภาพรวม',           icon: 'home' },
    { to: '/instructor/announce', label: 'จัดการประกาศ',     icon: 'megaphone' },
    { to: '/instructor/select',   label: 'คัดเลือกผู้สมัคร', icon: 'users' },
    { to: '/instructor/profile',  label: 'ข้อมูลส่วนตัว',    icon: 'user' },
  ],
  staff: [
    { to: '/staff/home', label: 'ภาพรวม',       icon: 'home' },
    { to: '/staff/docs', label: 'จัดการเอกสาร', icon: 'file-text' },
  ],
  admin: [
    { to: '/admin/overview', label: 'ภาพรวม',         icon: 'layout' },
    { to: '/admin/courses',  label: 'จัดการรายวิชา',  icon: 'book' },
    { to: '/admin/users',    label: 'จัดการผู้ใช้งาน', icon: 'users' },
  ],
}

const roleLabel: Record<UserRole, string> = {
  student:    'นักศึกษา',
  instructor: 'อาจารย์',
  staff:      'เจ้าหน้าที่',
  admin:      'ผู้ดูแลระบบ',
}

export function Sidebar({ collapsed = false, onClose }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const items = user ? (navMap[user.role] ?? []) : []

  async function handleLogout() {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  return (
    <aside style={{
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: '#fff',
      borderRight: '1.5px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      width: collapsed ? 64 : 248,
      transition: 'width .2s ease',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{
        padding: collapsed ? '16px 0' : '20px 20px 16px',
        borderBottom: '1px solid var(--line-soft)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #1B4FD8 0%, #4F46E5 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 17, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
          }}>L</div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.2 }}>LabAssist</div>
              <div style={{ fontSize: 10, color: 'var(--ink-400)', lineHeight: 1.3, marginTop: 1 }}>ภาควิชาคอมพิวเตอร์ มศก.</div>
            </div>
          )}
        </div>
        {/* Close button for mobile drawer */}
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', padding: 4, display: 'flex' }}
          >
            <Ico name="x" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: collapsed ? '10px 0' : '10px 0' }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            title={collapsed ? item.label : undefined}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? 0 : 10,
              padding: collapsed ? '10px 0' : '9px 20px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--primary)' : 'var(--ink-700)',
              background: isActive ? 'var(--primary-50)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
              textDecoration: 'none',
              transition: 'background .1s, color .1s',
            })}
          >
            <span style={{ flexShrink: 0, display: 'flex' }}><Ico name={item.icon} /></span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {user && (
        <div style={{
          padding: collapsed ? '12px 0' : '14px 16px',
          borderTop: '1px solid var(--line-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          flexShrink: 0,
        }}>
          <Avatar initials={getInitials(user.full_name)} color="blue" size={34} />
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>{roleLabel[user.role]}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="ออกจากระบบ"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-400)', padding: 6, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'color .1s, background .1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-400)'; e.currentTarget.style.background = 'none' }}
            >
              <Ico name="log-out" />
            </button>
          )}
          {collapsed && (
            <button
              onClick={handleLogout}
              title="ออกจากระบบ"
              style={{ display: 'none' }}
            />
          )}
        </div>
      )}
    </aside>
  )
}
