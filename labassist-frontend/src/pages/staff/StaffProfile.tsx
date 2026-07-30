import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'

export default function StaffProfile() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', faculty: '' })

  const { data: profile, isLoading } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: staffApi.profile,
  })

  const p = profile ?? user

  useEffect(() => {
    if (!p) return
    setForm({
      full_name: p.full_name ?? '',
      email: p.email ?? '',
      faculty: p.faculty ?? '',
    })
  }, [p?.full_name, p?.email, p?.faculty])

  const updateMut = useMutation({
    mutationFn: (data: { full_name: string; email: string; faculty: string }) =>
      staffApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
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
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>ข้อมูลส่วนตัว</h1>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>จัดการข้อมูลส่วนตัวของคุณ</div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: avatar summary card */}
        <Card style={{ padding: 24, width: 260, flexShrink: 0 }}>
          {isLoading ? (
            <Skeleton height={64} borderRadius={999} width={64} />
          ) : (
            <>
              <div style={{ position: 'relative', width: 72, marginBottom: 14 }}>
                <Avatar initials={getInitials(p?.full_name ?? '?')} color="blue" size={72} />
                <span style={{
                  position: 'absolute', bottom: 2, right: 2, width: 14, height: 14,
                  borderRadius: '50%', background: 'var(--green)', border: '2.5px solid #fff',
                }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 2 }}>{p?.full_name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10, wordBreak: 'break-all' }}>{p?.email || '—'}</div>
              <StatusBadge value="staff" />
            </>
          )}
        </Card>

        {/* Right: inline edit form */}
        <Card style={{ padding: 24, flex: 1, minWidth: 320 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 18 }}>แก้ไขข้อมูลส่วนตัว</div>
          {isLoading ? (
            <Skeleton lines={3} height={16} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="ชื่อ-นามสกุล *"
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                required
              />
              <Input
                label="อีเมล"
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="คณะ / ภาควิชา"
                value={form.faculty}
                onChange={(e) => setForm(f => ({ ...f, faculty: e.target.value }))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" loading={updateMut.isPending}>บันทึกการเปลี่ยนแปลง</Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
