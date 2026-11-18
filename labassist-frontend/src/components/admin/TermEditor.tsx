import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../services/api'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../hooks/useToast'
import {
  CALENDAR_SEMESTER_LABELS, filledTerms, termIssue, toTermDrafts, toTermPayload, type TermDraft,
} from '../../utils/academicCalendar'
import type { AcademicTerm } from '../../types'

const AFFECTED_QUERIES = ['academic-terms', 'semester-cal-dates', 'staff-calendar-dates', 'calendar-dates', 'monthly-plan']

function draftsFrom(terms: AcademicTerm[]): TermDraft[] {
  return toTermDrafts([]).map((d) => {
    const t = terms.find((x) => x.semester === d.semester)
    return { ...d, open_date: t?.open_date?.slice(0, 10) ?? '', close_date: t?.close_date?.slice(0, 10) ?? '' }
  })
}

/** Lets the admin type the open/close day of each semester without a PDF. */
export function TermEditor({ academicYear, terms }: { academicYear: number; terms: AcademicTerm[] }) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<TermDraft[]>(() => draftsFrom(terms))

  const save = useMutation({
    mutationFn: () => adminApi.importCalendar(academicYear, [], toTermPayload(drafts), []),
    onSuccess: () => {
      for (const key of AFFECTED_QUERIES) qc.invalidateQueries({ queryKey: [key] })
      showToast('บันทึกวันเปิด-ปิดภาคเรียนเรียบร้อย', 'success')
      setOpen(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(msg || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  const update = (semester: string, patch: Partial<TermDraft>) =>
    setDrafts((old) => old.map((t) => (t.semester === semester ? { ...t, ...patch } : t)))
  const problem = drafts.some((t) => termIssue(t))

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setDrafts(draftsFrom(terms)); setOpen(true) }}>
          บันทึก / แก้ไขวันเปิด-ปิดภาคเรียน ปี {academicYear}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!problem && filledTerms(drafts).length > 0) save.mutate() }}
      style={{ marginTop: 12, display: 'grid', gap: 12 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>วันเปิด-ปิดภาคเรียน ปีการศึกษา {academicYear} (พ.ศ.)</div>
      {drafts.map((t) => {
        const issue = termIssue(t)
        return (
          <div key={t.semester} style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{CALENDAR_SEMESTER_LABELS[t.semester]}</div>
            <Input label="วันเปิดภาคเรียน" type="date" value={t.open_date} onChange={(e) => update(t.semester, { open_date: e.target.value })} />
            <Input label="วันปิดภาคเรียน" type="date" value={t.close_date} min={t.open_date || undefined}
              onChange={(e) => update(t.semester, { close_date: e.target.value })} />
            {issue && <div role="alert" style={{ fontSize: 12.5, color: 'var(--red)' }}>{issue}</div>}
          </div>
        )
      })}
      <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>พิมพ์วัน/เดือน/ปี พ.ศ. เช่น 01/11/{academicYear} — ปล่อยว่างทั้งภาคถ้าไม่ต้องการบันทึก</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" size="sm" loading={save.isPending} disabled={problem || filledTerms(drafts).length === 0}>บันทึก</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
      </div>
    </form>
  )
}
