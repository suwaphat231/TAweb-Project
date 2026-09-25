export type UserRole = 'student' | 'instructor' | 'staff' | 'admin'
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type CourseStatus = 'open' | 'closing_soon' | 'closed' | 'draft' | 'archived'

export interface User {
  id: number
  username: string
  full_name: string
  avatar_url?: string
  email: string
  role: UserRole
  student_id?: string
  google_sub?: string
  gpa?: number
  faculty?: string
  year?: number
  is_active: boolean
  created_at: string
  transcript_grades?: Record<string, string>
  transcript_status?: 'pass' | 'needs_review' | 'fail'
  transcript_message?: string
  transcript_confidence?: number
  transcript_updated_at?: string
}

/** One course from the core_courses catalog paired with the grade OCR read. */
export interface CourseGrade {
  code: string
  title: string
  /** Absent when found is false. */
  grade?: string
  found: boolean
}

/** One row from GET /admin/core-courses — the department's required-course
 *  reference list (used for OCR transcript matching), not an imported class
 *  posting. */
export interface CoreCourse {
  id: number
  program: 'IT' | 'CS'
  code: string
  title: string
  credits?: string
}

/** Result of POST /student/profile/transcript (OCR). */
export interface TranscriptOCRResult {
  status: 'pass' | 'needs_review' | 'fail'
  message: string
  confidence_score: number
  /** '' when the student's faculty matched neither curriculum. */
  program: 'IT' | 'CS' | ''
  courses: CourseGrade[]
  updated_at: string
  user: User
}

export interface Course {
  id: number
  code: string
  title: string
  english_title?: string
  credits?: string
  section?: number
  schedule?: string
  instructor_id: number
  instructor_name: string
  instructors_raw?: string
  applicant_count?: number
  semester: string
  academic_year: number
  labboy_slots: number
  labboy_accepted: number
  status: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
  // When true, applicants must attach an image of their grade instead of
  // just self-reporting it — set per posting by the instructor.
  require_grade_proof: boolean
  labboy_schedule_confirmed: boolean
  created_at: string
}

export interface LabBoyAssignment {
  course_id: number
  course_code: string
  course_title: string
  course_section: number
  course_schedule: string
  semester: string
  academic_year: number
}

