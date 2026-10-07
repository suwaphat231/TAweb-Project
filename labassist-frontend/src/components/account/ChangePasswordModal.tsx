import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'

type Step = 'create' | 'change' | 'reset'
type ApiError = { response?: { data?: { error?: string } } }

const MIN_LENGTH = 6
const errorMessage = (err: ApiError) => err.response?.data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** False → the account has no password yet, so create one instead of changing it. */
  hasPassword: boolean
  /** Called after a password is saved, e.g. to refetch the profile's has_password. */
  onSaved?: () => void
}

export function ChangePasswordModal({ isOpen, onClose, hasPassword, onSaved }: Props) {
  const showToast = useToast()
  const initialStep: Step = hasPassword ? 'change' : 'create'
  const [step, setStep] = useState<Step>(initialStep)
  const [currentPassword, setCurrentPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')

  function close() {
    setStep(initialStep)
    setCurrentPassword('')
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setSentTo('')
    setError('')
    onClose()
  }

  const onDone = () => {
    showToast(step === 'create' ? 'สร้างรหัสผ่านเรียบร้อยแล้ว' : 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success')
    onSaved?.()
    close()
  }

  const createMut = useMutation({
    mutationFn: authApi.setPassword,
    onSuccess: onDone,
    onError: (err: ApiError) => setError(errorMessage(err)),
  })

  const changeMut = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: onDone,
    onError: (err: ApiError) => setError(errorMessage(err)),
  })

  const resetMut = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: onDone,
    onError: (err: ApiError) => setError(errorMessage(err)),
  })

  const forgotMut = useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: ({ email }) => {
      setSentTo(email)
      setStep('reset')
      setError('')
      showToast(`ส่งรหัสยืนยันไปที่ ${email} แล้ว`, 'success')
    },
    onError: (err: ApiError) => setError(errorMessage(err)),
  })

  function validateNewPassword() {
    if (newPassword.length < MIN_LENGTH) return `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_LENGTH} ตัวอักษร`
    if (newPassword !== confirmPassword) return 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน'
    return ''
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword()
    if (invalid) { setError(invalid); return }
    setError('')
    if (step === 'create') {
      createMut.mutate({ new_password: newPassword })
    } else if (step === 'change') {
      changeMut.mutate({ current_password: currentPassword, new_password: newPassword })
    } else {
      resetMut.mutate({ code: code.trim(), new_password: newPassword })
    }
  }

  const busy = createMut.isPending || changeMut.isPending || resetMut.isPending
  const title = step === 'create' ? 'สร้างรหัสผ่าน' : step === 'change' ? 'เปลี่ยนรหัสผ่าน' : 'ลืมรหัสผ่าน'

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>ยกเลิก</Button>
          <Button type="submit" form="change-password-form" loading={busy}>{step === 'create' ? 'สร้างรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน'}</Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {step === 'create' ? (
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            บัญชีนี้ยังไม่มีรหัสผ่าน ตั้งรหัสผ่านเพื่อใช้เข้าสู่ระบบด้วย Username และรหัสผ่าน
          </div>
        ) : step === 'change' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Input
              label="รหัสผ่านปัจจุบัน *"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => forgotMut.mutate()}
              disabled={forgotMut.isPending}
              style={{ alignSelf: 'flex-end', background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
            >
              {forgotMut.isPending ? 'กำลังส่งรหัส…' : 'ลืมรหัสผ่าน?'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
              กรอกรหัสยืนยัน 6 หลักที่ส่งไปที่ <b>{sentTo}</b> (ใช้ได้ภายใน 10 นาที)
            </div>
            <Input
              label="รหัสยืนยัน *"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            <button
              type="button"
              onClick={() => forgotMut.mutate()}
              disabled={forgotMut.isPending}
              style={{ alignSelf: 'flex-end', background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
            >
              {forgotMut.isPending ? 'กำลังส่งรหัส…' : 'ส่งรหัสอีกครั้ง'}
            </button>
          </div>
        )}
        <Input
          label="รหัสผ่านใหม่ *"
          type="password"
          autoComplete="new-password"
          hint={`อย่างน้อย ${MIN_LENGTH} ตัวอักษร`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <Input
          label="ยืนยันรหัสผ่านใหม่ *"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--red)' }}>{error}</div>}
      </form>
    </Modal>
  )
}
