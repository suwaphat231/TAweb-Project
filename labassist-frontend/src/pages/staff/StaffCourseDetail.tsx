import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { findStaffReview } from '../../utils/staffOffering'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi, applicationsAPI, coursesAPI } from '../../services/api'
import { buildCourseOffering, docProgress } from './staffCourseUtils'
import { DocumentWorkflow } from './components/DocumentWorkflow'
import { SelectedStudentsPanel } from './components/SelectedStudentsPanel'
import type { CalendarDate, CalendarDateType } from '../../types'
import { formatSchedule } from '../../utils/schedule'
type Tab = 'documents' | 'info' | 'students' | 'history' | 'holidays'

const DATE_TYPE_LABELS: Record<CalendarDateType, string> = {
  public_holiday:     'วันหยุดราชการ',
  university_holiday: 'วันหยุดมหาวิทยาลัย',
  no_class:           'งดการเรียนการสอน',
  case_exception:     'ข้อยกเว้นรายวิชา',
  makeup:             'ชดเชย',
}

const DATE_TYPE_COLOR: Record<CalendarDateType, string> = {
  public_holiday:     '#DC2626',
  university_holiday: '#7C3AED',
  no_class:           '#D97706',
  case_exception:     '#2563EB',
  makeup:             '#059669',
}

const DAY_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTH_TH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function formatDateTH(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  return `${d.getDate()} ${MONTH_TH[d.getMonth() + 1]} ${d.getFullYear() + 543} (${DAY_TH[d.getDay()]})`
}

