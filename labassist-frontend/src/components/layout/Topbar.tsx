import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { useLogout } from '../../hooks/useLogout'
import { Avatar } from '../ui/Avatar'
import { notificationApi, instructorApi } from '../../services/api'
import type { Notification } from '../../types'

interface Props {
  title?: string
  breadcrumb?: string
  actions?: ReactNode
  onHamburgerClick?: () => void
}

const routeMeta: Record<string, { title: string; breadcrumb: string }> = {
  '/student/home':        { title: 'หน้าหลัก',           breadcrumb: 'นักศึกษา' },
  '/student/apply':       { title: 'ค้นหาและสมัคร',      breadcrumb: 'นักศึกษา' },
  '/student/status':      { title: 'สถานะการสมัคร',      breadcrumb: 'นักศึกษา' },
  '/student/profile':     { title: 'โปรไฟล์ของฉัน',      breadcrumb: 'นักศึกษา' },
  '/instructor/home':     { title: 'ภาพรวม',             breadcrumb: 'อาจารย์' },
  '/instructor/courses':  { title: 'วิชาของฉัน',         breadcrumb: 'อาจารย์' },
  '/instructor/announce': { title: 'จัดการประกาศ',       breadcrumb: 'อาจารย์' },
  '/instructor/select':   { title: 'คัดเลือกผู้สมัคร',   breadcrumb: 'อาจารย์' },
  '/instructor/makeup-days': { title: 'วันชดเชย',      breadcrumb: 'อาจารย์' },
  '/instructor/profile':  { title: 'ข้อมูลส่วนตัว',      breadcrumb: 'อาจารย์' },
  '/staff/home':          { title: 'ภาพรวม',              breadcrumb: 'เจ้าหน้าที่' },
  '/staff/review':        { title: 'ตรวจสอบแบบฟอร์ม',   breadcrumb: 'เจ้าหน้าที่' },
  '/staff/profile':       { title: 'ข้อมูลส่วนตัว',       breadcrumb: 'เจ้าหน้าที่' },
  '/admin/overview':      { title: 'ภาพรวมระบบ',         breadcrumb: 'ผู้ดูแลระบบ' },
  '/admin/courses':       { title: 'จัดการรายวิชา',      breadcrumb: 'ผู้ดูแลระบบ' },
  '/admin/users':         { title: 'จัดการผู้ใช้งาน',    breadcrumb: 'ผู้ดูแลระบบ' },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ROLE_LABEL: Record<string, string> = {
  student: 'นักศึกษา', instructor: 'อาจารย์', staff: 'เจ้าหน้าที่', admin: 'ผู้ดูแลระบบ',
}

const PROFILE_PATH: Record<string, string> = {
  student: '/student/profile', instructor: '/instructor/profile', staff: '/staff/profile',
}

// Avatar button with a small account menu: who is signed in, a shortcut to
// the profile page and "ออกจากระบบ" (same flow as the sidebar's logout).
function UserMenu() {
  const { user } = useAuth()
  const { requestLogout, logoutDialog } = useLogout()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  if (!user) return null
  const profilePath = PROFILE_PATH[user.role]

  function handleLogout() {
    setIsOpen(false)
    requestLogout()
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '10px 16px', minHeight: 40, background: 'none', border: 'none',
    fontSize: 14, textAlign: 'left', cursor: 'pointer',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="เมนูบัญชีผู้ใช้"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        style={{
          background: 'none', border: 'none', padding: 2, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', boxShadow: isOpen ? '0 0 0 2px var(--primary)' : 'none',
          transition: 'box-shadow .15s',
        }}
      >
        <Avatar src={user.avatar_url} size={32} />
      </button>

      {isOpen && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 240, background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)',
          zIndex: 200, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.full_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>
          {profilePath && (
            <button
              role="menuitem"
              className="user-menu-item"
              onClick={() => { setIsOpen(false); navigate(profilePath) }}
              style={{ ...itemStyle, color: 'var(--ink-700)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              ข้อมูลส่วนตัว
            </button>
          )}
          <button
            role="menuitem"
            className="user-menu-item"
            onClick={handleLogout}
            style={{ ...itemStyle, color: 'var(--red)', borderTop: profilePath ? '1px solid var(--line-soft)' : undefined }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            ออกจากระบบ
          </button>
        </div>
      )}
      {logoutDialog}
    </div>
  )
}

function NotificationBell() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const isStudent = user?.role === 'student'
  const isInstructor = user?.role === 'instructor' || user?.role === 'admin'
  // Notifications work for students (application results) and instructors
  // (new applicants) — same bell, different inbox depending on who's logged in.
  const enabled = isStudent || isInstructor
  const listFn = isStudent ? notificationApi.list : instructorApi.notifications
  const markAllFn = isStudent ? notificationApi.markAllRead : instructorApi.markAllNotificationsRead
  const markOneFn = isStudent ? notificationApi.markRead : instructorApi.markNotificationRead

  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications', user?.role],
    queryFn: listFn,
    enabled,
    refetchInterval: 30_000,
  })

  const unread = notifs.filter((n: Notification) => !n.is_read).length

  const markAllMut = useMutation({
    mutationFn: markAllFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOneMut = useMutation({
    mutationFn: (id: number) => markOneFn(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่ได้อ่าน` : 'การแจ้งเตือน'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: isOpen ? 'var(--primary)' : 'var(--ink-500)',
          padding: 6, borderRadius: 8,
          display: 'flex', alignItems: 'center', position: 'relative',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {enabled && unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 16, height: 16, borderRadius: 9999,
              background: 'var(--red)', border: '1.5px solid #fff',
              fontSize: 9, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--line-soft)',
            position: 'sticky', top: 0, background: 'var(--bg-card)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>
              การแจ้งเตือน
              {unread > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 700,
                  background: 'var(--red)', color: '#fff',
                  padding: '1px 6px', borderRadius: 9999,
                }}>
                  {unread}
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                style={{
                  fontSize: 12, color: 'var(--primary)', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0,
                }}
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* Body */}
          {!enabled ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>
              การแจ้งเตือนใช้ได้สำหรับนักศึกษาและอาจารย์เท่านั้น
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีการแจ้งเตือน</div>
            </div>
          ) : (
            notifs.map((n: Notification) => (
              n.is_read ? (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--line-soft)',
                    background: 'var(--bg-card)',
                    borderLeft: '3px solid transparent',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)', marginBottom: 3 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6 }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 5 }}>{formatTime(n.created_at)}</div>
                </div>
              ) : (
                <button
                  key={n.id}
                  onClick={() => markOneMut.mutate(n.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--line-soft)',
                    background: 'var(--primary-50)',
                    cursor: 'pointer',
                    borderLeft: '3px solid var(--primary)',
                    borderRight: 'none', borderTop: 'none',
                    transition: 'background .1s',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 3 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6 }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 5 }}>{formatTime(n.created_at)}</div>
                </button>
              )
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function Topbar({ title, breadcrumb, actions, onHamburgerClick }: Props) {
  const { pathname } = useLocation()
  const { user } = useAuth()

  const meta = routeMeta[pathname] ?? { title: '', breadcrumb: '' }
  const resolvedTitle = title ?? meta.title
  const resolvedBreadcrumb = breadcrumb ?? (pathname === '/instructor/profile' && user?.role === 'admin' ? 'ผู้ดูแลระบบ' : meta.breadcrumb)

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      height: 'var(--topbar-h)',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      zIndex: 50,
      boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
      flexShrink: 0,
    }}>
      {/* Left: hamburger (mobile) + breadcrumb + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onHamburgerClick && (
          <button
            onClick={onHamburgerClick}
            aria-label="เปิดเมนู"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-700)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center', marginRight: 4,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}
        {resolvedBreadcrumb && (
          <>
            <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{resolvedBreadcrumb}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>/</span>
          </>
        )}
        {resolvedTitle && (
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>{resolvedTitle}</span>
        )}
      </div>

      {/* Right: actions + bell + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {actions}

        <NotificationBell />

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--line)' }} />

        {/* Avatar → account menu (profile, logout) */}
        <UserMenu />
      </div>
    </header>
  )
}
