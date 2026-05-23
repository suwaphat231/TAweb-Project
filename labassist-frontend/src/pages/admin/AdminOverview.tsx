import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import type { User, UserRole } from '../../types'

export default function AdminOverview() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', role: 'instructor' as UserRole })
  const qc = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: adminApi.stats })
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users })

  const createMut = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowCreate(false); setForm({ username: '', password: '', full_name: '', email: '', role: 'instructor' }) },
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => adminApi.updateUserStatus(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  function set(k: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value })) }

  const columns = [
    { key: 'full_name', header: 'ชื่อ', render: (u: User) => <span style={{ fontWeight: 600 }}>{u.full_name}</span> },
    { key: 'username', header: 'Username', render: (u: User) => <code style={{ fontSize: 13 }}>{u.username || '—'}</code> },
    { key: 'email', header: 'อีเมล', render: (u: User) => <span style={{ fontSize: 13 }}>{u.email}</span> },
    { key: 'role', header: 'บทบาท', render: (u: User) => <Badge value={u.role} /> },
    { key: 'is_active', header: 'สถานะ', render: (u: User) => (
      <span style={{ fontSize: 12, fontWeight: 600, color: u.is_active ? 'var(--green)' : 'var(--red)' }}>
        {u.is_active ? 'ใช้งาน' : 'ระงับ'}
      </span>
    )},
    { key: 'actions', header: '', render: (u: User) => (
      <Button size="sm" variant="ghost"
        onClick={() => toggleMut.mutate({ id: u.id, is_active: !u.is_active })}
        style={{ color: u.is_active ? 'var(--red)' : 'var(--green)', border: '1px solid var(--line)' }}
      >
        {u.is_active ? 'ระงับ' : 'เปิดใช้'}
      </Button>
    )},
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>ภาพรวมระบบ</h1>
        <Button onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</Button>
      </div>

      {statsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} height={88} radius={12} />)}
        </div>
      ) : stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard label="นักศึกษา" value={stats.total_students} color="var(--blue)" icon="🎓" />
          <StatCard label="อาจารย์" value={stats.total_instructors} color="var(--primary)" icon="👨‍🏫" />
          <StatCard label="วิชาเปิดรับ" value={stats.open_courses} color="var(--green)" icon="📚" />
          <StatCard label="การสมัครทั้งหมด" value={stats.total_applications} color="var(--accent)" icon="📋" />
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 16 }}>รายชื่อผู้ใช้</h2>
      {usersLoading ? <Skeleton count={5} height={48} gap={2} /> : <Table columns={columns as never} data={users as never} keyField="id" />}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="เพิ่มผู้ใช้ใหม่" width={480}>
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Username *" value={form.username} onChange={set('username')} required />
            <Input label="รหัสผ่าน *" type="password" value={form.password} onChange={set('password')} required />
          </div>
          <Input label="ชื่อ-นามสกุล *" value={form.full_name} onChange={set('full_name')} required />
          <Input label="อีเมล *" type="email" value={form.email} onChange={set('email')} required />
          <Select label="บทบาท *" value={form.role} onChange={set('role')}
            options={[{value:'instructor',label:'อาจารย์'},{value:'staff',label:'เจ้าหน้าที่'},{value:'admin',label:'Admin'}]} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending}>สร้างบัญชี</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
