import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentApi } from '../../../services/api'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Skeleton } from '../../../components/ui/Skeleton'
import { useToast } from '../../../hooks/useToast'
import { WeeklyCalendarPreview } from './WeeklyCalendarPreview'
import { SlotRow } from './SlotRow'
import type { DraftSlot } from './SlotRow'
import type { TermOption, ScheduleSlot, TermScheduleStatus, WorkSession } from '../../../types'

let _uid = 0
function nextId() { return String(++_uid) }

function toScheduleSlots(drafts: DraftSlot[]): ScheduleSlot[] {
  return drafts.map(({ day, start_time, end_time }) => ({ day, start_time, end_time }))
}

function getDayOfWeek(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, mo - 1, d).getDay()
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dow]
}

function toMin(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function hasOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1)
}

const DAY_LABELS: Record<string, string> = {
  MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ',
  THU: 'พฤหัสบดี', FRI: 'ศุกร์', SAT: 'เสาร์', SUN: 'อาทิตย์',
}

function semesterLabel(s: string): string {
  if (s === '1') return 'ภาคต้น'
  if (s === '2') return 'ภาคปลาย'
  if (s === '3' || s.toLowerCase() === 's') return 'ภาคฤดูร้อน'
  return `ภาคเรียนที่ ${s}`
}

function buildTermOptions(terms: TermOption[]): { value: string; label: string }[] {
  if (!terms.length) {
    // Fallback: generate current + previous year
    const thYear = new Date().getFullYear() + 543
    return [
      { value: `2|${thYear}`, label: `${semesterLabel('2')} ${thYear}` },
      { value: `1|${thYear}`, label: `${semesterLabel('1')} ${thYear}` },
      { value: `2|${thYear - 1}`, label: `${semesterLabel('2')} ${thYear - 1}` },
      { value: `1|${thYear - 1}`, label: `${semesterLabel('1')} ${thYear - 1}` },
    ]
  }
  return terms.map((t) => ({
    value: `${t.semester}|${t.academic_year}`,
    label: `${semesterLabel(t.semester)} ${t.academic_year}`,
  }))
}

interface ValidationErrors {
  slots: Record<string, string>
  global: string
}

