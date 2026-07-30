import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Avatar, getInitials } from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'

export default function StudentProfile() {
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  const [form, setForm] = useState({ full_name: '', student_id: '', year: '', faculty: '' })

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: studentApi.profile,
  })

  const p = profile ?? user

  useEffect(() => {
    if (!p) return
    setForm({
      full_name: p.full_name ?? '',
      student_id: p.student_id ?? '',
      year: String(p.year ?? ''),
      faculty: p.faculty ?? '',
    })
  }, [p?.full_name, p?.student_id, p?.year, p?.faculty])

  const updateMut = useMutation({
    mutationFn: (data: { full_name: string; student_id: string; year: number; faculty: string }) =>
      studentApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['student-profile'] })
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success')
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMut.mutate({
      full_name: form.full_name,
      student_id: form.student_id.trim(),
      year: Number(form.year) || 0,
      faculty: form.faculty,
    })
  }

  const gpa = p?.gpa ?? 0
  const gpaPercent = Math.min(100, (gpa / 4) * 100)

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 24 }}>ข้อมูลส่วนตัว</h1>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>จัดการข้อมูลส่วนตัวของคุณ</div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: avatar summary card */}
        <Card style={{ padding: 24, width: 260, flexShrink: 0 }}>
          {profileLoading ? (
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
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10, wordBreak: 'break-all' }}>{p?.email}</div>
              <StatusBadge value="student" />

              {gpa > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>GPA</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{gpa.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: gpaPercent >= 75 ? 'var(--green)' : gpaPercent >= 50 ? 'var(--primary)' : 'var(--amber, #F59E0B)',
                      width: `${gpaPercent}%`,
                      transition: 'width .5s',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 3, textAlign: 'right' }}>จาก 4.00</div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Right: inline edit form */}
        <Card style={{ padding: 24, flex: 1, minWidth: 320 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 18 }}>แก้ไขข้อมูลส่วนตัว</div>
          {profileLoading ? (
            <Skeleton lines={4} height={16} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="ชื่อ-นามสกุล *"
                value={form.full_name}
                onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                required
              />
              <Input
                label="รหัสนักศึกษา"
                value={form.student_id}
                onChange={(e) => setForm(f => ({ ...f, student_id: e.target.value }))}
                placeholder="กรอกรหัสนักศึกษาของคุณ"
              />
              <Select
                label="ชั้นปี"
                value={form.year}
                onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
                options={[
                  { value: '', label: '— เลือกชั้นปี —' },
                  { value: '1', label: 'ปีที่ 1' },
                  { value: '2', label: 'ปีที่ 2' },
                  { value: '3', label: 'ปีที่ 3' },
                  { value: '4', label: 'ปีที่ 4' },
                ]}
              />
              <Input
                label="คณะ / ภาควิชา"
                value={form.faculty}
                onChange={(e) => setForm(f => ({ ...f, faculty: e.target.value }))}
              />
              <Input
                label="อีเมล (ใช้สำหรับเข้าสู่ระบบ)"
                value={p?.email ?? ''}
                disabled
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
