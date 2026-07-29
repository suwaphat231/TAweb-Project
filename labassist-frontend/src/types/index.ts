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
  group_note?: string
  credits?: string
  schedule?: string
  enrolled?: number
  co_instructors?: string
  has_lab: boolean
  instructor_id: number
  instructor_name: string
  applicant_count?: number
  semester: string
  academic_year: number
  ta_slots: number
  labboy_slots: number
  ta_accepted: number
  labboy_accepted: number
  status: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
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
  role_applied: 'ta' | 'labboy'
  status: ApplicationStatus
  motivation?: string
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

export interface CreateCoursePayload {
  code: string
  title: string
  semester: string
  academic_year: number
  ta_slots: number
  labboy_slots: number
  status?: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
}

export interface ApplyPayload {
  course_id: number
  role_applied: 'ta' | 'labboy'
  motivation?: string
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
