import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../services/api'
import { Table } from '../../components/ui/Table'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import type { User, UserRole } from '../../types'

const ROLE_TABS: { label: string; value: UserRole | '' }[] = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'อาจารย์', value: 'instructor' },
  { label: 'เจ้าหน้าที่', value: 'staff' },
  { label: 'นักศึกษา', value: 'student' },
  { label: 'Admin', value: 'admin' },
]

const ROLE_OPTIONS = [
  { value: 'instructor', label: 'อาจารย์' },
  { value: 'staff',      label: 'เจ้าหน้าที่' },
  { value: 'admin',      label: 'Admin' },
]

export default function AdminUsers() {
  const [showCreate, setShowCreate] = useState(false)
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [form, setForm] = useState({ full_name: '', role: 'instructor' as UserRole })

  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', role: 'instructor' as UserRole })

  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users', { role: roleFilter }],
    queryFn: () => adminApi.users({ role: roleFilter || undefined }),
  })

  const createMut = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreate(false)
      setForm({ full_name: '', role: 'instructor' })
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingUser(null)
    },
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => adminApi.updateUserStatus(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }
  function setEdit(k: keyof typeof editForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditForm(f => ({ ...f, [k]: e.target.value }))
  }

  function openEdit(u: User) {
    setEditingUser(u)
    setEditForm({ full_name: u.full_name, role: u.role })
  }

  const columns = [
    { key: 'full_name', header: 'ชื่อ',     render: (u: User) => <span style={{ fontWeight: 600 }}>{u.full_name}</span> },
    { key: 'username',  header: 'Username', render: (u: User) => <code style={{ fontSize: 13 }}>{u.username || '—'}</code> },
    { key: 'email',     header: 'อีเมล',    render: (u: User) => <span style={{ fontSize: 13 }}>{u.email || '—'}</span> },
    { key: 'role',      header: 'บทบาท',    render: (u: User) => <StatusBadge value={u.role} /> },
    {
      key: 'is_active', header: 'สถานะ',
      render: (u: User) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: u.is_active ? 'var(--green)' : 'var(--red)' }}>
          {u.is_active ? 'ใช้งาน' : 'ระงับ'}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (u: User) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={() => openEdit(u)} style={{ border: '1px solid var(--line)' }}>
            แก้ไข
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => toggleMut.mutate({ id: u.id, is_active: !u.is_active })}
            style={{ color: u.is_active ? 'var(--red)' : 'var(--green)', border: '1px solid var(--line)' }}
          >
            {u.is_active ? 'ระงับ' : 'เปิดใช้'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>จัดการผู้ใช้งาน</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>{users.length} บัญชี</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</Button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setRoleFilter(tab.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              border: '1.5px solid var(--line)',
              background: roleFilter === tab.value ? 'var(--primary)' : '#fff',
              color: roleFilter === tab.value ? '#fff' : 'var(--ink-700)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading
        ? <Skeleton lines={6} height={48} />
        : <Table columns={columns as never} data={users as never} />
      }

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="เพิ่มผู้ใช้ใหม่" size="md">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            กรอกแค่ชื่อ-นามสกุลและบทบาท — อีเมลจะถูกเติมเองภายหลังตอนเจ้าของบัญชีเข้าสู่ระบบ
          </p>
          <Input label="ชื่อ-นามสกุล *" value={form.full_name} onChange={set('full_name')} required />
          <Select
            label="บทบาท *" value={form.role} onChange={set('role')}
            options={ROLE_OPTIONS}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending}>สร้างบัญชี</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="แก้ไขผู้ใช้" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); if (editingUser) updateMut.mutate({ id: editingUser.id, data: editForm }) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <Input label="ชื่อ-นามสกุล *" value={editForm.full_name} onChange={setEdit('full_name')} required />
          <Select
            label="บทบาท *" value={editForm.role} onChange={setEdit('role')}
            options={ROLE_OPTIONS}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>ยกเลิก</Button>
            <Button type="submit" loading={updateMut.isPending}>บันทึก</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
