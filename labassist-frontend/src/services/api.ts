import axios, { CanceledError } from 'axios'
import { useAuthStore } from '../store/authStore'
import type {
  User, Course, Application, LoginCredentials, GoogleAuthPayload,
  CreateCoursePayload, ApplyPayload, ReviewPayload, BulkReviewPayload, BulkReviewResult,
  AdminStats, CourseStatus, Transcript, Notification,
  CreateUserPayload, UpdateUserPayload, ImportCoursesResponse, ImportCourseFields,
  FormReview, StaffDocument, CreateStaffDocumentPayload, TranscriptOCRResult, CoreCourse,
  WorkSession, ClassSchedule, ClassScheduleImageResult, TermSchedule, TermOption, ScheduleSlot, TermScheduleStatus,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'

export const api = axios.create({ baseURL: BASE_URL, withCredentials: false })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => {
    const authorization = res.config.headers.Authorization
    if (authorization && authorization !== `Bearer ${useAuthStore.getState().token}`) {
      throw new CanceledError('Session changed')
    }
    return res
  },
  (err) => {
    const authorization = err.config?.headers?.Authorization
    if (authorization && authorization !== `Bearer ${useAuthStore.getState().token}`) {
      return Promise.reject(new CanceledError('Session changed'))
    }
    if (err.response?.status === 401 && authorization) {
      useAuthStore.getState().logout()
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
    }
    // Blob responses (file downloads) never carry parsed JSON in
    // err.response.data, so the "no .data.error" check below would always
    // be true and swallow the real status code callers need (e.g. a 501
    // "not supported yet" vs. a genuine server error) — leave those alone.
    if (err.response?.status >= 500 && err.config?.responseType !== 'blob' && !err.response?.data?.error) {
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
  update: (id: number, data: Partial<CreateCoursePayload>) =>
    api.put<Course>(`/instructor/courses/${id}`, data).then((r) => r.data),
  updateStatus: (id: number, status: CourseStatus) =>
    api.put<Course>(`/instructor/courses/${id}/status`, { status }).then((r) => r.data),
  remove: (id: number) => api.delete(`/instructor/courses/${id}`).then(() => undefined),
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
    api.put<BulkReviewResult>('/instructor/applications/bulk-review', data).then((r) => r.data),
  uploadGradeProof: (applicationId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api
      .post<Application | { application: Application; grade_below_threshold: true; warning: string }>(
        `/student/applications/${applicationId}/grade-proof`,
        formData,
      )
      .then((r) => r.data)
  },
  // Grade-proof images need the Bearer token like any other request, so a
  // plain <img src> can't hit these directly — fetch as a blob through the
  // authenticated axios instance and let the caller build an object URL.
  gradeProof: (applicationId: number) =>
    api.get(`/student/applications/${applicationId}/grade-proof`, { responseType: 'blob' }).then((r) => r.data as Blob),
  instructorGradeProof: (applicationId: number) =>
    api.get(`/instructor/applications/${applicationId}/grade-proof`, { responseType: 'blob' }).then((r) => r.data as Blob),
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
  // Runs the file through OCR and matches the grades against the student's
  // core_courses catalog. The refreshed profile comes back on `.user`.
  uploadTranscript: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<TranscriptOCRResult>('/student/profile/transcript', formData).then((r) => r.data)
  },
}

export const transcriptAPI = {
  get: () => api.get<Transcript>('/student/transcript').then((r) => r.data),
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    // Let the browser set Content-Type itself so it includes the multipart boundary.
    return api.post<Transcript>('/student/transcript', formData).then((r) => r.data)
  },
  // The download route needs the Bearer token like any other request, so a
  // plain <a href> can't hit it directly — fetch the PDF as a blob through
  // the authenticated axios instance and let the caller open/save it.
  download: () => api.get('/student/transcript/file', { responseType: 'blob' }).then((r) => r.data as Blob),
}