function validate(drafts: DraftSlot[], noClass: boolean): ValidationErrors {
  const errors: Record<string, string> = {}
  let global = ''

  if (noClass) return { slots: {}, global: '' }

  for (const d of drafts) {
    if (!d.day || !d.start_time || !d.end_time) {
      errors[d._id] = 'กรุณากรอกวันและเวลาให้ครบ'
    } else if (d.start_time >= d.end_time) {
      errors[d._id] = 'เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด'
    }
  }

  // Overlap check per day
  const byDay: Record<string, DraftSlot[]> = {}
  for (const d of drafts) {
    if (!d.day || errors[d._id]) continue
    if (!byDay[d.day]) byDay[d.day] = []
    byDay[d.day].push(d)
  }
  for (const day of Object.keys(byDay)) {
    const group = byDay[day]
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (hasOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) {
          errors[a._id] = `เวลาทับซ้อนกับรายการอื่นในวัน${DAY_LABELS[day] ?? day}`
          errors[b._id] = `เวลาทับซ้อนกับรายการอื่นในวัน${DAY_LABELS[day] ?? day}`
        }
        // Exact duplicate
        if (a.day === b.day && a.start_time === b.start_time && a.end_time === b.end_time) {
          errors[b._id] = 'รายการซ้ำกัน'
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    global = 'กรุณาแก้ไขข้อผิดพลาดก่อนบันทึก'
  }

  return { slots: errors, global }
}

export function ScheduleTab() {
  const qc = useQueryClient()
  const showToast = useToast()
  const imageInput = useRef<HTMLInputElement>(null)

  // Term picker
  const { data: termOptions = [] } = useQuery({
    queryKey: ['available-terms'],
    queryFn: studentApi.getAvailableTerms,
    staleTime: 5 * 60 * 1000,
  })

  const builtOptions = useMemo(() => buildTermOptions(termOptions), [termOptions])
  const [selectedTermKey, setSelectedTermKey] = useState<string>('')

  useEffect(() => {
    if (builtOptions.length && !selectedTermKey) {
      setSelectedTermKey(builtOptions[0].value)
    }
  }, [builtOptions, selectedTermKey])

  const parsedTerm = useMemo(() => {
    if (!selectedTermKey) return null
    const [semester, yearStr] = selectedTermKey.split('|')
    return { semester, academic_year: Number(yearStr) }
  }, [selectedTermKey])

  // Fetch saved term schedule
  const {
    data: savedSchedule,
    isLoading: scheduleLoading,
  } = useQuery({
    queryKey: ['term-schedule', parsedTerm?.semester, parsedTerm?.academic_year],
    queryFn: () => studentApi.getTermSchedule(parsedTerm!.semester, parsedTerm!.academic_year),
    enabled: !!parsedTerm,
  })

  // Work sessions for conflict detection
  const { data: workSessions = [] } = useQuery<WorkSession[]>({
    queryKey: ['work-schedule'],
    queryFn: studentApi.workSchedule,
  })

  // Class schedule image (evidence)
  const { data: existingImage } = useQuery({
    queryKey: ['class-schedule'],
    queryFn: studentApi.getClassSchedule,
    retry: false,
  })

  // Draft state — local copy of slots being edited
  const [drafts, setDrafts] = useState<DraftSlot[]>([])
  const [noClass, setNoClass] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({ slots: {}, global: '' })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [showOcrImport, setShowOcrImport] = useState(false)

  // Sync drafts from saved schedule on term change
  useEffect(() => {
    if (!savedSchedule) return
    if (savedSchedule.status === 'no_class') {
      setNoClass(true)
      setDrafts([])
    } else {
      setNoClass(false)
      setDrafts(savedSchedule.slots.map((s) => ({ _id: nextId(), ...s })))
    }
    setConfirmed(false)
    setErrors({ slots: {}, global: '' })
    setShowOcrImport(
      savedSchedule.status === 'unset' &&
        !!existingImage?.slots?.length
    )
  }, [savedSchedule, existingImage?.slots?.length])

  // Save mutation
  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof studentApi.saveTermSchedule>[0]) =>
      studentApi.saveTermSchedule(data),
    onSuccess: (result) => {
      qc.setQueryData(
        ['term-schedule', parsedTerm?.semester, parsedTerm?.academic_year],
        result,
      )
      showToast('บันทึกตารางเรียนเรียบร้อยแล้ว', 'success')
      setConfirmed(false)
      setErrors({ slots: {}, global: '' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(msg ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่', 'error')
    },
  })

  // Image upload mutation
  const imgMut = useMutation({
    mutationFn: studentApi.uploadScheduleImage,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['class-schedule'] })
      showToast(`แนบรูป "${result.file_name}" เรียบร้อยแล้ว`, 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      showToast(msg ?? 'อัปโหลดรูปไม่สำเร็จ', 'error')
    },
  })

  const handleSave = useCallback(() => {
    if (!parsedTerm) return
    const status: TermScheduleStatus = noClass ? 'no_class' : 'set'
    const v = validate(drafts, noClass)
    if (Object.keys(v.slots).length || v.global) {
      setErrors(v)
      return
    }
    setErrors({ slots: {}, global: '' })
    saveMut.mutate({
      semester: parsedTerm.semester,
      academic_year: parsedTerm.academic_year,
      slots: noClass ? [] : toScheduleSlots(drafts),
      status,
    })
  }, [parsedTerm, noClass, drafts, saveMut])

  const addSlot = useCallback(() => {
    setDrafts((d) => [...d, { _id: nextId(), day: '', start_time: '', end_time: '' }])
    setNoClass(false)
  }, [])

  const changeSlot = useCallback((id: string, field: 'day' | 'start_time' | 'end_time', value: string) => {
    setDrafts((d) => d.map((s) => s._id === id ? { ...s, [field]: value } : s))
    setErrors((e) => ({ ...e, slots: { ...e.slots, [id]: '' } }))
  }, [])

  const deleteSlot = useCallback((id: string) => {
    setDrafts((d) => d.filter((s) => s._id !== id))
    setErrors((e) => {
      const next = { ...e.slots }
      delete next[id]
      return { ...e, slots: next }
    })
  }, [])

  const importOcrSlots = useCallback(() => {
    if (!existingImage?.slots?.length) return
    setDrafts(existingImage.slots.map((s) => ({ _id: nextId(), ...s })))
    setShowOcrImport(false)
    showToast(`นำเข้า ${existingImage.slots.length} ช่วงเวลาจากรูปเดิม — กรุณาตรวจสอบและบันทึก`, 'info')
  }, [existingImage?.slots, showToast])

  // Conflict detection
  const conflicts = useMemo(() => {
    if (!parsedTerm || saveMut.isPending) return []
    if (savedSchedule?.status !== 'set') return []
    const confirmedSlots = savedSchedule.slots
    const relevant = workSessions.filter(
      (w) => w.semester === parsedTerm.semester && w.academic_year === parsedTerm.academic_year,
    )
    const found: { sessionDate: string; courseCode: string; slotTime: string; workTime: string }[] = []
    for (const session of relevant) {
      if (!session.work_time_start || !session.work_time_end) continue
      const day = getDayOfWeek(session.session_date)
      for (const slot of confirmedSlots) {
        if (slot.day !== day) continue
        if (hasOverlap(slot.start_time, slot.end_time, session.work_time_start, session.work_time_end)) {
          found.push({
            sessionDate: session.session_date,
            courseCode: session.course_code,
            slotTime: `${slot.start_time}–${slot.end_time}`,
            workTime: `${session.work_time_start}–${session.work_time_end}`,
          })
        }
      }
    }
    return found
  }, [parsedTerm, savedSchedule, workSessions, saveMut.isPending])

  const currentSlots = toScheduleSlots(drafts)
  const statusInfo = savedSchedule?.status
  const isSaved = statusInfo === 'set' || statusInfo === 'no_class'
  const canSave = (noClass || drafts.length > 0) && confirmed && !saveMut.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Term picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)', flexShrink: 0 }}>ภาคเรียน</div>
        <Select
          value={selectedTermKey}
          onChange={(e) => setSelectedTermKey(e.target.value)}
          options={[{ value: '', label: '— เลือกภาคเรียน —' }, ...builtOptions]}
          style={{ maxWidth: 260 }}
          aria-label="เลือกภาคเรียน"
        />
        {isSaved && (
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            background: statusInfo === 'no_class' ? 'var(--amber-bg)' : 'var(--green-bg)',
            color: statusInfo === 'no_class' ? 'var(--amber)' : 'var(--green)',
          }}>
            {statusInfo === 'no_class' ? 'ไม่มีคาบเรียน' : 'ระบุตารางเรียนแล้ว'}
          </span>
        )}
        {statusInfo === 'unset' && (
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            background: 'var(--line-soft)', color: 'var(--ink-500)',
          }}>
            ยังไม่ระบุตารางเรียน
          </span>
        )}
      </div>

      {!parsedTerm ? null : scheduleLoading ? (
        <Skeleton lines={4} height={16} />
      ) : (
        <>
          {/* OCR import banner */}
          {showOcrImport && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '12px 16px', borderRadius: 8,
              background: 'var(--primary-50, #F0F1FA)',
              border: '1px solid var(--primary-100, #E1E3F3)',
            }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-700)' }}>
                พบข้อมูลตารางเรียนจากรูปที่เคยอัปโหลด ({existingImage!.slots.length} ช่วงเวลา)
                — สามารถนำเข้าเป็นร่างเพื่อตรวจทานก่อนบันทึก
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={importOcrSlots}>นำเข้าเป็นร่าง</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowOcrImport(false)}>ข้าม</Button>
              </div>
            </div>
          )}

          {/* Main card: slots form + preview */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 0,
            }}>
              {/* Left: slot form */}
              <div style={{ padding: 24, borderRight: '1px solid var(--line)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
                  ช่วงเวลาที่ติดเรียน
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
                  กรอกครั้งเดียว ใช้กับการสมัครทุกวิชา
                </div>

                {/* No-class option */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, fontWeight: 600, color: 'var(--ink-700)',
                  cursor: 'pointer', marginBottom: 16,
                }}>
                  <input
                    type="checkbox"
                    checked={noClass}
                    onChange={(e) => {
                      setNoClass(e.target.checked)
                      if (e.target.checked) setDrafts([])
                      setErrors({ slots: {}, global: '' })
                    }}
                    disabled={saveMut.isPending}
                  />
                  ภาคเรียนนี้ไม่มีคาบเรียน
                </label>

                {/* Slot rows */}
                {!noClass && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {drafts.length === 0 && (
                      <div style={{ fontSize: 13, color: 'var(--ink-400)', padding: '8px 0' }}>
                        ยังไม่มีช่วงเวลา — กดเพิ่มช่วงเวลาด้านล่าง
                      </div>
                    )}
                    {drafts.map((slot, idx) => (
                      <SlotRow
                        key={slot._id}
                        slot={slot}
                        index={idx}
                        error={errors.slots[slot._id]}
                        disabled={saveMut.isPending}
                        onChange={changeSlot}
                        onDelete={deleteSlot}
                      />
                    ))}
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addSlot}
                        disabled={saveMut.isPending}
                      >
                        + เพิ่มช่วงเวลา
                      </Button>
                    </div>
                  </div>
                )}

                {noClass && (
                  <div style={{
                    fontSize: 13, color: 'var(--amber)', padding: '10px 14px',
                    background: 'var(--amber-bg)', borderRadius: 8,
                  }}>
                    ยืนยันว่าภาคเรียนนี้ไม่มีคาบเรียน ระบบจะไม่ตรวจเวลาชนสำหรับภาคเรียนนี้
                  </div>
                )}
              </div>

              {/* Right: weekly preview */}
              <div style={{ padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
                  ตัวอย่างตารางรายสัปดาห์
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
                  {currentSlots.length === 0 && !noClass
                    ? 'เพิ่มช่วงเวลาทางซ้ายเพื่อดูตัวอย่าง'
                    : 'อัปเดตทันทีตามที่กรอก'}
                </div>
                {noClass ? (
                  <div style={{
                    height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px dashed var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--ink-400)',
                  }}>
                    ไม่มีคาบเรียนในภาคเรียนนี้
                  </div>
                ) : currentSlots.length === 0 ? (
                  <div style={{
                    height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px dashed var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--ink-400)',
                  }}>
                    ยังไม่มีช่วงเวลา
                  </div>
                ) : (
                  <WeeklyCalendarPreview slots={currentSlots} />
                )}
              </div>
            </div>
          </Card>

          {/* CSS for responsive grid */}
          <style>{`@media(max-width:700px){.schedule-grid{grid-template-columns:1fr!important}}`}</style>

          {/* Image evidence card */}
          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
              รูปตารางเรียนประกอบ
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 16 }}>
              ใช้ให้อาจารย์ตรวจสอบข้อมูล — ไม่กระทบช่วงเวลาที่กรอก
            </div>

            <input
              ref={imageInput}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              aria-label="เลือกรูปตารางเรียนประกอบ"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (file.size > 10 * 1024 * 1024) {
                  showToast('ไฟล์ใหญ่เกิน 10 MB', 'error')
                  return
                }
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                  showToast('รองรับเฉพาะ JPG และ PNG', 'error')
                  return
                }
                const url = URL.createObjectURL(file)
                setImagePreviewUrl(url)
                imgMut.mutate(file)
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Thumbnail */}
              {(imagePreviewUrl || existingImage) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (imagePreviewUrl) {
                      window.open(imagePreviewUrl, '_blank')
                      return
                    }
                    // Use authenticated fetch for existing image
                    try {
                      const blob = await studentApi.getClassScheduleImage()
                      const url = URL.createObjectURL(blob)
                      window.open(url, '_blank')
                    } catch { /* ignore */ }
                  }}
                  aria-label="เปิดดูรูปตารางเรียน"
                  style={{
                    background: 'none', border: '1px solid var(--line)',
                    borderRadius: 8, padding: 4, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt="รูปตารางเรียน"
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 72, height: 72, borderRadius: 6,
                      background: 'var(--line-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 28,
                    }}>
                      🖼
                    </div>
                  )}
                </button>
              )}

              <div style={{ flex: 1 }}>
                {existingImage && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 2 }}>
                    {existingImage.file_name}
                  </div>
                )}
                {existingImage && (
                  <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 6 }}>
                    แนบแล้ว · อัปเดต {new Date(existingImage.updated_at).toLocaleDateString('th-TH')}
                  </div>
                )}
                {imgMut.isPending && (
                  <div style={{ fontSize: 13, color: 'var(--primary)' }}>กำลังอัปโหลด...</div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={existingImage ? 'outline' : 'primary'}
                  loading={imgMut.isPending}
                  onClick={() => imageInput.current?.click()}
                >
                  {existingImage ? 'เปลี่ยนรูป' : 'แนบรูปตารางเรียน'}
                </Button>
              </div>

              {!existingImage && !imgMut.isPending && (
                <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                  ยังไม่ได้แนบรูป — เป็นทางเลือก ไม่บังคับ
                </div>
              )}
            </div>
          </Card>

          {/* Conflict detection */}
          {parsedTerm && savedSchedule?.status === 'set' && (
            <Card style={{ padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>
                ตรวจเวลาชน
              </div>
              {conflicts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--green)' }}>
                  ไม่พบเวลาชนกับตารางปฏิบัติงานในภาคเรียนนี้
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>
                    พบ {conflicts.length} รายการที่เวลาชนกัน — กรุณาแจ้งอาจารย์
                  </div>
                  {conflicts.map((c, i) => (
                    <div key={i} style={{
                      fontSize: 13, padding: '8px 12px', borderRadius: 8,
                      background: 'var(--red-bg)', color: 'var(--red)',
                    }}>
                      <strong>{c.sessionDate}</strong> · {c.courseCode} · งาน {c.workTime} ชนกับคาบเรียน {c.slotTime}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {savedSchedule?.status === 'unset' && parsedTerm && !scheduleLoading && (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>
              ยังตรวจสอบเวลาชนไม่ได้ — กรุณาระบุและบันทึกตารางเรียนก่อน
            </div>
          )}

          {/* Save section */}
          <Card style={{ padding: 24 }}>
            {errors.global && (
              <div role="alert" style={{
                fontSize: 13, color: 'var(--red)', marginBottom: 16,
                padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 8,
              }}>
                {errors.global}
              </div>
            )}

            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 14, fontWeight: 600, color: 'var(--ink-900)',
              cursor: 'pointer', marginBottom: 16,
            }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={saveMut.isPending}
                style={{ width: 16, height: 16 }}
              />
              ฉันตรวจสอบวันและเวลาเรียนแล้ว และยืนยันว่าข้อมูลถูกต้อง
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                onClick={handleSave}
                loading={saveMut.isPending}
                disabled={!canSave}
              >
                บันทึกตารางเรียน
              </Button>
              {isSaved && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saveMut.isPending}
                  onClick={() => {
                    if (!savedSchedule) return
                    if (savedSchedule.status === 'no_class') {
                      setNoClass(true)
                      setDrafts([])
                    } else {
                      setNoClass(false)
                      setDrafts(savedSchedule.slots.map((s) => ({ _id: nextId(), ...s })))
                    }
                    setConfirmed(false)
                    setErrors({ slots: {}, global: '' })
                  }}
                >
                  ยกเลิกการแก้ไข
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
