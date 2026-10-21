import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { applicationsAPI, reportsApi } from '../../services/api'
import { ReportList } from '../../components/reports/ReportList'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { FilterChips } from '../../components/ui/FilterChips'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Skeleton, SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Icon } from '../../components/reports/ReportIcons'
import { useToast } from '../../hooks/useToast'
import { formatSchedule } from '../../utils/schedule'
import type { Application } from '../../types'

const MAIN_TABS = [
  { value: 'courses', label: 'รายวิชาและเพื่อนร่วมแล็บ' },
  { value: 'history', label: 'ประวัติรายงานของฉัน' },
]

const CATEGORY_OPTIONS = [
  { value: 'DUTY_NEGLECT', label: 'ละเลยหน้าที่ในห้องปฏิบัติการ' },
  { value: 'LATE_NOTICE', label: 'มาสาย / แจ้งลาล่าช้า' },
  { value: 'ABSENCE', label: 'ขาดการปฏิบัติงานโดยไม่แจ้ง' },
  { value: 'UNPROFESSIONAL_CONDUCT', label: 'พฤติกรรมไม่เหมาะสม' },
  { value: 'OTHER', label: 'อื่นๆ' },
]

const today = () => new Date().toISOString().slice(0, 10)

const STATUS_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'SUBMITTED,UNDER_REVIEW,AWAITING_RESPONSE', label: 'อยู่ระหว่างตรวจสอบ' },
  { value: 'CONFIRMED', label: 'ยืนยันแล้ว' },
  { value: 'NOT_SUBSTANTIATED', label: 'ไม่ยืนยัน' },
  { value: 'WITHDRAWN', label: 'ถอนแล้ว' },
]

interface Peer {
  application_id: number
  student_id: number
  student_name: string
  student_code: string
  role_applied: string
  status: string
  is_self: boolean
}