export interface Notification {
  id: number
  user_id: number
  course_id?: number
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export interface Application {
  id: number
  student_id: number
  student_name: string
  student_code: string
  student_gpa: number
  student_email?: string
  student_faculty?: string
  student_year?: number
  course_id: number
  course_code: string
  course_title: string
  course_english_title?: string
  course_section?: number
  course_schedule?: string
  role_applied: 'labboy'
  status: ApplicationStatus
  grade?: string
  has_grade_proof?: boolean
  applied_at: string
  reviewed_at?: string
  reviewed_by_name?: string
  note?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface GoogleAuthPayload {
  credential: string
}

export interface ReviewPayload {
  status: 'accepted' | 'rejected'
  note?: string
}

export interface BulkReviewPayload {
  application_ids: number[]
  status: 'accepted' | 'rejected'
  note?: string
}

export interface BulkReviewResult {
  updated: number
  notified: number
  skipped_full: number
  skipped_no_proof: number
}

export interface CreateUserPayload {
  full_name: string
  role: UserRole
}

export interface UpdateUserPayload {
  full_name?: string
  role?: UserRole
}

export interface CreateCoursePayload {
  code: string
  title: string
  semester: string
  academic_year: number
  labboy_slots: number
  status?: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
  require_grade_proof?: boolean
  // Read-only, display-only — always sourced from the admin's Excel import,
  // never typed by the instructor. Only meaningful when editing one existing
  // section; opening new sections happens by picking imported rows instead.
  section?: number
  schedule?: string
  // Admin-only: which instructor this manually-added course belongs to
  // (e.g. one an instructor asked for that never made it into the Excel
  // import). Ignored by the backend for non-admin callers.
  instructor_id?: number
}

export interface ApplyPayload {
  course_id: number
  role_applied: 'labboy'
  grade?: string
}

export interface Transcript {
  file_name: string
  file_size: number
  uploaded_at: string
}

export interface ImportCourseResult {
  row: number
  code: string
  title: string
  instructor: string
}

export interface ImportSkippedRow {
  row: number
  reason: string
}

export interface ImportCourseFields {
  title: string
  english_title: string
  credits: string
  schedule: string
  capacity: number
  enrolled: number
  instructors_raw: string
}

export interface ImportDuplicate {
  row: number
  code: string
  section: number
  title: string
}

export interface ImportConflict {
  row: number
  course_id: number
  code: string
  section: number
  old: ImportCourseFields
  new: ImportCourseFields
  different: (keyof ImportCourseFields)[]
}

export interface ImportCoursesResponse {
  created: ImportCourseResult[]
  skipped: ImportSkippedRow[]
  duplicates: ImportDuplicate[]
  conflicts: ImportConflict[]
}

export type ReviewStatus = 'pending' | 'verified' | 'returned'
export type DocType = 'hiring_notice' | 'approval_memo' | 'payment_evidence' | 'payment_request' | 'work_report'
export type DocStatus = 'draft' | 'pending' | 'approved'

export interface FormReview {
  id: number
  course_id: number
  reviewer_id: number
  status: ReviewStatus
  note?: string
  updated_at: string
  course_code: string
  course_title: string
  section: number
  semester: string
  academic_year: number
  instructor_name: string
  labboy_slots: number
  labboy_accepted: number
  submitted_at: string
}

export interface RosterEntry {
  student_id: number
  student_name: string
  student_code: string
  hours: number
  amount: number
}

export interface DocumentPeriod {
  month: number
  year: number
}

export interface StaffDocument {
  id: number
  name: string
  type: DocType
  course_ref: string
  course_id?: number
  staff_id: number
  status: DocStatus
  note?: string
  period?: DocumentPeriod
  session_dates?: number[]
  hours_per_session?: number
  rate?: number
  roster?: RosterEntry[]
  total_amount?: number
  work_day?: string
  work_time_start?: string
  work_time_end?: string
  ref_number?: string
  prior_memo_ref?: string
  prior_memo_date?: string
  dept_head_name?: string
  dean_name?: string
  staff_officer_name?: string
  created_at: string
}

export interface CreateStaffDocumentPayload {
  type: DocType
  course_ref: string
  note?: string
  course_id?: number
  month?: number
  year?: number
  session_dates?: number[]
  hours_per_session?: number
  rate?: number
  excluded_student_ids?: number[]
  work_day?: string
  work_time_start?: string
  work_time_end?: string
  ref_number?: string
  prior_memo_ref?: string
  prior_memo_date?: string
  dept_head_name?: string
  dean_name?: string
  staff_officer_name?: string
}

export interface AdminStats {
  total_users: number
  total_students: number
  total_instructors: number
  total_courses: number
  open_courses: number
  total_applications: number
  accepted_applications: number
  pending_applications: number
}

// ─── Staff course management ──────────────────────────────────────────────────
export type CourseDocStatus = 'waiting' | 'in_progress' | 'completed'
export type DocStepStatus = 'not_reached' | 'waiting' | 'in_review' | 'created' | 'approved' | 'completed'

export interface Instructor {
  id?: number
  name: string
  email?: string
  isMain?: boolean
}

export interface SelectedLabBoy {
  studentId: number
  studentCode: string
  studentName: string
  studentEmail?: string
}

export interface CourseOffering {
  courseId: number
  academicYear: number
  semester: string
  courseCode: string
  sectionNo: number
  courseTitle: string
  credits?: string
  schedule?: string
  room?: string
  instructors: Instructor[]
  selectedLabBoys: SelectedLabBoy[]
  labboySlots: number
  labboyAccepted: number
  docStatus: CourseDocStatus
  completedDocs: number
  totalDocs: number
  reviewStatus: ReviewStatus
}

export interface DocumentWorkflowItem {
  step: number
  label: string
  docType: DocType | null
  status: DocStepStatus
  documentId?: number
  documentName?: string
  createdAt?: string
}

/** One time slot parsed from a class timetable image. */
export interface ScheduleSlot {
  day: string        // MON TUE WED THU FRI SAT SUN
  start_time: string // HH:MM
  end_time: string   // HH:MM
}

/** Stored class schedule image evidence for a student. */
export interface ClassSchedule {
  id: number
  user_id: number
  file_name: string
  /** Legacy OCR slots — may be present from earlier uploads, not confirmed. */
  slots: ScheduleSlot[]
  updated_at: string
}

/** Result of POST /student/profile/class-schedule (image evidence upload, no OCR). */
export interface ClassScheduleImageResult {
  id: number
  file_name: string
  updated_at: string
}

/** Status of a student's term schedule entry. */
export type TermScheduleStatus = 'unset' | 'set' | 'no_class'

/** A student's manually-entered class schedule for one academic term. */
export interface TermSchedule {
  id?: number
  user_id?: number
  semester: string
  academic_year: number
  slots: ScheduleSlot[]
  status: TermScheduleStatus
  updated_at?: string
}

/** A distinct (semester, academic_year) pair from the courses table. */
export interface TermOption {
  semester: string
  academic_year: number
}

/** One lab-assistant work session derived from a StaffDocument. */
export interface WorkSession {
  course_id: number
  course_code: string
  course_title: string
  course_section: number
  semester: string
  academic_year: number
  document_id: number
  document_type: DocType
  /** ISO date string YYYY-MM-DD (Common Era) */
  session_date: string
  work_day: string
  work_time_start: string
  work_time_end: string
  hours_per_session: number
}
