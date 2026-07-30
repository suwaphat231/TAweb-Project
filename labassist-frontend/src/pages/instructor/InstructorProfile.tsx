import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'

export default function InstructorProfile() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', faculty: '' })

  const { data: profile, isLoading } = useQuery({
    queryKey: ['instructor-profile'],
    queryFn: instructorApi.profile,
  })

  const updateMut = useMutation({
    mutationFn: (data: { full_name: string; email: string; faculty: string }) =>
      instructorApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['instructor-profile'] })
      setShowEdit(false)
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error'),
  })

  const p = profile ?? user

  function openEdit() {
    setForm({
      full_name: p?.full_name ?? '',
      email: p?.email ?? '',
      faculty: p?.faculty ?? '',
    })
    setShowEdit(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMut.mutate(form)
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>ข้อมูลส่วนตัว</h1>

      <Card style={{ padding: 24, maxWidth: 420 }}>
        {isLoading ? (
          <Skeleton height={64} borderRadius={999} width={64} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <Avatar initials={getInitials(p?.full_name ?? '?')} color="blue" size={72} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
              {p?.full_name}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-500)', marginBottom: 18 }}>
              {p?.email || '—'}
            </div>

            <div style={{ marginBottom: 18 }}>
              <InfoRow label="คณะ / ภาควิชา" value={p?.faculty ?? '—'} />
            </div>

            <Button variant="outline" size="sm" onClick={openEdit} style={{ width: '100%' }}>แก้ไขข้อมูล</Button>
          </>
        )}
      </Card>

      {/* Edit modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="แก้ไขข้อมูลส่วนตัว" size="sm">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <div style={{ fontSize: 12, color: 'var(--ink-400)', background: '#F8F9FB', padding: '8px 12px', borderRadius: 8 }}>
            การเปลี่ยนแปลงจะถูกบันทึกทันทีและแสดงในหน้าจัดการผู้ใช้ของแอดมิน
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)}>ยกเลิก</Button>
            <Button type="submit" loading={updateMut.isPending}>บันทึก</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-400)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-900)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
