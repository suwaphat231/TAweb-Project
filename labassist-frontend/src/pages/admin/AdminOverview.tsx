import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi, coursesAPI } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { useToast } from '../../components/ui/Toast'
import type { UserRole } from '../../types'

export default function AdminOverview() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ full_name: '', role: 'instructor' as UserRole })
  const qc = useQueryClient()
  const showToast = useToast()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.stats,
  })
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['all-courses'],
    queryFn: () => coursesAPI.getAll(),
  })
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', { limit: 7 }],
    queryFn: () => adminApi.users({ limit: 7 }),
  })

  const createMut = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setShowCreate(false)
      setForm({ full_name: '', role: 'instructor' })
      showToast('สร้างบัญชีผู้ใช้เรียบร้อยแล้ว', 'success')
    },
    onError: () => showToast('ไม่สามารถสร้างบัญชีได้ กรุณาตรวจสอบข้อมูล', 'error'),
  })

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>ภาพรวมระบบ</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 4 }}>สถิติและข้อมูลรวมของระบบ LabAssist</p>
      </div>

      {/* 4 StatCards */}
      {statsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} height={88} borderRadius={12} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard label="ผู้ใช้งานทั้งหมด"  value={stats?.total_users ?? 0}            iconColor="var(--primary)" icon="👥" />
          <StatCard label="วิชาที่เปิดรับ"     value={stats?.open_courses ?? 0}           iconColor="var(--green)"   icon="📚" />
          <StatCard label="ผู้สมัครทั้งหมด"   value={stats?.total_applications ?? 0}     iconColor="var(--amber)"   icon="📋" />
          <StatCard label="รอพิจารณา"          value={stats?.pending_applications ?? 0}  iconColor="var(--red)"     icon="⏳" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        {/* Courses table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>รายวิชา</h2>
            <Link to="/admin/courses" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>ดูทั้งหมด →</Link>
          </div>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--line)' }}>
                  {['รหัส', 'ชื่อวิชา', 'อาจารย์', 'ผู้สมัคร', 'สถานะ'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coursesLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {[1,2,3,4,5].map((j) => <td key={j} style={{ padding: '12px 14px' }}><Skeleton height={12} /></td>)}
                  </tr>
                ))}
                {!coursesLoading && courses.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < courses.length - 1 ? '1px solid var(--line-soft)' : 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{c.code}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ink-900)', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink-500)' }}>{c.instructor_name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink-700)' }}>
                      {(c.ta_accepted + c.labboy_accepted)} / {(c.ta_slots + c.labboy_slots)}
                    </td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge value={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>ผู้ใช้งาน</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="sm" onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</Button>
              <Link to="/admin/users" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>ดูทั้งหมด →</Link>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
            {usersLoading ? (
              <div style={{ padding: 16 }}><Skeleton lines={7} height={44} /></div>
            ) : users.map((u, i) => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderBottom: i < users.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}>
                <Avatar initials={getInitials(u.full_name)} color="blue" size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <StatusBadge value={u.role} />
                  {!u.is_active && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 6px', borderRadius: 999 }}>ระงับ</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="เพิ่มผู้ใช้ใหม่" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            กรอกแค่ชื่อ-นามสกุลและบทบาท — อีเมลจะถูกเติมเองภายหลังตอนเจ้าของบัญชีเข้าสู่ระบบ
          </p>
          <Input label="ชื่อ-นามสกุล *" value={form.full_name} onChange={set('full_name')} required />
          <Select
            label="บทบาท *" value={form.role} onChange={set('role')}
            options={[{ value: 'instructor', label: 'อาจารย์' }, { value: 'staff', label: 'เจ้าหน้าที่' }]}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button type="submit" loading={createMut.isPending}>สร้างบัญชี</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
