import type {
  FormReview, StaffDocument, CourseOffering,
  CourseDocStatus, DocumentWorkflowItem, DocStepStatus, DocType,
} from '../../types'

// Pre-work documents: created once per posting before work begins.
export const PRE_WORK_STEPS: { step: number; label: string; docType: DocType }[] = [
  { step: 1, label: 'แบบฟอร์มแจ้งความประสงค์ในการจ้างนักศึกษาช่วยสอนและช่วยคุมปฏิบัติการ', docType: 'hiring_notice' },
  { step: 2, label: 'บันทึกขออนุมัติจ้างนักศึกษาช่วยสอน', docType: 'approval_memo' },
  { step: 3, label: 'แบบแจ้งนักศึกษาช่วยคุมรายวิชาปฏิบัติการ', docType: 'lab_notice' },
]

// Monthly documents: created once per billing period.
export const MONTHLY_STEPS: { step: number; label: string; docType: DocType }[] = [
  { step: 4, label: 'รายงานผลการปฏิบัติงานนอกเวลาราชการ', docType: 'work_report' },
  { step: 5, label: 'บันทึกขออนุมัติเบิกจ่ายเงิน', docType: 'payment_request' },
]

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

function docStatusToStepStatus(doc: StaffDocument, reviewVerified: boolean): DocStepStatus {
  if (!reviewVerified) return 'not_reached'
  switch (doc.status) {
    case 'signed':     return 'signed'
    case 'awaiting_signature': return 'awaiting_signature'
    case 'approved':   return 'approved'
    case 'generated':  return 'created'
    case 'pending':    return 'in_review'
    case 'draft':      return 'created'
    default:           return 'created'
  }
}

export function buildWorkflowItems(courseDocs: StaffDocument[], reviewVerified: boolean): DocumentWorkflowItem[] {
  return WORKFLOW_STEPS.map(({ step, label, docType }) => {
    const doc = courseDocs
      .filter((d) => d.type === docType && d.status !== 'superseded' && d.status !== 'cancelled')
      .sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0]

    const status: DocStepStatus = doc
      ? docStatusToStepStatus(doc, reviewVerified)
      : reviewVerified ? 'waiting' : 'not_reached'

    return {
      step,
      label,
      docType,
      status,
      documentId: doc?.id,
      documentName: doc?.name,
      createdAt: doc?.created_at,
    }
  })
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
