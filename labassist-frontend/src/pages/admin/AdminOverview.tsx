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
import { Avatar } from '../../components/ui/Avatar'
import { Table } from '../../components/ui/Table'
import { AdminIcon } from '../../components/admin/AdminIcon'
import { useToast } from '../../hooks/useToast'
import type { Course, UserRole } from '../../types'

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
    queryKey: ['all-courses', { has_lab: true }],
    queryFn: () => coursesAPI.getAll({ has_lab: true }),
  })
  // The overview is a glance, not the course list: courses taking applications first.
  const RECRUITING = ['open', 'closing_soon']
  const shownCourses = [...courses]
    .sort((a, b) => Number(RECRUITING.includes(b.status)) - Number(RECRUITING.includes(a.status)))
    .slice(0, 8)
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
      <div className="dashboard-banner">
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
          <StatCard label="ผู้ใช้งานทั้งหมด"  value={stats?.total_users ?? 0}            iconColor="var(--primary)" icon={<AdminIcon name="users" />} />
          <StatCard label="วิชาที่เปิดรับ"     value={stats?.open_courses ?? 0}           iconColor="var(--green)"   icon={<AdminIcon name="book" />} />
          <StatCard label="ผู้สมัครทั้งหมด"   value={stats?.total_applications ?? 0}     iconColor="var(--amber)"   icon={<AdminIcon name="clipboard" />} />
          <StatCard label="รอพิจารณา"          value={stats?.pending_applications ?? 0}  iconColor="var(--red)"     icon={<AdminIcon name="clock" />} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Courses table */}
        <div style={{ flex: '2 1 520px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>
              รายวิชา
              {courses.length > shownCourses.length && (
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-500)', marginLeft: 8 }}>
                  แสดง {shownCourses.length} จาก {courses.length}
                </span>
              )}
            </h2>
            <Link to="/admin/courses" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>ดูทั้งหมด →</Link>
          </div>
          <Table
            label="รายวิชาที่เปิดรับสมัคร"
            loading={coursesLoading}
            emptyText="ยังไม่มีรายวิชา"
            columns={[
              { key: 'title', header: 'วิชา', render: (c: Course) => (
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }} title={c.title}>{c.title}</div>
                  <div className="cell-sub">
                    <span className="cell-code">{c.code.split('-')[0]}</span>
                    {c.section ? ` · Sec ${c.section}` : ''}
                    {c.instructor_name ? ` · ${c.instructor_name}` : ''}
                  </div>
                </div>
              ) },
              { key: 'labboy', header: 'Lab Boy', align: 'center', render: (c: Course) => (
                <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{c.labboy_accepted}<span style={{ color: 'var(--ink-400)', fontWeight: 400 }}> / {c.labboy_slots}</span></span>
              ) },
              { key: 'status', header: 'สถานะ', render: (c: Course) => <StatusBadge value={c.status} /> },
            ] as never}
            data={shownCourses as never}
          />
        </div>

        {/* Users list */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
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
                <Avatar size={36} />
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