export const adminAPI = {
  stats: () => api.get<AdminStats>('/admin/stats').then((r) => r.data),
  users: (params?: { limit?: number; offset?: number; role?: string; search?: string }) =>
    api.get<User[]>('/admin/users', { params }).then((r) => r.data),
  createUser: (data: CreateUserPayload) =>
    api.post<User>('/admin/users', data).then((r) => r.data),
  updateUser: (id: number, data: UpdateUserPayload) =>
    api.put<User>(`/admin/users/${id}`, data).then((r) => r.data),
  updateUserStatus: (id: number, is_active: boolean) =>
    api.put<User>(`/admin/users/${id}/status`, { is_active }).then((r) => r.data),
  userCourses: (id: number) => api.get<Course[]>(`/admin/users/${id}/courses`).then((r) => r.data),
  // For courses an instructor asked for, or that just aren't in the Excel
  // import — admin can add one directly and assign it to any instructor.
  createCourse: (data: CreateCoursePayload) =>
    api.post<Course[]>('/instructor/courses', data).then((r) => r.data),
  importCourses: (file: File, semester: string, academicYear: number) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('semester', semester)
    formData.append('academic_year', String(academicYear))
    // Let the browser set Content-Type itself so it includes the multipart boundary.
    return api.post<ImportCoursesResponse>('/admin/courses/import', formData).then((r) => r.data)
  },
  resolveImportConflicts: (updates: { course_id: number; fields: ImportCourseFields }[]) =>
    api.post<{ updated: number }>('/admin/courses/import/resolve', { updates }).then((r) => r.data),
  deleteCoursesByTerm: (semester: string, academicYear: number) =>
    api.delete<{ deleted: number }>('/admin/courses/term', { params: { semester, academic_year: academicYear } }).then((r) => r.data),
  // The department's required-course reference list (core_courses, used for
  // OCR transcript matching) — separate from the Excel-imported course
  // postings above. Backs the code-suggestion dropdown in "เพิ่มวิชาเอง".
  coreCourseCatalog: () => api.get<CoreCourse[]>('/admin/core-courses').then((r) => r.data),
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
  uploadAvatar: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return api.post<User>('/student/profile/avatar', body).then((r) => r.data)
  },
  dashboard: studentAPI.getDashboard,
  applications: applicationsAPI.getMyApplications,
  apply: applicationsAPI.apply,
  withdraw: applicationsAPI.withdraw,
  profile: studentAPI.getProfile,
  updateProfile: studentAPI.updateProfile,
  transcript: transcriptAPI.get,
  uploadTranscript: transcriptAPI.upload,
  // Stores the PDF (above) vs. runs OCR and matches core_courses (below).
  ocrTranscript: studentAPI.uploadTranscript,
  downloadTranscript: transcriptAPI.download,
  uploadGradeProof: applicationsAPI.uploadGradeProof,
  gradeProof: applicationsAPI.gradeProof,
  workSchedule: () => api.get<WorkSession[]>('/student/work-schedule').then((r) => r.data),
  // Image evidence upload — no OCR, no slot extraction.
  uploadScheduleImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<ClassScheduleImageResult>('/student/profile/class-schedule', formData).then((r) => r.data)
  },
  getClassSchedule: () => api.get<ClassSchedule>('/student/profile/class-schedule').then((r) => r.data),
  getClassScheduleImage: () =>
    api.get('/student/profile/class-schedule/file', { responseType: 'blob' }).then((r) => r.data as Blob),
  // Per-term manual schedule
  getTermSchedule: (semester: string, academicYear: number) =>
    api.get<TermSchedule>('/student/profile/term-schedule', { params: { semester, academic_year: academicYear } }).then((r) => r.data),
  saveTermSchedule: (data: { semester: string; academic_year: number; slots: ScheduleSlot[]; status: TermScheduleStatus }) =>
    api.put<TermSchedule>('/student/profile/term-schedule', data).then((r) => r.data),
  getAvailableTerms: () =>
    api.get<TermOption[]>('/student/available-terms').then((r) => r.data),
}
export const instructorApi = {
  courses: (params?: { has_lab?: boolean }) =>
    api.get<Course[]>('/instructor/courses', { params }).then((r) => r.data),
  courseCatalog: () => api.get<Course[]>('/instructor/course-catalog').then((r) => r.data),
  // Real sections (with their real Sec number + schedule, straight from the
  // admin's Excel import) available for a given code/semester/year — the
  // only source instructors pick sections from, so they never type one in.
  courseCatalogSections: (params: { code: string; semester: string; academic_year: number }) =>
    api.get<Course[]>('/instructor/course-catalog/sections', { params }).then((r) => r.data),
  // For a course of their own that never made it into the admin's Excel
  // import (or doesn't exist in the catalog at all) — the instructor posts
  // it directly instead of picking from SectionCatalogPicker.
  createCourse: (data: CreateCoursePayload) =>
    api.post<Course[]>('/instructor/courses', data).then((r) => r.data),
  updateCourse: coursesAPI.update,
  updateCourseStatus: coursesAPI.updateStatus,
  deleteCourse: coursesAPI.remove,
  applicants: applicationsAPI.getCourseApplicants,
  review: applicationsAPI.review,
  bulkReview: applicationsAPI.bulkReview,
  gradeProof: applicationsAPI.instructorGradeProof,
  notifyCourse: notificationApi.notifyCourse,
  // The instructor's own inbox (e.g. "a student just applied") — separate
  // from notifyCourse above, which is the instructor sending notifications
  // out to accepted students.
  notifications: () => api.get<Notification[]>('/instructor/notifications').then((r) => r.data),
  markNotificationRead: (id: number) => api.put(`/instructor/notifications/${id}/read`).then((r) => r.data),
  markAllNotificationsRead: () => api.put('/instructor/notifications/read-all').then((r) => r.data),
  profile: () => api.get<User>('/instructor/profile').then((r) => r.data),
  updateProfile: (data: { full_name?: string; email?: string; faculty?: string }) =>
    api.put<User>('/instructor/profile', data).then((r) => r.data),
}
export const staffApi = {
  profile: () => api.get<User>('/staff/profile').then((r) => r.data),
  updateProfile: (data: { full_name?: string; email?: string; faculty?: string }) =>
    api.put<User>('/staff/profile', data).then((r) => r.data),

  // Form reviews
  listReviews: (params?: { status?: string; q?: string }) =>
    api.get<FormReview[]>('/staff/reviews', { params }).then((r) => r.data),
  verifyForm: (courseId: number) =>
    api.put<FormReview>(`/staff/reviews/${courseId}/verify`).then((r) => r.data),
  returnForm: (courseId: number, note: string) =>
    api.put<FormReview>(`/staff/reviews/${courseId}/return`, { note }).then((r) => r.data),

  // Documents
  listDocuments: (params?: { type?: string; status?: string; q?: string }) =>
    api.get<StaffDocument[]>('/staff/documents', { params }).then((r) => r.data),
  createDocument: (data: CreateStaffDocumentPayload) =>
    api.post<StaffDocument>('/staff/documents', data).then((r) => r.data),
  updateDocumentStatus: (id: number, status: string) =>
    api.put<StaffDocument>(`/staff/documents/${id}/status`, { status }).then((r) => r.data),
  // The download route needs the Bearer token like any other request, so a
  // plain <a href> can't hit it directly — fetch the .docx as a blob through
  // the authenticated axios instance and let the caller trigger the save.
  downloadDocument: (id: number) =>
    api.get(`/staff/documents/${id}/file`, { responseType: 'blob' }).then((r) => r.data as Blob),
}
export const adminApi = adminAPI
