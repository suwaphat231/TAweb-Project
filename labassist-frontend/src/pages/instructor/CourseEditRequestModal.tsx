import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { instructorApi } from '../../services/api'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import { parseSchedule, formatSchedule, THAI_DAY_NAMES } from '../../utils/schedule'
import type { Course } from '../../types'

// Day codes in the classlist format the Excel import stores ("Tu 13:00 - 16:00"),
// indexed like Date.getDay().
const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface Period { start: string; end: string; room: string }

interface FormState {
  day: string
  periods: Period[]
  note: string
}

function initialForm(course: Course): FormState {
  const meetings = parseSchedule(course.schedule)
  return {
    day: meetings?.length ? String(meetings[0].dayIndex) : '',
    periods: meetings?.length
      ? meetings.map((m) => ({ start: m.start, end: m.end, room: m.room }))
      : [{ start: '', end: '', room: '' }],
    note: '',
  }
}

interface Props {
  course: Course | null
  onClose: () => void
}

/**
 * Lets an instructor propose a new meeting time for one of their courses.
 * Nothing on the course changes here — the request waits for an admin to
 * approve it. The name and credits are not editable by instructors.
 */
export function CourseEditRequestModal({ course, onClose }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  // Mounted with key={course.id} by the caller, so the form starts fresh per course.
  const [form, setForm] = useState<FormState | null>(() => (course ? initialForm(course) : null))
  // An untouched schedule is never re-serialised, so the imported text (room
  // spacing, Thai day names) can't read as a change.
  const [scheduleTouched, setScheduleTouched] = useState(false)
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: (payload: Parameters<typeof instructorApi.requestCourseEdit>[1]) =>
      instructorApi.requestCourseEdit(course!.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-course-edit-requests'] })
      showToast('ส่งคำขอแก้ไขให้แอดมินอนุมัติแล้ว', 'success')
      onClose()
    },
    onError: (err) => {
      const detail = isAxiosError(err) ? err.response?.data?.error : undefined
      setError(detail ?? 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่')
    },
  })

  if (!course || !form) return null

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const setPeriod = (i: number, patch: Partial<Period>) => {
    setScheduleTouched(true)
    set({ periods: form.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  }
  const unparsedSchedule = !parseSchedule(course.schedule) && !!course.schedule?.trim()

  const submit = () => {
    if (!scheduleTouched) {
      setError('ยังไม่มีการเปลี่ยนแปลงเวลาเรียน')
      return
    }
    if (form.day === '') {
      setError('ไม่พบวันเรียนเดิมของวิชานี้ กรุณาติดต่อแอดมิน')
      return
    }
    for (const p of form.periods) {
      if (!p.start || !p.end) {
        setError('กรุณากรอกเวลาเรียนให้ครบทุกแถว')
        return
      }
      if (p.start >= p.end) {
        setError('เวลาเริ่มเรียนต้องก่อนเวลาเลิกเรียน')
        return
      }
    }
    const day = DAY_CODES[Number(form.day)]
    const schedule = form.periods
      .map((p) => `${day} ${p.start} - ${p.end}${p.room.trim() ? ` ${p.room.trim()}` : ''}`)
      .join('\n')
    setError('')
    mut.mutate({ schedule, note: form.note.trim() })
  }

  return (
    <Modal isOpen onClose={onClose} title={`ขอแก้ไขเวลาเรียน ${course.code}`} size="lg">
      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
          การแก้ไขจะยังไม่มีผลทันที — ระบบจะส่งคำขอให้แอดมินตรวจสอบและอนุมัติก่อน
        </p>
        <p style={{ fontSize: 14, margin: 0 }}><strong>{course.title}</strong></p>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
            เวลาเรียน{form.day !== '' && <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}> — วัน{THAI_DAY_NAMES[Number(form.day)]}</span>}
          </legend>
          {unparsedSchedule && (
            <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 8px' }}>
              เวลาเรียนเดิม: {formatSchedule(course.schedule)}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.periods.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr auto', gap: 8, alignItems: 'end' }}>
                <Input aria-label={`เวลาเริ่มแถวที่ ${i + 1}`} type="time" value={p.start}
                  onChange={(e) => setPeriod(i, { start: e.target.value })} />
                <Input aria-label={`เวลาเลิกแถวที่ ${i + 1}`} type="time" value={p.end}
                  onChange={(e) => setPeriod(i, { end: e.target.value })} />
                <Input aria-label={`ห้องเรียนแถวที่ ${i + 1}`} placeholder="ห้อง (ถ้ามี)" value={p.room}
                  onChange={(e) => setPeriod(i, { room: e.target.value })} />
                <Button
                  type="button" size="sm" variant="ghost" aria-label={`ลบเวลาเรียนแถวที่ ${i + 1}`}
                  disabled={form.periods.length === 1}
                  onClick={() => { setScheduleTouched(true); set({ periods: form.periods.filter((_, j) => j !== i) }) }}
                >
                  ลบ
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => { setScheduleTouched(true); set({ periods: [...form.periods, { start: '', end: '', room: '' }] }) }}
              >
                + เพิ่มช่วงเวลาในวันเดียวกัน
              </Button>
            </div>
          </div>
        </fieldset>

        <Textarea
          label="เหตุผลการแก้ไข (แจ้งแอดมิน)" rows={3} value={form.note}
          placeholder="เช่น เวลาเรียนในตารางไม่ตรงกับที่สอนจริง"
          onChange={(e) => set({ note: e.target.value })}
        />

        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" loading={mut.isPending}>ยืนยันและส่งให้แอดมินอนุมัติ</Button>
        </div>
      </form>
    </Modal>
  )
}
