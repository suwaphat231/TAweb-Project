import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, getInitials } from '../ui/Avatar'
import { notificationApi } from '../../services/api'
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
  '/instructor/profile':  { title: 'ข้อมูลส่วนตัว',      breadcrumb: 'อาจารย์' },
  '/staff/home':          { title: 'ภาพรวม',             breadcrumb: 'เจ้าหน้าที่' },
  '/staff/docs':          { title: 'จัดการเอกสาร',       breadcrumb: 'เจ้าหน้าที่' },
  '/staff/profile':       { title: 'ข้อมูลส่วนตัว',      breadcrumb: 'เจ้าหน้าที่' },
  '/admin/overview':      { title: 'ภาพรวมระบบ',         breadcrumb: 'ผู้ดูแลระบบ' },
  '/admin/courses':       { title: 'จัดการรายวิชา',      breadcrumb: 'ผู้ดูแลระบบ' },
  '/admin/users':         { title: 'จัดการผู้ใช้งาน',    breadcrumb: 'ผู้ดูแลระบบ' },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function NotificationBell() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const isStudent = user?.role === 'student'

  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationApi.list,
    enabled: isStudent,
    refetchInterval: 30_000,
  })

  const unread = notifs.filter((n: Notification) => !n.is_read).length

  const markAllMut = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOneMut = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
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
        {isStudent && unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 9999,
            background: 'var(--red)', border: '1.5px solid #fff',
            fontSize: 9, fontWeight: 700, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#fff', borderRadius: 12,
          border: '1px solid var(--line)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid var(--line-soft)',
            position: 'sticky', top: 0, background: '#fff',
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
          {!isStudent ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>
              การแจ้งเตือนใช้ได้สำหรับนักศึกษาเท่านั้น
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีการแจ้งเตือน</div>
            </div>
          ) : (
            notifs.map((n: Notification) => (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) markOneMut.mutate(n.id) }}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line-soft)',
                  background: n.is_read ? '#fff' : '#EEF2FF',
                  cursor: n.is_read ? 'default' : 'pointer',
                  borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--primary)',
                  transition: 'background .1s',
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: n.is_read ? 500 : 700,
                  color: 'var(--ink-900)', marginBottom: 3,
                }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6 }}>
                  {n.body}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 5 }}>
                  {formatTime(n.created_at)}
                </div>
              </div>
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
      background: '#fff',
      borderBottom: '1.5px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      zIndex: 50,
      boxShadow: 'var(--shadow-sm)',
      flexShrink: 0,
    }}>
      {/* Left: hamburger (mobile) + breadcrumb + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onHamburgerClick && (
          <button
            onClick={onHamburgerClick}
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

        {/* Avatar */}
        {user && (
          <Avatar initials={getInitials(user.full_name)} color="blue" size={32} />
        )}
      </div>
    </header>
  )
}
