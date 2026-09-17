import { useState, useId } from 'react'
import { ProfileInfoTab } from './components/ProfileInfoTab'
import { ScheduleTab } from './components/ScheduleTab'

type Tab = 'profile' | 'schedule'

function TabButton({
  active, onClick, id, controls, children,
}: {
  active: boolean
  onClick: () => void
  id: string
  controls: string
  children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        background: 'none',
        border: 'none',
        borderBottom: active ? '2.5px solid var(--primary)' : '2.5px solid transparent',
        color: active ? 'var(--primary)' : 'var(--ink-500)',
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        whiteSpace: 'nowrap',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

export default function StudentProfile() {
  const [tab, setTab] = useState<Tab>('profile')
  const uid = useId()
  const tabId = (t: Tab) => `${uid}-tab-${t}`
  const panelId = (t: Tab) => `${uid}-panel-${t}`

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
          โปรไฟล์ของฉัน
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          จัดการข้อมูลส่วนตัวและตารางเรียน
        </p>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="หน้าโปรไฟล์"
        style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 24, gap: 0 }}
      >
        <TabButton
          active={tab === 'profile'}
          onClick={() => setTab('profile')}
          id={tabId('profile')}
          controls={panelId('profile')}
        >
          {/* Person icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          ข้อมูลส่วนตัว
        </TabButton>
        <TabButton
          active={tab === 'schedule'}
          onClick={() => setTab('schedule')}
          id={tabId('schedule')}
          controls={panelId('schedule')}
        >
          {/* Calendar icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          ตารางเรียน
        </TabButton>
      </div>

      {/* Tab panels — both mounted to preserve unsaved form state */}
      <div
        role="tabpanel"
        id={panelId('profile')}
        aria-labelledby={tabId('profile')}
        style={{ display: tab === 'profile' ? 'block' : 'none' }}
      >
        <ProfileInfoTab />
      </div>
      <div
        role="tabpanel"
        id={panelId('schedule')}
        aria-labelledby={tabId('schedule')}
        style={{ display: tab === 'schedule' ? 'block' : 'none' }}
      >
        <ScheduleTab />
      </div>
    </div>
  )
}
