import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { getInitials } from '../../utils/initials'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'

export default function StaffProfile() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const [draft, setDraft] = useState<Partial<Record<'full_name' | 'email' | 'faculty', string>>>({})

  const { data: profile, isLoading } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: staffApi.profile,
  })

  const p = profile ?? user

  const form = {
    full_name: p?.full_name ?? '',
    email: p?.email ?? '',
    faculty: p?.faculty ?? '',
    ...draft,
  }

  const updateMut = useMutation({
    mutationFn: (data: { full_name: string; email: string; faculty: string }) =>
      staffApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      setDraft({})
      qc.setQueryData(['staff-profile'], updated)
      qc.invalidateQueries({ queryKey: ['staff-profile'] })
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMut.mutate(form)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 3 }}>ข้อมูลส่วนตัว</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>จัดการข้อมูลและการตั้งค่าบัญชีของคุณ</p>
      </div>

      <div style={{ background: '#fff', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>

        {/* Avatar section */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 20 }}>
          {isLoading ? (
            <>
              <Skeleton height={64} width={64} borderRadius={999} />
              <div>
                <Skeleton height={16} width={160} />
                <div style={{ marginTop: 8 }}><Skeleton height={13} width={120} /></div>
              </div>
            </>
          ) : (
            <>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar initials={getInitials(p?.full_name ?? '?')} color="blue" size={64} />
                <span style={{
                  position: 'absolute', bottom: 2, right: 2, width: 14, height: 14,
                  borderRadius: '50%', background: 'var(--green)', border: '2.5px solid #fff',
                }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
                  {p?.full_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>{p?.email || '—'}</span>
                  <span style={{
                    padding: '2px 10px', borderRadius: 999,
                    background: 'var(--primary-50)', color: 'var(--primary)',
                    fontSize: 11, fontWeight: 700, border: '1px solid var(--primary)',
                  }}>
                    เจ้าหน้าที่
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Edit form */}
        <div style={{ padding: '24px 28px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 18 }}>
            แก้ไขข้อมูล
          </div>
          {isLoading ? (
            <Skeleton lines={3} height={16} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                readOnly={updateMut.isPending}
                label="ชื่อ-นามสกุล *"
                value={form.full_name}
                onChange={(e) => setDraft((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
              <Input
                readOnly={updateMut.isPending}
                label="อีเมล"
                type="email"
                value={form.email}
                onChange={(e) => setDraft((f) => ({ ...f, email: e.target.value }))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button type="submit" loading={updateMut.isPending}>บันทึกการเปลี่ยนแปลง</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
