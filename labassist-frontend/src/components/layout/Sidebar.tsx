import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { UserRole } from '../../types'

interface NavItem { to: string; label: string; icon: string }

const navMap: Record<UserRole, NavItem[]> = {
  student: [
    { to: '/student', label: 'ภาพรวม', icon: '⊞' },
    { to: '/student/apply', label: 'สมัครเป็น TA/Lab Boy', icon: '✎' },
    { to: '/student/status', label: 'ติดตามสถานะ', icon: '◉' },
    { to: '/student/profile', label: 'ข้อมูลส่วนตัว', icon: '◯' },
  ],
  instructor: [
    { to: '/instructor/announce', label: 'จัดการวิชา', icon: '⊞' },
    { to: '/instructor/select', label: 'คัดเลือกผู้สมัคร', icon: '✓' },
  ],
  staff: [
    { to: '/staff/docs', label: 'เอกสาร', icon: '⊟' },
  ],
  admin: [
    { to: '/admin', label: 'ภาพรวม', icon: '⊞' },
  ],
}

export function Sidebar() {
  const { user } = useAuth()
  const items = user ? (navMap[user.role] ?? []) : []

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      background: '#fff',
      borderRight: '1.5px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 'var(--topbar-h)',
      left: 0,
      bottom: 0,
      overflowY: 'auto',
      padding: '16px 0',
    }}>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to.split('/').length <= 2}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--primary)' : 'var(--ink-700)',
              background: isActive ? 'var(--primary-50)' : 'transparent',
              borderRight: isActive ? '3px solid var(--primary)' : '3px solid transparent',
              textDecoration: 'none',
              transition: 'background .12s',
            })}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
