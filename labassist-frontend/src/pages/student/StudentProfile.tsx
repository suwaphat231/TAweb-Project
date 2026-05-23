import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'

export default function StudentProfile() {
  const { user, setUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: user?.full_name ?? '', faculty: user?.faculty ?? '' })

  const { data: profile } = useQuery({ queryKey: ['student-profile'], queryFn: studentApi.profile })

  const updateMut = useMutation({
    mutationFn: (data: typeof form) => studentApi.updateProfile(data),
    onSuccess: (updated) => { setUser(updated); setEditing(false) },
  })

  const p = profile ?? user

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>ข้อมูลส่วนตัว</h1>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <Avatar name={p?.full_name ?? '?'} size={64} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>{p?.full_name}</div>
            <div style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 2 }}>{p?.email}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Badge value="student" />
              {p?.student_id && <span style={{ fontSize: 12, color: 'var(--ink-400)', alignSelf: 'center' }}>{p.student_id}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <InfoRow label="GPA" value={p?.gpa ? p.gpa.toFixed(2) : '—'} />
          <InfoRow label="คณะ/ภาควิชา" value={p?.faculty ?? '—'} />
          <InfoRow label="ชั้นปี" value={p?.year ? `ปีที่ ${p.year}` : '—'} />
        </div>

        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate(form) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="ชื่อ-นามสกุล" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} />
            <Input label="คณะ/ภาควิชา" value={form.faculty} onChange={(e) => setForm(f => ({ ...f, faculty: e.target.value }))} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>ยกเลิก</Button>
              <Button type="submit" loading={updateMut.isPending}>บันทึก</Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>แก้ไขข้อมูล</Button>
        )}
      </Card>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, color: 'var(--ink-900)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
