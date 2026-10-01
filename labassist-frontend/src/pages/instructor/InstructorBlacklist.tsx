import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { Avatar } from '../../components/ui/Avatar'
import { getInitials } from '../../utils/initials'
import { EmptyState } from '../../components/ui/EmptyState'
import { BlacklistEntryRow } from '../../components/labboy/Blacklist'
import { useBlacklistRevoke } from '../../hooks/useBlacklistRevoke'
import type { BlacklistEntry } from '../../types'

interface StudentGroup {
  studentId: number
  name: string
  code: string
  entries: BlacklistEntry[]
}

// Shared list of every active blacklist entry, grouped by student. Entries
// are filed from the applicant screen (accepted Lab Boys only); this page is
// for looking them up and revoking your own.
export default function InstructorBlacklist() {
  const [search, setSearch] = useState('')
  const revoke = useBlacklistRevoke()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['blacklist'],
    queryFn: () => instructorApi.blacklist(),
  })

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<number, StudentGroup>()
    for (const e of entries) {
      if (q && !e.student_name.toLowerCase().includes(q) && !(e.student_code ?? '').toLowerCase().includes(q)) continue
      const g = map.get(e.student_id) ?? { studentId: e.student_id, name: e.student_name, code: e.student_code, entries: [] }
      g.entries.push(e)
      map.set(e.student_id, g)
    }
    return [...map.values()]
  }, [entries, search])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-900)' }}>รายชื่อ Blacklist</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4, lineHeight: 1.6 }}>
          นักศึกษาที่ถูก blacklist ยังสมัครได้ตามปกติ ระบบจะแสดงป้ายเตือนในหน้าคัดเลือกผู้สมัคร
          · blacklist ได้จากหน้าคัดเลือกผู้สมัคร เฉพาะนักศึกษาที่เป็น Lab Boy ในวิชาของท่าน
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
        style={{
          width: '100%', maxWidth: 360, padding: '7px 12px', marginBottom: 16,
          border: '1.5px solid var(--line)', borderRadius: 'var(--radius-input)',
          fontSize: 13, color: 'var(--ink-900)', outline: 'none', boxSizing: 'border-box',
        }}
      />

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>กำลังโหลด...</div>
      ) : groups.length === 0 ? (
        <EmptyState title={search ? 'ไม่พบนักศึกษาที่ค้นหา' : 'ยังไม่มีนักศึกษาที่ถูก blacklist'} icon="✅" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <div key={g.studentId} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Avatar initials={getInitials(g.name)} color="blue" size={34} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>{g.code || '—'}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 99, padding: '2px 10px' }}>
                  {g.entries.length} ครั้ง
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.entries.map((b) => (
                  <BlacklistEntryRow
                    key={b.id}
                    entry={b}
                    canRevoke={revoke.canRevoke(b)}
                    revoking={revoke.mut.isPending}
                    onRevoke={() => revoke.mut.mutate(b.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
