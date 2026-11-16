import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../services/api'
import { useToast } from '../../../hooks/useToast'
import { formatThaiDate } from '../../../utils/thaiDate'
import type { HolidaySyncRun, HolidaySyncRunStatus } from '../../../types'

const STATUS_LABEL: Record<HolidaySyncRunStatus, string> = {
  success: 'สำเร็จ',
  no_data: 'ยังไม่มีข้อมูลปีนี้',
  failed: 'ไม่สำเร็จ',
}

const STATUS_COLOR: Record<HolidaySyncRunStatus, { fg: string; bg: string }> = {
  success: { fg: '#047857', bg: '#D1FAE5' },
  no_data: { fg: '#92400E', bg: '#FEF3C7' },
  failed: { fg: '#B91C1C', bg: '#FEE2E2' },
}

const TYPE_LABEL: Record<string, string> = {
  public_holiday: 'วันหยุดราชการ',
  substitution_holiday: 'วันหยุดชดเชย',
  special_holiday: 'วันหยุดพิเศษ (มติ ครม.)',
  government_holiday: 'วันหยุดราชการ (ไม่รวมภาคเอกชน)',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function runSummary(r: HolidaySyncRun): string {
  if (r.status !== 'success') return r.message ?? ''
  const parts = [`ทั้งหมด ${r.total}`, `เพิ่มใหม่ ${r.created}`, `อัปเดต ${r.updated}`, `ไม่เปลี่ยน ${r.unchanged}`]
  if (r.skipped_manual) parts.push(`ข้าม (มีที่เจ้าหน้าที่เพิ่มไว้) ${r.skipped_manual}`)
  if (r.skipped_deleted) parts.push(`ข้าม (เจ้าหน้าที่ลบไว้) ${r.skipped_deleted}`)
  if (r.missing) parts.push(`ไม่อยู่ในแหล่งข้อมูลแล้ว ${r.missing}`)
  return parts.join(' · ')
}

/** Status of the Thai public holiday sync, a button to run it now, and the imported holidays. */
export default function HolidaySyncPanel() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear()) // ค.ศ.

  const { data: status, isLoading, isError } = useQuery({
    queryKey: ['holiday-sync-status'],
    queryFn: staffApi.getHolidaySyncStatus,
    refetchInterval: 60_000,
  })

  const { data: imported = [], isLoading: importedLoading } = useQuery({
    queryKey: ['imported-holidays', year],
    queryFn: () => staffApi.listImportedHolidays(year),
    enabled: open,
  })

  const syncMut = useMutation({
    mutationFn: staffApi.runHolidaySync,
    onSuccess: ({ runs }) => {
      const failed = runs.filter((r) => r.status === 'failed').length
      const created = runs.reduce((n, r) => n + r.created, 0)
      if (failed > 0) showToast(`ซิงก์ไม่สำเร็จ ${failed} ปี (ข้อมูลเดิมไม่เปลี่ยนแปลง) ดูรายละเอียดในแผงสถานะ`, 'warning')
      else showToast(created > 0 ? `ซิงก์สำเร็จ เพิ่มวันหยุดใหม่ ${created} วัน` : 'ซิงก์สำเร็จ ข้อมูลเป็นปัจจุบันแล้ว', 'success')
      for (const key of ['holiday-sync-status', 'imported-holidays', 'semester-cal-dates', 'staff-calendar-dates', 'calendar-dates',
        'monthly-plan']) qc.invalidateQueries({ queryKey: [key] })
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      showToast(status === 409 ? 'กำลังซิงก์อยู่ กรุณารอสักครู่แล้วลองใหม่' : 'สั่งซิงก์ไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const years = status?.runs.map((r) => r.year) ?? []
  const yearOptions = Array.from(new Set([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, ...years])).sort()

  const problems = status?.runs.filter((r) => r.status === 'failed') ?? []

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-500)' }}>
        <span>
          {isLoading && 'กำลังโหลดสถานะการซิงก์วันหยุดราชการ...'}
          {isError && 'โหลดสถานะการซิงก์ไม่สำเร็จ'}
          {status && (
            <>
              วันหยุดราชการไทยซิงก์อัตโนมัติ{status.enabled ? '' : ' (ปิดอยู่)'} · ล่าสุด{' '}
              <strong style={{ color: 'var(--ink-700)', fontWeight: 600 }}>{formatDateTime(status.last_success_at)}</strong>
            </>
          )}
        </span>
        <button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="btn btn-outline btn-xs"
        >
          {syncMut.isPending ? 'กำลังซิงก์...' : 'ซิงก์ตอนนี้'}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--primary)' }}
        >
          {open ? 'ซ่อนรายละเอียด' : 'รายละเอียด'}
        </button>
      </div>

      {problems.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: STATUS_COLOR.failed.fg }}>
          ซิงก์ไม่สำเร็จ: ปี {problems.map((r) => r.year + 543).join(', ')} (ข้อมูลเดิมไม่เปลี่ยนแปลง)
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--line-soft)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 8px' }}>
            รายการที่นำเข้าใช้ได้ทันที ไม่ต้องอนุมัติ และไม่ทับหรือลบวันหยุดที่เจ้าหน้าที่เพิ่มเอง
          </p>
          {status?.runs.map((r) => (
            <div key={r.year} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '3px 0' }}>
              <strong style={{ minWidth: 64 }}>ปี {r.year + 543}</strong>
              <span style={{
                padding: '0 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                color: STATUS_COLOR[r.status].fg, background: STATUS_COLOR[r.status].bg,
              }}>{STATUS_LABEL[r.status]}</span>
              <span style={{ color: 'var(--ink-500)' }}>{runSummary(r)}</span>
            </div>
          ))}
          <label style={{ fontSize: 12.5, color: 'var(--ink-600)', display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            รายการวันหยุดที่นำเข้า ปี
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{
              height: 28, padding: '0 8px', borderRadius: 7, border: '1.5px solid var(--line)', background: '#fff', fontSize: 13,
            }}>
              {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </select>
          </label>
          {importedLoading ? (
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>กำลังโหลด...</p>
          ) : imported.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีวันหยุดที่นำเข้าของปีนี้</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-500)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>วันที่</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>ชื่อวันหยุด</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>ประเภท</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>ซิงก์ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {imported.map((h) => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatThaiDate(h.date)}</td>
                    <td style={{ padding: '6px 8px' }}>{h.name}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--ink-500)' }}>
                      {TYPE_LABEL[h.external_type ?? ''] ?? h.external_type ?? '-'}
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{formatDateTime(h.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}
