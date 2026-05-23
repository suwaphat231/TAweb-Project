import type { ReactNode } from 'react'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'

interface Props { children: ReactNode }

export function AppShell({ children }: Props) {
  return (
    <>
      <Topbar />
      <Sidebar />
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        marginTop: 'var(--topbar-h)',
        minHeight: 'calc(100vh - var(--topbar-h))',
        padding: '32px 32px',
      }}>
        {children}
      </main>
    </>
  )
}
