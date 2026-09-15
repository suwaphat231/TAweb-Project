import type {
  FormReview, StaffDocument, CourseOffering,
  CourseDocStatus, DocumentWorkflowItem, DocStepStatus, DocType,
} from '../../types'

export const WORKFLOW_STEPS: { step: number; label: string; docType: DocType | null }[] = [
  { step: 1, label: 'แบบฟอร์มแจ้งความประสงค์ในการจ้างนักศึกษาช่วยสอนและช่วยคุมปฏิบัติการ', docType: 'hiring_notice' },
  { step: 2, label: 'บันทึกขออนุมัติจ้างนักศึกษาช่วยสอน', docType: 'approval_memo' },
  // TODO: Backend needs new doc type 'lab_notice' — endpoint: POST /staff/documents with type 'lab_notice'
  { step: 3, label: 'แบบแจ้งนักศึกษาช่วยคุมรายวิชาปฏิบัติการ', docType: null },
  { step: 4, label: 'รายงานผลการปฏิบัติงานนอกเวลาราชการ', docType: 'work_report' },
  { step: 5, label: 'บันทึกขออนุมัติเบิกจ่ายเงิน', docType: 'payment_request' },
]

export const TOTAL_DOC_STEPS = WORKFLOW_STEPS.length

export function buildCourseOffering(review: FormReview, allDocs: StaffDocument[]): CourseOffering {
  const courseDocs = allDocs.filter((d) => d.course_id === review.course_id)
  const approvedDocs = courseDocs.filter((d) => d.status === 'approved').length

  let docStatus: CourseDocStatus = 'waiting'
  if (review.status === 'verified') {
    if (approvedDocs >= TOTAL_DOC_STEPS) docStatus = 'completed'
    else if (courseDocs.length > 0) docStatus = 'in_progress'
    // else stays 'waiting' — verified but no docs created yet
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
    completedDocs: approvedDocs,
    totalDocs: TOTAL_DOC_STEPS,
    reviewStatus: review.status,
  }
}

export function buildWorkflowItems(courseDocs: StaffDocument[], reviewVerified: boolean): DocumentWorkflowItem[] {
  return WORKFLOW_STEPS.map(({ step, label, docType }) => {
    if (docType === null) {
      return { step, label, docType, status: 'not_reached' as DocStepStatus }
    }
    const doc = courseDocs.find((d) => d.type === docType)
    let status: DocStepStatus = reviewVerified ? 'waiting' : 'not_reached'
    if (doc) {
      if (doc.status === 'approved') status = 'completed'
      else if (doc.status === 'pending') status = 'in_review'
      else status = 'created'
    }
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
