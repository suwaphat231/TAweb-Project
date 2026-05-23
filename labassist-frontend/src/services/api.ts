import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import type {
  User, Course, Application, LoginCredentials, GoogleAuthPayload,
  CreateCoursePayload, ApplyPayload, ReviewPayload, BulkReviewPayload,
  AdminStats, CourseStatus,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'

export const api = axios.create({ baseURL: BASE_URL, withCredentials: false })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const authApi = {
  login: (creds: LoginCredentials) =>
    api.post<{ token: string; user: User }>('/auth/login', creds).then((r) => r.data),
  google: (payload: GoogleAuthPayload) =>
    api.post<{ token: string; user: User }>('/auth/google', payload).then((r) => r.data),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
}

// Courses (public)
export const courseApi = {
  list: (params?: { status?: CourseStatus; q?: string }) =>
    api.get<Course[]>('/courses', { params }).then((r) => r.data),
  get: (id: number) => api.get<Course>(`/courses/${id}`).then((r) => r.data),
}

// Student
export const studentApi = {
  dashboard: () => api.get<{ applications: Application[]; stats: Record<string, number> }>('/student/dashboard').then((r) => r.data),
  applications: () => api.get<Application[]>('/student/applications').then((r) => r.data),
  apply: (payload: ApplyPayload) => api.post<Application>('/student/applications', payload).then((r) => r.data),
  withdraw: (id: number) => api.put<Application>(`/student/applications/${id}/withdraw`).then((r) => r.data),
  profile: () => api.get<User>('/student/profile').then((r) => r.data),
  updateProfile: (data: Partial<User>) => api.put<User>('/student/profile', data).then((r) => r.data),
}

// Instructor
export const instructorApi = {
  courses: () => api.get<Course[]>('/instructor/courses').then((r) => r.data),
  createCourse: (payload: CreateCoursePayload) => api.post<Course>('/instructor/courses', payload).then((r) => r.data),
  updateCourse: (id: number, payload: Partial<CreateCoursePayload>) =>
    api.put<Course>(`/instructor/courses/${id}`, payload).then((r) => r.data),
  updateCourseStatus: (id: number, status: CourseStatus) =>
    api.put<Course>(`/instructor/courses/${id}/status`, { status }).then((r) => r.data),
  applicants: (courseId: number) =>
    api.get<Application[]>(`/instructor/courses/${courseId}/applicants`).then((r) => r.data),
  review: (id: number, payload: ReviewPayload) =>
    api.put<Application>(`/instructor/applications/${id}/review`, payload).then((r) => r.data),
  bulkReview: (payload: BulkReviewPayload) =>
    api.put<{ updated: number }>('/instructor/applications/bulk-review', payload).then((r) => r.data),
}

// Admin
export const adminApi = {
  stats: () => api.get<AdminStats>('/admin/stats').then((r) => r.data),
  users: () => api.get<User[]>('/admin/users').then((r) => r.data),
  createUser: (data: Partial<User> & { password?: string }) =>
    api.post<User>('/admin/users', data).then((r) => r.data),
  updateUserStatus: (id: number, is_active: boolean) =>
    api.put<User>(`/admin/users/${id}/status`, { is_active }).then((r) => r.data),
}

// Staff
export const staffApi = {
  documents: () => api.get('/staff/documents').then((r) => r.data),
}
