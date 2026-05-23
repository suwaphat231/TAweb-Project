export type UserRole = 'student' | 'instructor' | 'staff' | 'admin'
export type ApplicationStatus = 'accepted' | 'rejected' | 'withdrawn'
export type CourseStatus = 'open' | 'closing_soon' | 'closed' | 'draft'

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
}

export interface Course {
  id: number
  code: string
  title: string
  instructor_id: number
  instructor_name: string
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

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
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

export interface AdminStats {
  total_users: number
  total_students: number
  total_instructors: number
  total_courses: number
  open_courses: number
  total_applications: number
  accepted_applications: number
}
