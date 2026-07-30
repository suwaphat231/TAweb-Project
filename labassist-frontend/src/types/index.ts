export type UserRole = 'student' | 'instructor' | 'staff' | 'admin'
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type CourseStatus = 'open' | 'closing_soon' | 'closed' | 'draft' | 'archived'

export interface User {
  id: number
  username: string
  full_name: string
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
  created_at: string
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

export interface ImportCoursesResponse {
  created: ImportCourseResult[]
  skipped: ImportSkippedRow[]
}

export type ReviewStatus = 'pending' | 'verified' | 'returned'
export type DocType = 'approval_memo' | 'payment_evidence' | 'payment_request'
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

export interface StaffDocument {
  id: number
  name: string
  type: DocType
  course_ref: string
  staff_id: number
  status: DocStatus
  note?: string
  created_at: string
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
