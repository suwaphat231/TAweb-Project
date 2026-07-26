import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import type {
  User, Course, Application, LoginCredentials, GoogleAuthPayload,
  CreateCoursePayload, ApplyPayload, ReviewPayload, BulkReviewPayload,
  AdminStats, CourseStatus, Notification,
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
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    if (err.response?.status >= 500) {
      return Promise.reject(new Error('เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง'))
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: (creds: LoginCredentials) =>
    api.post<{ token: string; user: User }>('/auth/login', creds).then((r) => r.data),
  google: (payload: GoogleAuthPayload) =>
    api.post<{ token: string; user: User; is_new_user: boolean }>('/auth/google', payload).then((r) => r.data),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
}

export const coursesAPI = {
  getAll: (params?: { status?: CourseStatus; q?: string; has_lab?: boolean }) =>
    api.get<Course[]>('/courses', { params }).then((r) => r.data),
  getById: (id: number) => api.get<Course>(`/courses/${id}`).then((r) => r.data),
  create: (data: CreateCoursePayload) => api.post<Course>('/instructor/courses', data).then((r) => r.data),
  update: (id: number, data: Partial<CreateCoursePayload>) =>
    api.put<Course>(`/instructor/courses/${id}`, data).then((r) => r.data),
  updateStatus: (id: number, status: CourseStatus) =>
    api.put<Course>(`/instructor/courses/${id}/status`, { status }).then((r) => r.data),
}

export const applicationsAPI = {
  getMyApplications: () => api.get<Application[]>('/student/applications').then((r) => r.data),
  apply: (data: ApplyPayload) => api.post<Application>('/student/applications', data).then((r) => r.data),
  withdraw: (id: number) => api.put<Application>(`/student/applications/${id}/withdraw`).then((r) => r.data),
  getCourseApplicants: (courseId: number) =>
    api.get<Application[]>(`/instructor/courses/${courseId}/applicants`).then((r) => r.data),
  review: (id: number, data: ReviewPayload) =>
    api.put<Application>(`/instructor/applications/${id}/review`, data).then((r) => r.data),
  bulkReview: (data: BulkReviewPayload) =>
    api.put<{ updated: number }>('/instructor/applications/bulk-review', data).then((r) => r.data),
}

export const studentAPI = {
  getDashboard: () =>
    api.get<{
      recent_applications: Application[]
      recent_courses: Course[]
      stats: { open_courses: number; applied: number }
    }>('/student/dashboard').then((r) => r.data),
  getProfile: () => api.get<User>('/student/profile').then((r) => r.data),
  updateProfile: (data: Partial<User>) => api.put<User>('/student/profile', data).then((r) => r.data),
}

export const adminAPI = {
  stats: () => api.get<AdminStats>('/admin/stats').then((r) => r.data),
  users: (params?: { limit?: number; offset?: number; role?: string; search?: string }) =>
    api.get<User[]>('/admin/users', { params }).then((r) => r.data),
  createUser: (data: Partial<User> & { password?: string }) =>
    api.post<User>('/admin/users', data).then((r) => r.data),
  updateUserStatus: (id: number, is_active: boolean) =>
    api.put<User>(`/admin/users/${id}/status`, { is_active }).then((r) => r.data),
}

export const notificationApi = {
  list: () => api.get<Notification[]>('/student/notifications').then((r) => r.data),
  markRead: (id: number) => api.put(`/student/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/student/notifications/read-all').then((r) => r.data),
  notifyCourse: (courseId: number) =>
    api.post<{ sent: number; message?: string }>(`/instructor/courses/${courseId}/notify`).then((r) => r.data),
}

export const courseApi = { list: coursesAPI.getAll, get: coursesAPI.getById }
export const studentApi = {
  dashboard: studentAPI.getDashboard,
  applications: applicationsAPI.getMyApplications,
  apply: applicationsAPI.apply,
  withdraw: applicationsAPI.withdraw,
  profile: studentAPI.getProfile,
  updateProfile: studentAPI.updateProfile,
}
export const instructorApi = {
  courses: (params?: { has_lab?: boolean }) =>
    api.get<Course[]>('/instructor/courses', { params }).then((r) => r.data),
  createCourse: coursesAPI.create,
  updateCourse: coursesAPI.update,
  updateCourseStatus: coursesAPI.updateStatus,
  applicants: applicationsAPI.getCourseApplicants,
  review: applicationsAPI.review,
  bulkReview: applicationsAPI.bulkReview,
  notifyCourse: notificationApi.notifyCourse,
}
export const adminApi = adminAPI
