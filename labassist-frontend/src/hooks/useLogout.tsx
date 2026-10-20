import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Button, Modal } from '../components/ui'
import { useAuth } from './useAuth'
import { authApi } from '../services/api'
import { signOutOfGoogle } from '../services/googleAccount'

// Logout shared by the sidebar and the account menu. A Google-linked account
// is asked first whether to sign this browser out of Google as well — on a
// shared computer that stops the next person landing in this account.
export function useLogout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isAsking, setIsAsking] = useState(false)
  const [alsoGoogle, setAlsoGoogle] = useState(false)

  async function doLogout(withGoogle: boolean) {
    setIsAsking(false)
    if (withGoogle) signOutOfGoogle()
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  function requestLogout() {
    if (user?.google_sub) {
      setAlsoGoogle(false)
      setIsAsking(true)
    } else {
      void doLogout(false)
    }
  }

  // Portalled to <body> so the topbar's or sidebar's styles cannot clip it.
  const logoutDialog = createPortal(
    <Modal
      isOpen={isAsking}
      onClose={() => setIsAsking(false)}
      title="ออกจากระบบ"
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => setIsAsking(false)}>ยกเลิก</Button>
          <Button type="button" variant="danger" onClick={() => void doLogout(alsoGoogle)}>ออกจากระบบ</Button>
        </>
      }
    >
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--ink-700)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={alsoGoogle}
          onChange={(e) => setAlsoGoogle(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          ออกจาก Google ในเครื่องนี้ด้วย
          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
            แนะนำสำหรับเครื่องที่ใช้ร่วมกัน · จะออกจาก Gmail และ YouTube ในเบราว์เซอร์นี้ด้วย
          </span>
        </span>
      </label>
    </Modal>,
    document.body,
  )

  return { requestLogout, logoutDialog }
}