export default function StaffCourseDetail() {
  const { year, semester, code, section } = useParams<{
    year: string
    semester: string
    code: string
    section: string
  }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const courseIdParam = searchParams.get('course')
  const [activeTab, setActiveTab] = useState<Tab>('documents')
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['staff-reviews'],
    queryFn: () => staffApi.listReviews(),
  })

  const { data: allDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['staff-documents'],
    queryFn: () => staffApi.listDocuments(),
  })

  // Find the matching review
  const review = useMemo(
    () => findStaffReview(reviews, { year, semester, code, section, courseId: courseIdParam }),
    [reviews, year, semester, code, section, courseIdParam],
  )

  const offering = useMemo(
    () => review ? buildCourseOffering(review, allDocs) : null,
    [review, allDocs],
  )

  const courseDocs = useMemo(
    () => allDocs.filter((d) => review?.posting_id ? d.posting_id === review.posting_id : d.course_id === review?.course_id),
    [allDocs, review],
  )

  const courseRef = review ? `${review.course_code} ตอน ${review.section}` : ''

  // Load course details for schedule/credits
  const { data: courseDetail } = useQuery({
    queryKey: ['course-detail', review?.course_id],
    queryFn: () => coursesAPI.getById(review!.course_id),
    enabled: !!review?.course_id,
  })

  // Load applicants for this course
  const { data: applicants = [], isLoading: applicantsLoading } = useQuery({
    queryKey: ['course-applicants', review?.course_id],
    queryFn: () => applicationsAPI.getCourseApplicants(review!.course_id),
    enabled: !!review?.course_id,
  })

  // Load staff case linked to this offering's posting
  const { data: allCases = [] } = useQuery({
    queryKey: ['staff-cases'],
    queryFn: () => staffApi.listCases(),
    enabled: !!review,
  })

  // Load calendar dates (holidays) for this semester from settings
  const { data: calDates = [], isLoading: calDatesLoading } = useQuery<CalendarDate[]>({
    queryKey: ['semester-cal-dates', review?.semester, review?.academic_year],
    queryFn: () => staffApi.listCalendarDatesBySemester(review!.semester, review!.academic_year),
    enabled: !!review,
  })
  const staffCase = useMemo(() =>
    allCases.find((sc) => review?.posting_id ? sc.posting_id === review.posting_id : sc.course_id === review?.course_id),
    [allCases, review],
  )

  const qc = useQueryClient()

  const verifyMut = useMutation({
    mutationFn: () => staffApi.verifyReview(review!.course_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-reviews'] })
      qc.invalidateQueries({ queryKey: ['staff-documents'] })
      qc.invalidateQueries({ queryKey: ['document-workflow'] })
    },
  })

  const loading = reviewsLoading || docsLoading

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ height: 32, width: '50%', background: 'var(--line-soft)', borderRadius: 6, marginBottom: 20 }} />
        <div style={{ height: 160, background: 'var(--line-soft)', borderRadius: 'var(--radius-card)', marginBottom: 20 }} />
      </div>
    )
  }

  if (!review || !offering) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>ไม่พบรายวิชาที่ระบุ</div>
        <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 20 }}>
          รายวิชา {code} กลุ่ม {section} ปี {year} ภาค {semester} ไม่มีข้อมูลในระบบ
        </div>
        <button onClick={() => navigate('/staff/home')} className="btn btn-primary">
          กลับหน้าหลัก
        </button>
      </div>
    )
  }

  const progress = docProgress(review, allDocs)
  const progressPct = progress.total > 0 ? (progress.signed / progress.total) * 100 : 0
  const STATUS_LABEL: Record<string, string> = {
    waiting: 'รอจัดทำเอกสาร', in_progress: 'กำลังดำเนินการ', completed: 'เสร็จสิ้นแล้ว',
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'documents', label: 'เอกสารต้นภาคเรียน' },
    { id: 'info',      label: 'ข้อมูลรายวิชา' },
    { id: 'students',  label: 'รายชื่อ Lab Boy' },
    { id: 'holidays',  label: 'วันที่ไม่ต้องปฏิบัติงาน' },
    { id: 'history',   label: 'ประวัติการดำเนินงาน' },
  ]

  const workingDayHolidays = calDates.filter((d) => d.affects_work)
  const nonWorkingDayHolidays = calDates.filter((d) => !d.affects_work)

  const accepted = applicants.filter((a) => a.status === 'accepted')

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Back button */}
      <button onClick={() => navigate('/staff/home')} className="link-back" aria-label="กลับหน้าหลัก">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        กลับรายการวิชา
      </button>

      {/* Course header — minimal: ไม่มีกล่อง ใช้ลำดับตัวอักษรแบ่งความสำคัญ */}
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: 13, color: 'var(--ink-500)' }}>
            <span style={{ fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.3 }}>{offering.courseCode}</span>
            <span aria-hidden>·</span>
            <span>กลุ่ม {offering.sectionNo}</span>
            <span aria-hidden>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: '50%',
                background: offering.docStatus === 'completed' ? 'var(--green)' : offering.docStatus === 'in_progress' ? 'var(--primary)' : 'var(--amber)',
              }} />
              {STATUS_LABEL[offering.docStatus]}
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.35, margin: 0 }}>
            {offering.courseTitle}
          </h1>
          {courseDetail?.english_title && (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 2 }}>{courseDetail.english_title}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13, color: 'var(--ink-500)', marginTop: 10 }}>
            <span>ภาคเรียนที่ {offering.semester}/{offering.academicYear}</span>
            {courseDetail?.credits && <span>{courseDetail.credits} หน่วยกิต</span>}
            {(courseDetail?.schedule ?? offering.schedule) && (
              <span>{formatSchedule(courseDetail?.schedule ?? offering.schedule, { separator: ' / ' })}</span>
            )}
          </div>
        </div>

        {/* Progress — นับเฉพาะเอกสารต้นภาค ให้ตรงกับไทม์ไลน์ด้านล่าง */}
        <div style={{ flex: '0 0 200px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>เอกสารต้นภาคเรียน</span>
            <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
              <b style={{ fontSize: 18, color: 'var(--ink-900)' }}>{progress.signed}</b> / {progress.total}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, transition: 'width .4s',
              background: 'var(--primary)',
              width: `${progressPct}%`,
            }} />
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
          >
            {tab.label}
            {tab.id === 'students' && accepted.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'var(--line-soft)', color: 'var(--ink-500)' }}>
                {accepted.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {/* Workflow main area */}
            <div style={{ flex: '1 1 480px', padding: '20px 24px' }}>
              {/* Inline verify banner — shown when review is still pending */}
              {review.status !== 'verified' && (
                <div style={{
                  marginBottom: 20, padding: '12px 16px',
                  background: review.status === 'returned' ? 'var(--red-bg)' : 'var(--amber-bg)',
                  border: `1px solid ${review.status === 'returned' ? '#FECACA' : '#FCD34D'}`,
                  borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: review.status === 'returned' ? 'var(--red)' : 'var(--amber)' }}>
                      {review.status === 'returned' ? 'แบบฟอร์มถูกส่งกลับให้อาจารย์แก้ไข' : 'แบบฟอร์มยังไม่ได้รับการยืนยัน'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 2, lineHeight: 1.5 }}>
                      {review.status === 'returned' && review.note
                        ? <>หมายเหตุ: {review.note}</>
                        : 'ยืนยันแบบฟอร์มก่อนเพื่อเริ่มสร้างเอกสาร'}
                    </div>
                  </div>
                  <button
                    onClick={() => verifyMut.mutate()}
                    disabled={verifyMut.isPending}
                    className="btn btn-amber"
                    style={{ flexShrink: 0 }}
                  >
                    {verifyMut.isPending ? 'กำลังยืนยัน...' : 'ยืนยันแบบฟอร์ม'}
                  </button>
                </div>
              )}
              <DocumentWorkflow
                courseId={offering.courseId}
                courseRef={courseRef}
                staffCase={staffCase}
                courseCode={offering.courseCode}
                courseTitle={offering.courseTitle}
                sectionNo={offering.sectionNo}
                semester={offering.semester}
                academicYear={offering.academicYear}
                labBoyCount={accepted.length}
                courseSchedule={courseDetail?.schedule ?? offering.schedule}
              />
            </div>

            {/* Sidebar panel */}
            <aside style={{
              flex: '0 0 260px', borderLeft: '1px solid var(--line-soft)',
              padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 26,
            }}>
              {/* Instructors */}
              <section>
                <div style={SIDE_LABEL}>อาจารย์ผู้รับผิดชอบ</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {offering.instructors.map((ins, i) => (
                    <li key={i}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
                          {ins.name}
                          {ins.isMain && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-400)', marginLeft: 6 }}>หลัก</span>}
                        </div>
                        {ins.email && <div style={{ fontSize: 12, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.email}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Lab Boys */}
              <section>
                <div style={{ ...SIDE_LABEL, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Lab Boy</span>
                  <span style={{ color: 'var(--ink-500)' }}>{accepted.length} คน</span>
                </div>
                {applicantsLoading ? (
                  <div style={{ height: 60, background: 'var(--line-soft)', borderRadius: 8 }} />
                ) : accepted.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>ยังไม่มีนักศึกษาที่ได้รับเลือก</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {accepted.map((a) => (
                      <li key={a.id}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)' }}>{a.student_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-400)', fontVariantNumeric: 'tabular-nums' }}>{a.student_code}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'info' && (
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <InfoRow label="รหัสวิชา" value={offering.courseCode} />
              <InfoRow label="ชื่อวิชา" value={offering.courseTitle} />
              {courseDetail?.english_title && <InfoRow label="ชื่อวิชา (ภาษาอังกฤษ)" value={courseDetail.english_title} />}
              <InfoRow label="กลุ่มเรียน" value={`${offering.sectionNo}`} />
              <InfoRow label="หน่วยกิต" value={courseDetail?.credits ?? '—'} />
              <InfoRow label="ภาคเรียน" value={`${offering.semester}`} />
              <InfoRow label="ปีการศึกษา" value={`${offering.academicYear}`} />
              <InfoRow label="ตารางเรียน" value={formatSchedule(courseDetail?.schedule, { separator: ' / ' }) || '—'} />
              <InfoRow label="ห้องเรียน" value={offering.room ?? '—'} />
              <InfoRow label="สถานะแบบฟอร์ม" value={review.status === 'verified' ? 'ผ่านการตรวจสอบ' : review.status === 'returned' ? 'ส่งกลับแก้ไข' : 'รอตรวจสอบ'} />
              <InfoRow label="จำนวน Lab Boy (ที่ยืนยัน / ทั้งหมด)" value={`${offering.labboyAccepted} / ${offering.labboySlots} คน`} />
            </div>
            {review.note && (
              <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--amber-bg)', borderRadius: 8, border: '1px solid #FCD34D', fontSize: 13, color: 'var(--ink-700)' }}>
                <span style={{ fontWeight: 600, color: 'var(--amber)' }}>หมายเหตุ: </span>
                {review.note}
              </div>
            )}
          </div>
        )}

        {activeTab === 'students' && (
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>
                รายชื่อนักศึกษาที่ได้รับเลือกเป็น Lab Boy
              </div>
              <span className="badge badge-green">{accepted.length} คน</span>
            </div>
            <SelectedStudentsPanel applicants={applicants} loading={applicantsLoading} />
          </div>
        )}

        {activeTab === 'holidays' && (
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 4 }}>
                วันที่ไม่ต้องปฏิบัติงาน
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                วันหยุดและวันงดการสอนในภาคเรียนที่ {offering.semester} (ดึงจากการตั้งค่า)
              </div>
            </div>

            {calDatesLoading ? (
              <div style={{ height: 80, background: 'var(--line-soft)', borderRadius: 8 }} />
            ) : calDates.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 0',
                fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic',
              }}>
                ยังไม่มีการตั้งค่าวันหยุดสำหรับภาคเรียนนี้
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {workingDayHolidays.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--ink-400)',
                      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
                    }}>
                      วันที่ไม่นับเป็นวันทำงาน ({workingDayHolidays.length} วัน)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {workingDayHolidays.map((cd) => (
                        <CalendarDateRow key={cd.id} cd={cd} />
                      ))}
                    </div>
                  </div>
                )}

                {nonWorkingDayHolidays.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--ink-400)',
                      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
                    }}>
                      วันหยุด / วันพิเศษอื่นๆ ({nonWorkingDayHolidays.length} วัน)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {nonWorkingDayHolidays.map((cd) => (
                        <CalendarDateRow key={cd.id} cd={cd} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { date: review.submitted_at, event: 'ส่งแบบฟอร์มแจ้งความประสงค์', color: 'var(--primary)' },
                review.status !== 'pending' ? { date: review.updated_at, event: review.status === 'verified' ? 'ผ่านการตรวจสอบจากเจ้าหน้าที่' : 'ส่งกลับแก้ไข', color: review.status === 'verified' ? 'var(--green)' : 'var(--amber)' } : null,
                ...courseDocs.map((d) => ({
                  date: d.created_at,
                  event: `สร้างเอกสาร: ${d.name}`,
                  color: 'var(--blue)',
                })),
              ].filter(Boolean).sort((a, b) => new Date(b!.date).getTime() - new Date(a!.date).getTime()).map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev!.color, flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink-700)', fontWeight: 500 }}>{ev!.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                      {new Date(ev!.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CalendarDateRow({ cd }: { cd: CalendarDate }) {
  const color = DATE_TYPE_COLOR[cd.date_type] ?? 'var(--ink-400)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px', background: '#fff',
      border: '1px solid var(--line)', borderRadius: 8,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-900)' }}>
          {cd.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
          {formatDateTH(cd.date)}
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: color + '20', color,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {DATE_TYPE_LABELS[cd.date_type]}
      </span>
    </div>
  )
}

const SIDE_LABEL: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', marginBottom: 12,
}

function InfoRow({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink-900)' }}>{value ?? '—'}</div>
    </div>
  )
}
