import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

const SIDEBAR_KEY = 'labassist.sidebarCollapsed'

interface Props { children: ReactNode }

export function AppShell({ children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { isMobile, isTablet } = useBreakpoint()
  const isOnline = useOnlineStatus()

  // null = follow the screen size; true/false = the person's own choice.
  const [collapsePref, setCollapsePref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY)
      return v === null ? null : v === '1'
    } catch { return null }
  })
  const collapsed = collapsePref ?? isTablet
  function toggleCollapsed() {
    const next = !collapsed
    setCollapsePref(next)
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* private mode */ }
  }

  const sidebarCol = isMobile ? '0px' : collapsed ? '64px' : '248px'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 1000,
          background: '#FEF2F2', color: '#DC2626',
          padding: '10px 20px', textAlign: 'center',
          fontSize: 13, fontWeight: 600,
          borderBottom: '1px solid #FECACA',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span>⚠️</span>
          ไม่มีการเชื่อมต่ออินเทอร์เน็ต — กรุณาตรวจสอบการเชื่อมต่อของคุณ
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `${sidebarCol} 1fr`,
        transition: 'grid-template-columns .2s ease',
        minHeight: '100vh',
      }}>
        {/* Sidebar (desktop / tablet in-grid) */}
        {!isMobile && <Sidebar collapsed={collapsed} />}

        {/* Mobile drawer overlay */}
        {isMobile && drawerOpen && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 299 }}
            onClick={() => setDrawerOpen(false)}
          />
        )}
        {isMobile && (
          <div style={{
            position: 'fixed', left: 0, top: 0, height: '100vh',
            transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .25s ease',
            zIndex: 300,
          }}>
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        )}

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar
            onHamburgerClick={isMobile ? () => setDrawerOpen((d) => !d) : toggleCollapsed}
            menuOpen={isMobile ? drawerOpen : !collapsed}
          />
          <main style={{ flex: 1, padding: isMobile ? '24px 16px' : '36px 40px', width: '100%', maxWidth: 1440, margin: '0 auto' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
