import type {
  FormReview, StaffDocument, CourseOffering,
  CourseDocStatus, DocType, DocStatus,
} from '../../types'

// Pre-work documents: created once per posting before work begins. The
// server (Staff/doc_workflow.go) owns the real step list and its rules; this
// copy only drives the progress shown on the staff home course cards.
export const PRE_WORK_STEPS: { step: number; label: string; docType: DocType }[] = [
  { step: 1, label: 'แบบฟอร์มแจ้งความประสงค์ในการจ้างนักศึกษาช่วยสอนและช่วยคุมปฏิบัติการ', docType: 'hiring_notice' },
  { step: 2, label: 'บันทึกข้อความ ขออนุมัติจ้างนักศึกษาปฏิบัติงาน', docType: 'approval_memo' },
  { step: 3, label: 'บันทึกข้อความ ขออนุมัติเบิกจ่ายเงินค่าตอบแทนนักศึกษาปฏิบัติงาน', docType: 'payment_request' },
  { step: 4, label: 'รายงานผลการปฏิบัติงานนอกเวลาราชการ', docType: 'work_report' },
]

// Monthly documents: created once per billing period.
export const MONTHLY_STEPS: { step: number; label: string; docType: DocType }[] = []

export interface DocProgress {
  phase: 'form_pending' | 'in_progress' | 'done'
  signed: number
  total: number
  /** The step being worked on: the first one not signed yet. */
  current: (typeof PRE_WORK_STEPS)[number] | null
  currentStatus: DocStatus | 'not_created'
}

/**
 * How far one course offering's documents have got. Steps are finished in
 * order (the server only opens a step once the previous one is signed), so
 * progress is the first step without a signed document.
 */
export function docProgress(review: FormReview, allDocs: StaffDocument[]): DocProgress {
  const total = PRE_WORK_STEPS.length
  if (review.status !== 'verified') {
    return { phase: 'form_pending', signed: 0, total, current: null, currentStatus: 'not_created' }
  }
  const active = allDocs.filter((d) =>
    (review.posting_id ? d.posting_id === review.posting_id : d.course_id === review.course_id) &&
    d.status !== 'cancelled' && d.status !== 'superseded',
  )
  let signed = 0
  for (const step of PRE_WORK_STEPS) {
    const d = active.find((x) => x.type === step.docType)
    if (d?.status !== 'signed') {
      return { phase: 'in_progress', signed, total, current: step, currentStatus: d?.status ?? 'not_created' }
    }
    signed++
  }
  return { phase: 'done', signed, total, current: null, currentStatus: 'signed' }
}

export const WORKFLOW_STEPS = [...PRE_WORK_STEPS, ...MONTHLY_STEPS]
export const TOTAL_DOC_STEPS = WORKFLOW_STEPS.length

const PRE_WORK_DOC_TYPES = new Set<DocType>(PRE_WORK_STEPS.map((s) => s.docType))

/** A doc counts as "done" once it has been signed (or at minimum approved). */
function isDocDone(doc: StaffDocument): boolean {
  return doc.status === 'signed' || doc.status === 'approved'
}

export function buildCourseOffering(review: FormReview, allDocs: StaffDocument[]): CourseOffering {
  const courseDocs = allDocs.filter((d) =>
    review.posting_id ? d.posting_id === review.posting_id : d.course_id === review.course_id,
  )

  const preWorkDocs = courseDocs.filter((d) => PRE_WORK_DOC_TYPES.has(d.type))
  const preWorkCompleted = preWorkDocs.filter(isDocDone).length
  const preWorkTotal = PRE_WORK_STEPS.length

  const completedDocs = courseDocs.filter(isDocDone).length

  let docStatus: CourseDocStatus = 'waiting'
  if (review.status === 'verified') {
    if (preWorkCompleted >= preWorkTotal) docStatus = 'completed'
    else if (courseDocs.length > 0) docStatus = 'in_progress'
  }

  return {
    courseId: review.course_id,
    academicYear: review.academic_year,
    semester: review.semester,
    courseCode: review.course_code,
    sectionNo: review.section,
    schedule: review.schedule,
    courseTitle: review.course_title,
    instructors: [{ name: review.instructor_name, isMain: true }],
    selectedLabBoys: [],
    labboySlots: review.labboy_slots,
    labboyAccepted: review.labboy_accepted,
    docStatus,
    preWorkCompleted,
    preWorkTotal,
    completedDocs,
    totalDocs: TOTAL_DOC_STEPS,
    reviewStatus: review.status,
  }
}

export function getCourseOfferingKey(
  academicYear: number,
  semester: string,
  courseCode: string,
  sectionNo: number,
): string {
  return `${academicYear}-${semester}-${courseCode}-${sectionNo}`
}

export function applyFilters(
  offerings: CourseOffering[],
  search: string,
  instructor: string,
  semester: string,
  academicYear: string,
  docStatus: string,
): CourseOffering[] {
  const q = search.toLowerCase().trim()
  return offerings.filter((o) => {
    if (q && !o.courseCode.toLowerCase().includes(q) &&
        !o.courseTitle.toLowerCase().includes(q) &&
        !o.instructors.some((i) => i.name.toLowerCase().includes(q))) return false
    if (instructor && !o.instructors.some((i) => i.name === instructor)) return false
    if (semester && o.semester !== semester) return false
    if (academicYear && String(o.academicYear) !== academicYear) return false
    if (docStatus && o.docStatus !== docStatus) return false
    return true
  })
}
