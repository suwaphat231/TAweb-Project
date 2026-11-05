import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminApi } from '../../services/api'
import { Table } from '../../components/ui/Table'
import { FilterChips } from '../../components/ui/FilterChips'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
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

// Student accounts are created by the student's own Google sign-in, so the
// role is only offered when editing an existing account.
const EDIT_ROLE_OPTIONS = [
  ...ROLE_OPTIONS,
  { value: 'student',    label: 'นักศึกษา' },
]

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ full_name: '', full_name_en: '', role: 'instructor' as UserRole })

  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', full_name_en: '', role: 'instructor' as UserRole })

  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [quotaUser, setQuotaUser] = useState<User | null>(null)

  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users', { role: roleFilter }],
    queryFn: () => adminApi.users({ role: roleFilter || undefined }),
  })

  const q = search.trim().toLowerCase()
  const filteredUsers = q === ''
    ? users
    : users.filter((u) =>
        u.full_name.toLowerCase().includes(q) ||
        (u.full_name_en ?? '').toLowerCase().includes(q) ||
        (u.username ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      )

  const { data: taughtCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['admin-user-courses', viewingUser?.id],
    queryFn: () => adminApi.userCourses(viewingUser!.id),
    enabled: !!viewingUser,
  })

  const createMut = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreate(false)
      setForm({ full_name: '', full_name_en: '', role: 'instructor' })
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingUser(null)
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setDeletingUser(null)
    },
  })
  const deleteError = deleteMut.error
    ? (isAxiosError(deleteMut.error) && deleteMut.error.response?.data?.error) || 'ลบผู้ใช้ไม่สำเร็จ กรุณาลองใหม่'
    : ''
  const { data: termSchedules = [], isLoading: quotaLoading } = useQuery({
    queryKey: ['admin-term-schedules', quotaUser?.id],
    queryFn: () => adminApi.studentTermSchedules(quotaUser!.id),
    enabled: !!quotaUser,
  })
  const resetQuotaMut = useMutation({
    mutationFn: ({ id, year, semester }: { id: number; year: number; semester: string }) =>
      adminApi.resetTermScheduleSaves(id, year, semester),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-term-schedules', quotaUser?.id] }),
  })
  const resetQuotaError = resetQuotaMut.error
    ? (isAxiosError(resetQuotaMut.error) && resetQuotaMut.error.response?.data?.error) || 'รีเซ็ตไม่สำเร็จ กรุณาลองใหม่'
    : ''
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
    setEditForm({ full_name: u.full_name, full_name_en: u.full_name_en ?? '', role: u.role })
  }

  const columns = [
    {
      key: 'full_name', header: 'ชื่อ',
      render: (u: User) => (
        <div>
          <div className="cell-title">{u.full_name}</div>
          {u.full_name_en && <div className="cell-sub">{u.full_name_en}</div>}
        </div>
      ),
    },
    {
      key: 'account', header: 'บัญชี',
      render: (u: User) => (
        <div>
          <div style={{ fontSize: 14 }}>{u.email || '—'}</div>
          {u.username && <div className="cell-sub"><code>{u.username}</code></div>}
        </div>
      ),
    },
    { key: 'role', header: 'บทบาท', render: (u: User) => <StatusBadge value={u.role} /> },
    {
      key: 'is_active', header: 'สถานะ',
      render: (u: User) => <Badge variant={u.is_active ? 'green' : 'red'} showDot>{u.is_active ? 'ใช้งาน' : 'ระงับ'}</Badge>,
    },
    {
      key: 'actions', header: 'การจัดการ', align: 'right' as const,
      render: (u: User) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {u.role === 'instructor' && (
            <Button size="sm" variant="outline" onClick={() => setViewingUser(u)}>
              วิชาที่สอน
            </Button>
          )}
          {u.role === 'student' && (
            <Button size="sm" variant="outline" onClick={() => { resetQuotaMut.reset(); setQuotaUser(u) }}>
              โควตาตารางเรียน
            </Button>
          )}
          {u.role !== 'admin' && (
            <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
              แก้ไข
            </Button>
          )}
          <Button
            size="sm" variant="danger-ghost"
            onClick={() => { deleteMut.reset(); setDeletingUser(u) }}
          >
            ลบ
          </Button>
          {!u.is_active && (
            <Button
              size="sm" variant="outline"
              onClick={() => toggleMut.mutate({ id: u.id, is_active: true })}
              style={{ color: 'var(--green)' }}
            >
              เปิดใช้
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="จัดการผู้ใช้งาน"
        description={`${filteredUsers.length} บัญชี${q ? ` (จากการค้นหา — ทั้งหมด ${users.length})` : ''}`}
        actions={<Button onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</Button>}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <FilterChips options={ROLE_TABS.map((t) => ({ value: t.value, label: t.label }))} value={roleFilter} onChange={(v) => setRoleFilter(v as UserRole | '')} />
        <input
          type="search"
          aria-label="ค้นหาผู้ใช้"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / username / อีเมล"
          style={{
            padding: '8px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
            fontSize: 14, color: 'var(--ink-900)', outline: 'none', minWidth: 260, maxWidth: '100%',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
      </div>

      {isLoading ? (
        <Skeleton lines={6} height={48} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState title="ไม่พบผู้ใช้" description={q ? 'ไม่มีชื่อ, username หรืออีเมลที่ตรงกับคำค้นหา' : 'ยังไม่มีผู้ใช้ในหมวดนี้'} />
      ) : (
        <Table label="รายชื่อผู้ใช้งาน" columns={columns as never} data={filteredUsers as never} />
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="เพิ่มผู้ใช้ใหม่" size="md">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            กรอกแค่ชื่อ-นามสกุลและบทบาท — อีเมลจะถูกเติมเองภายหลังตอนเจ้าของบัญชีเข้าสู่ระบบ
          </p>
          <Input label="ชื่อ-นามสกุล *" value={form.full_name} onChange={set('full_name')} required />
          <Input label="ชื่อ-นามสกุล (ภาษาอังกฤษ)" value={form.full_name_en} onChange={set('full_name_en')} placeholder="เช่น Somchai Jaidee" />
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
          <Input label="ชื่อ-นามสกุล (ภาษาอังกฤษ)" value={editForm.full_name_en} onChange={setEdit('full_name_en')} placeholder="เช่น Somchai Jaidee" />
          <Select
            label="บทบาท *" value={editForm.role} onChange={setEdit('role')}
            options={EDIT_ROLE_OPTIONS}
            disabled={editingUser?.id === currentUser?.id}
            hint={editingUser?.id === currentUser?.id ? 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' : undefined}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>ยกเลิก</Button>
            <Button type="submit" loading={updateMut.isPending}>บันทึก</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deletingUser} onClose={() => setDeletingUser(null)} title="ลบผู้ใช้" size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-700)' }}>
            ต้องการลบบัญชี <strong>{deletingUser?.full_name}</strong> ใช่หรือไม่?
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            ระบบจะซ่อนบัญชีนี้ไว้ ผู้ใช้จะเข้าสู่ระบบไม่ได้ แต่ประวัติ (ใบสมัคร, วิชาที่สอน, เอกสาร, รายงาน ฯลฯ) ยังคงอยู่
          </p>
          {deleteError && (
            <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setDeletingUser(null)}>ยกเลิก</Button>
            <Button
              type="button" variant="danger" loading={deleteMut.isPending}
              onClick={() => deletingUser && deleteMut.mutate(deletingUser.id)}
            >
              ลบผู้ใช้
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!quotaUser} onClose={() => setQuotaUser(null)} title={`โควตาแก้ตารางเรียน — ${quotaUser?.full_name ?? ''}`} size="md">
        {quotaLoading ? (
          <Skeleton lines={3} height={44} />
        ) : termSchedules.length === 0 ? (
          <EmptyState title="ยังไม่มีตารางที่บันทึกไว้" description="นักศึกษาคนนี้ยังไม่เคยบันทึกตารางเรียนในเทอมใดเลย" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
              รีเซ็ตแล้วนักศึกษาแก้ตารางเทอมนั้นได้เต็มโควตาอีกครั้ง (ตัวตารางไม่ถูกเปลี่ยน) และระบบบันทึกการรีเซ็ตใน activity log พร้อมชื่อแอดมิน
            </div>
            {termSchedules.map((t) => (
              <div key={`${t.academic_year}-${t.semester}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '10px 14px',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>ภาคเรียนที่ {t.semester}/{t.academic_year}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>ใช้สิทธิ์แก้ไปแล้ว {t.save_count}/{t.save_limit} ครั้ง</div>
                </div>
                <Button
                  size="sm" variant="ghost"
                  disabled={t.save_count === 0}
                  loading={resetQuotaMut.isPending && resetQuotaMut.variables?.year === t.academic_year && resetQuotaMut.variables?.semester === t.semester}
                  onClick={() => quotaUser && resetQuotaMut.mutate({ id: quotaUser.id, year: t.academic_year, semester: t.semester })}
                  style={{ border: '1px solid var(--line)' }}
                >
                  รีเซ็ตโควตา
                </Button>
              </div>
            ))}
            {resetQuotaError && (
              <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
                {resetQuotaError}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!viewingUser} onClose={() => setViewingUser(null)} title={`วิชาที่สอน — ${viewingUser?.full_name ?? ''}`} size="lg">
        {coursesLoading ? (
          <Skeleton lines={4} height={48} />
        ) : taughtCourses.length === 0 ? (
          <EmptyState title="ไม่พบวิชาที่สอน" description="ยังไม่มีวิชาในระบบที่จับคู่ชื่ออาจารย์คนนี้ได้" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {taughtCourses.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{c.code}</span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', marginTop: 2 }}>{c.title}</div>
                    {c.english_title && <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{c.english_title}</div>}
                  </div>
                  {c.status !== 'draft' && <StatusBadge value={c.status} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 6 }}>
                  ภาคเรียนที่ {c.semester} · Lab Boy {c.labboy_accepted}/{c.labboy_slots}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