export default function StudentReports() {
  const qc = useQueryClient()
  const showToast = useToast()
  const [tab, setTab] = useState('courses')
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  // Report modal state
  const [reportTarget, setReportTarget] = useState<Peer | null>(null)
  const [incidentDate, setIncidentDate] = useState(today)
  const [descriptionError, setDescriptionError] = useState('')
  const [category, setCategory] = useState('DUTY_NEGLECT')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState('')

  // 1. Fetch student's applied courses
  const { data: rawApps = [], isLoading: appsLoading, isError: appsError, refetch: refetchApps } = useQuery<Application[]>({
    queryKey: ['student', 'my-applications'],
    queryFn: applicationsAPI.getMyApplications,
  })

  // แสดงเฉพาะวิชาที่นักศึกษาได้รับการยืนยันเข้าปฏิบัติงานแล้ว (status === 'accepted')
  const myApps = rawApps.filter((app) => app.status === 'accepted')

  // 2. Fetch peers for the selected course
  const { data: rawPeers = [], isLoading: peersLoading, isError: peersError, refetch: refetchPeers } = useQuery<Peer[]>({
    queryKey: ['student', 'peers', selectedApp?.course_id],
    queryFn: () => (selectedApp ? applicationsAPI.getCoursePeers(selectedApp.course_id) : Promise.resolve([])),
    enabled: !!selectedApp,
  })

  // แสดงเฉพาะเพื่อนร่วมแล็บคนอื่นๆ ที่ได้รับการยืนยันเข้าปฏิบัติงานแล้ว (status === 'accepted') และไม่ใช่ตนเอง
  const peers = rawPeers.filter((p) => !p.is_self && p.status === 'accepted')

  // 3. Submit report mutation
  const submitMutation = useMutation({
    mutationFn: (data: { application_id: number; incident_date: string; category: string; description: string; impact: string }) =>
      applicationsAPI.createReport(data),
    onSuccess: () => {
      showToast('ส่งรายงานพฤติกรรมเรียบร้อยแล้ว รายงานจะเข้าสู่กระบวนการตรวจสอบของเจ้าหน้าที่', 'success')
      setReportTarget(null)
      setDescription('')
      setImpact('')
      qc.invalidateQueries({ queryKey: ['student-reports'] })
    },
    onError: (err) => {
      showToast((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || 'เกิดข้อผิดพลาดในการส่งรายงาน', 'error')
    },
  })

  function handleOpenReport(peer: Peer) {
    setReportTarget(peer)
    setIncidentDate(today())
    setCategory('DUTY_NEGLECT')
    setDescriptionError('')
    setDescription('')
    setImpact('')
  }

  function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportTarget) return
    if (!description.trim()) {
      setDescriptionError('กรุณาระบุรายละเอียดเหตุการณ์')
      return
    }
    submitMutation.mutate({
      application_id: reportTarget.application_id,
      incident_date: incidentDate,
      category,
      description: description.trim(),
      impact: impact.trim(),
    })
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', paddingBottom: 40 }}>
      <ReportPageHeader
        title="รายงานการปฏิบัติงาน Lab Boy"
        subtitle="ตรวจสอบรายวิชาที่ท่านปฏิบัติงาน ดูรายชื่อเพื่อนร่วมแล็บ และรายงานเหตุการณ์เพื่อการประเมินการปฏิบัติงาน"
      />

      {/* Tabs */}
      <div style={{ marginBottom: 20 }}>
        <FilterChips options={MAIN_TABS} value={tab} onChange={(v) => { setTab(v); setSelectedApp(null) }} />
      </div>

      {/* TAB 1: Menu Cards & Course Peers */}
      {tab === 'courses' && (
        <>
          {!selectedApp ? (
            /* Menu Cards Grid */
            <div>
              <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px 16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
                  รายวิชาที่ฉันปฏิบัติงาน{!appsLoading && !appsError && ` (${myApps.length})`}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>เลือกรายวิชาเพื่อดูเพื่อนร่วมแล็บและส่งรายงาน</span>
              </div>

              {appsLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : appsError ? (
                <ErrorState onRetry={() => refetchApps()} />
              ) : myApps.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีรายวิชาที่ปฏิบัติงาน"
                  description="เมื่อได้รับเลือกเป็น Lab Boy ในรายวิชาใด รายวิชานั้นจะแสดงที่นี่"
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 18 }}>
                  {myApps.map((app: Application) => (
                    <button
                      key={app.id}
                      type="button"
                      className="report-course-card"
                      onClick={() => setSelectedApp(app)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                          background: 'var(--primary-50)', color: 'var(--primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon name="book" size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                            {app.course_code} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-500)' }}>· Sec {app.course_section ?? 1}</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', lineHeight: 1.4 }}>
                            {app.course_title}
                          </div>
                        </div>
                      </div>

                      {app.course_schedule && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--ink-600)', marginBottom: 14 }}>
                          <Icon name="clock" size={14} style={{ color: 'var(--ink-400)', marginTop: 3, flexShrink: 0 }} />
                          <span>{formatSchedule(app.course_schedule, { separator: ' / ' })}</span>
                        </div>
                      )}

                      <div className="report-course-card-action">
                        <span>ดูเพื่อนร่วมแล็บและส่งรายงาน</span>
                        <Icon name="chevron-right" size={16} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Selected Course Detail View with Peers List */
            <div>
              {/* Back Button */}
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: 'var(--ink-600)', fontSize: 14, fontWeight: 600,
                  marginBottom: 12, padding: '8px 8px 8px 0', minHeight: 40, borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-600)')}
              >
                <span aria-hidden="true">←</span>
                <span>รายวิชาทั้งหมด</span>
              </button>

              {/* Course Info Card */}
              <Card padding={20} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{selectedApp.course_code}</span>
                      <span style={{ fontSize: 14, color: 'var(--ink-500)' }}>Sec {selectedApp.course_section ?? 1}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 2 }}>
                      {selectedApp.course_title}
                    </div>
                    {selectedApp.course_english_title && (
                      <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                        {selectedApp.course_english_title}
                      </div>
                    )}
                    {selectedApp.course_schedule && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-600)', marginTop: 8 }}>
                        <Icon name="clock" size={15} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />
                        <span>{formatSchedule(selectedApp.course_schedule, { separator: ' / ' })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Peers List Card */}
              <Card padding={20}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
                      เพื่อนร่วมแล็บในรายวิชานี้
                    </h3>
                    <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 2 }}>
                      Lab Boy ที่ได้รับการยืนยันแล้ว — หากมีเหตุการณ์ที่ต้องแจ้งอาจารย์และเจ้าหน้าที่ ให้กด "รายงานพฤติกรรม"
                    </div>
                  </div>
                  {!peersLoading && !peersError && <Badge variant="blue">{peers.length} คน</Badge>}
                </div>

                {peersLoading ? (
                  <Skeleton lines={4} height={20} />
                ) : peersError ? (
                  <ErrorState onRetry={() => refetchPeers()} />
                ) : peers.length === 0 ? (
                  <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-400)', fontSize: 14 }}>
                    ไม่พบรายชื่อเพื่อนร่วมแล็บคนอื่นในรายวิชานี้
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {peers.map((peer: Peer) => (
                      <li key={peer.application_id} className="report-peer-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 200px' }}>
                          <div aria-hidden="true" style={{
                            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--primary-50)', color: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700,
                          }}>
                            {peer.student_name ? peer.student_name.slice(0, 1) : 'ส'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{peer.student_name}</div>
                            <div style={{ fontSize: 13, color: 'var(--ink-500)', fontVariantNumeric: 'tabular-nums' }}>{peer.student_code || '—'}</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenReport(peer)}
                          aria-label={`รายงานพฤติกรรมของ ${peer.student_name}`}
                          style={{ borderColor: 'var(--red)', color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36 }}
                        >
                          <Icon name="flag" size={13} />
                          <span>รายงานพฤติกรรม</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {/* TAB 2: Incident Reports History (Existing 5 cases) */}
      {tab === 'history' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)' }}>
              รายงานที่เกี่ยวข้องกับฉัน
            </span>
            <p style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
              รายงานที่ยังไม่ผ่านการตรวจสอบไม่ใช่ข้อสรุปว่าคุณกระทำผิด สามารถกดเข้าไปเพื่อส่งคำชี้แจงหรือขอให้ทบทวนผลได้
            </p>
          </div>
          <ReportList
            queryKey="student-reports"
            fetchPage={reportsApi.studentReports}
            statusOptions={STATUS_OPTIONS}
            showSearch={false}
            showStudent={false}
            emptyText="ไม่มีรายงานที่เกี่ยวข้องกับคุณ"
          />
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <Modal
          isOpen={true}
          onClose={() => setReportTarget(null)}
          title="รายงานพฤติกรรมการปฏิบัติงาน"
        >
          <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--line-soft)', padding: 12, borderRadius: 8 }}>
              <div aria-hidden="true" style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: '#fff', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
              }}>
                {reportTarget.student_name ? reportTarget.student_name.slice(0, 1) : 'ส'}
              </div>
              <div style={{ minWidth: 0, fontSize: 13, color: 'var(--ink-600)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>
                  {reportTarget.student_name}{' '}
                  {reportTarget.student_code && <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>({reportTarget.student_code})</span>}
                </div>
                <div>{selectedApp?.course_code} {selectedApp?.course_title}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Input
                label="วันที่เกิดเหตุ *"
                type="date"
                value={incidentDate}
                max={today()}
                required
                onChange={(e) => setIncidentDate(e.target.value)}
              />
              <Select
                label="หมวดหมู่เหตุการณ์ *"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={CATEGORY_OPTIONS}
              />
            </div>

            <Textarea
              label="รายละเอียดเหตุการณ์ *"
              rows={4}
              value={description}
              error={descriptionError}
              onChange={(e) => { setDescription(e.target.value); if (e.target.value.trim()) setDescriptionError('') }}
              placeholder="ระบุข้อเท็จจริง เช่น เวลาที่เกิดเหตุ สิ่งที่เกิดขึ้นในห้องปฏิบัติการ"
            />

            <Textarea
              label="ผลกระทบต่อการเรียนการสอน (ถ้ามี)"
              rows={2}
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="เช่น ผู้ช่วยคนอื่นต้องดูแลห้องแล็บคนเดียว นักศึกษาไม่ได้รับคำแนะนำ"
            />

            <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: 0 }}>
              รายงานจะส่งให้อาจารย์และเจ้าหน้าที่ตรวจสอบ ผู้ถูกรายงานสามารถส่งคำชี้แจงได้ก่อนมีข้อสรุป
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setReportTarget(null)} disabled={submitMutation.isPending}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="primary" loading={submitMutation.isPending}>
                ส่งรายงาน
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
