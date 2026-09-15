import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { staffApi, applicationsAPI, coursesAPI } from '../../services/api'
import { buildCourseOffering, buildWorkflowItems } from './staffCourseUtils'
import { DocumentWorkflow } from './components/DocumentWorkflow'
import { SelectedStudentsPanel } from './components/SelectedStudentsPanel'

type Tab = 'documents' | 'info' | 'students' | 'history'

export default function StaffCourseDetail() {
  const { year, semester, code, section } = useParams<{
    year: string
    semester: string
    code: string
    section: string
  }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('documents')
  const [docRefreshKey, setDocRefreshKey] = useState(0)

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['staff-reviews'],
    queryFn: () => staffApi.listReviews(),
  })

  const { data: allDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['staff-documents', docRefreshKey],
    queryFn: () => staffApi.listDocuments(),
  })

  // Find the matching review
  const review = useMemo(() => reviews.find((r) =>
    String(r.academic_year) === year &&
    r.semester === semester &&
    r.course_code === code &&
    String(r.section) === section,
  ), [reviews, year, semester, code, section])

  const offering = useMemo(
    () => review ? buildCourseOffering(review, allDocs) : null,
    [review, allDocs],
  )

  const courseDocs = useMemo(
    () => allDocs.filter((d) => d.course_id === review?.course_id),
    [allDocs, review],
  )

  const workflowItems = useMemo(
    () => review ? buildWorkflowItems(courseDocs, review.status === 'verified') : [],
    [courseDocs, review],
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
        <button
          onClick={() => navigate('/staff/home')}
          style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600,
            borderRadius: 'var(--radius-btn)', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', border: 'none',
          }}
        >
          กลับหน้าหลัก
        </button>
      </div>
    )
  }

  const docProgress = offering.totalDocs > 0 ? (offering.completedDocs / offering.totalDocs) * 100 : 0
  const statusConfig = {
    waiting:     { label: 'รอจัดทำเอกสาร', color: 'var(--amber)',   bg: 'var(--amber-bg)',   border: '#FCD34D' },
    in_progress: { label: 'กำลังดำเนินการ', color: 'var(--primary)', bg: 'var(--primary-50)', border: 'var(--primary-100)' },
    completed:   { label: 'เสร็จสิ้นแล้ว',  color: 'var(--green)',   bg: 'var(--green-bg)',   border: '#86EFAC' },
  }[offering.docStatus]

  const TABS: { id: Tab; label: string }[] = [
    { id: 'documents', label: 'งานเอกสาร' },
    { id: 'info',      label: 'ข้อมูลรายวิชา' },
    { id: 'students',  label: 'รายชื่อนักศึกษา' },
    { id: 'history',   label: 'ประวัติการดำเนินงาน' },
  ]

  const accepted = applicants.filter((a) => a.status === 'accepted')

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/staff/home')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginBottom: 16, padding: '5px 12px', fontSize: 13,
          borderRadius: 'var(--radius-btn)', cursor: 'pointer',
          background: 'none', border: '1px solid var(--line)', color: 'var(--ink-600)',
        }}
        aria-label="กลับหน้าหลัก"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        กลับรายการวิชา
      </button>

      {/* Course header */}
      <div style={{
        background: '#fff', border: '1.5px solid var(--line)',
        borderRadius: 'var(--radius-card)', padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>
                {offering.courseCode}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '3px 10px',
                borderRadius: 'var(--radius-pill)', background: 'var(--primary-50)',
                color: 'var(--primary)', border: '1px solid var(--primary-100)',
              }}>
                กลุ่ม {offering.sectionNo}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                background: statusConfig.bg, color: statusConfig.color,
                border: `1px solid ${statusConfig.border}`,
              }}>
                {statusConfig.label}
              </span>
            </div>
            <div style={{ fontSize: 15, color: 'var(--ink-700)', marginBottom: 10 }}>
              {offering.courseTitle}
              {courseDetail?.english_title && (
                <span style={{ fontSize: 13, color: 'var(--ink-400)', marginLeft: 8 }}>
                  ({courseDetail.english_title})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12, color: 'var(--ink-500)' }}>
              <span>ภาคเรียน {offering.semester} / {offering.academicYear}</span>
              {courseDetail?.credits && <span>หน่วยกิต {courseDetail.credits}</span>}
              {(courseDetail?.schedule ?? offering.schedule) && (
                <span>{courseDetail?.schedule ?? offering.schedule}</span>
              )}
            </div>
          </div>

          {/* Progress */}
          <div style={{ minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>ความคืบหน้าเอกสาร</span>
              <span style={{ fontWeight: 700, color: 'var(--ink-700)' }}>
                {offering.completedDocs} / {offering.totalDocs}
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999, transition: 'width .4s',
                background: offering.docStatus === 'completed' ? 'var(--green)'
                  : offering.docStatus === 'in_progress' ? 'var(--primary)' : 'var(--amber)',
                width: `${docProgress}%`,
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 0,
        background: '#fff', border: '1.5px solid var(--line)',
        borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
        borderBottom: 'none', overflow: 'hidden',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            style={{
              flex: 1, padding: '12px 8px', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400,
              cursor: 'pointer', border: 'none',
              background: activeTab === tab.id ? 'var(--primary-50)' : 'transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--ink-600)',
              borderBottom: activeTab === tab.id ? `3px solid var(--primary)` : '3px solid transparent',
              transition: 'all .12s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.id === 'students' && accepted.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                borderRadius: 'var(--radius-pill)', background: 'var(--green-bg)', color: 'var(--green)',
              }}>
                {accepted.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        background: '#fff', border: '1.5px solid var(--line)',
        borderRadius: '0 0 var(--radius-card) var(--radius-card)',
        overflow: 'hidden',
      }}>
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {/* Workflow main area */}
            <div style={{ flex: '1 1 480px', padding: '20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 16 }}>
                ขั้นตอนการดำเนินงาน
              </div>
              <DocumentWorkflow
                items={workflowItems}
                courseId={offering.courseId}
                courseRef={courseRef}
                onDocumentCreated={() => setDocRefreshKey((k) => k + 1)}
              />
            </div>

            {/* Sidebar panel */}
            <div style={{
              flex: '0 0 280px', borderLeft: '1px solid var(--line-soft)',
              padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 20,
              background: 'var(--bg)',
            }}>
              {/* Instructors */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                  อาจารย์ผู้รับผิดชอบ
                </div>
                {offering.instructors.map((ins, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--ink-700)', padding: '6px 0', borderBottom: i < offering.instructors.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                    <span style={{ fontWeight: ins.isMain ? 600 : 400 }}>{ins.name}</span>
                    {ins.isMain && <span style={{ fontSize: 10, color: 'var(--primary)', marginLeft: 6 }}>หลัก</span>}
                    {ins.email && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{ins.email}</div>}
                  </div>
                ))}
              </div>

              {/* Schedule */}
              {(courseDetail?.schedule ?? offering.schedule) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                    ตารางเรียน
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.6 }}>
                    {courseDetail?.schedule ?? offering.schedule}
                  </div>
                </div>
              )}

              {/* Lab Boys */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                  Lab Boy ที่ได้รับเลือก ({accepted.length} คน)
                </div>
                {applicantsLoading ? (
                  <div style={{ height: 60, background: 'var(--line-soft)', borderRadius: 8 }} />
                ) : accepted.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}>
                    ยังไม่มีนักศึกษาที่ได้รับเลือก
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {accepted.map((a) => (
                      <div key={a.id} style={{
                        padding: '6px 10px', background: '#fff',
                        border: '1px solid var(--line)', borderRadius: 8, fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{a.student_name}</div>
                        <div style={{ color: 'var(--ink-400)', fontFamily: 'monospace' }}>{a.student_code}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
              <InfoRow label="ตารางเรียน" value={courseDetail?.schedule ?? '—'} />
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
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 10px',
                borderRadius: 'var(--radius-pill)', background: 'var(--green-bg)', color: 'var(--green)',
              }}>
                {accepted.length} คน
              </span>
            </div>
            <SelectedStudentsPanel applicants={applicants} loading={applicantsLoading} />
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
