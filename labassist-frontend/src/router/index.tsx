import { lazy, Suspense } from 'react'
import { PageLoading } from '../components/ui/PageLoading'
import { PageLoadBoundary } from '../components/ui/PageLoadBoundary'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AppShell } from '../components/layout/AppShell'
const LoginPage = lazy(() => import('../pages/auth/LoginPage'))
const AuthCallback = lazy(() => import('../pages/auth/AuthCallback'))

const StudentHome = lazy(() => import('../pages/student/StudentHome'))
const StudentApply = lazy(() => import('../pages/student/StudentApply'))
const StudentStatus = lazy(() => import('../pages/student/StudentStatus'))
const StudentProfile = lazy(() => import('../pages/student/StudentProfile'))
const StudentGradeCheck = lazy(() => import('../pages/student/StudentGradeCheck'))

const InstructorHome = lazy(() => import('../pages/instructor/InstructorHome'))
const InstructorMyCourses = lazy(() => import('../pages/instructor/InstructorMyCourses'))
const InstructorAnnounce = lazy(() => import('../pages/instructor/InstructorAnnounce'))
const InstructorSelect = lazy(() => import('../pages/instructor/InstructorSelect'))
const InstructorProfile = lazy(() => import('../pages/instructor/InstructorProfile'))

const StaffHome = lazy(() => import('../pages/staff/StaffHome'))
const StaffReview = lazy(() => import('../pages/staff/StaffReview'))
const StaffDocs = lazy(() => import('../pages/staff/StaffDocs'))
const StaffProfile = lazy(() => import('../pages/staff/StaffProfile'))
const StaffCourseDetail = lazy(() => import('../pages/staff/StaffCourseDetail'))

const AdminOverview = lazy(() => import('../pages/admin/AdminOverview'))
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'))
const AdminCourses = lazy(() => import('../pages/admin/AdminCourses'))

import type { UserRole } from '../types'

const homeByRole: Record<UserRole, string> = {
  student:    '/student/home',
  instructor: '/instructor/home',
  staff:      '/staff/home',
  admin:      '/admin/overview',
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: UserRole[] }) {
  const { isAuthenticated, user, token } = useAuth()
  const location = useLocation()
  if (!isAuthenticated || !user || !token) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <AppShell key={user.id}><PageLoadBoundary key={location.pathname}><Suspense fallback={<PageLoading />}>{children}</Suspense></PageLoadBoundary></AppShell>
}

function HomeRedirect() {
  const { user, isAuthenticated } = useAuth()
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />
  return <Navigate to={homeByRole[user.role]} replace />
}

export function AppRouter() {
  return (
    <PageLoadBoundary>
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Student */}
      <Route path="/student" element={<Navigate to="/student/home" replace />} />
      <Route path="/student/home"    element={<ProtectedRoute roles={['student']}><StudentHome /></ProtectedRoute>} />
      <Route path="/student/apply"   element={<ProtectedRoute roles={['student']}><StudentApply /></ProtectedRoute>} />
      <Route path="/student/status"  element={<ProtectedRoute roles={['student']}><StudentStatus /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute roles={['student']}><StudentProfile /></ProtectedRoute>} />
      <Route path="/student/grade-check" element={<ProtectedRoute roles={['student']}><StudentGradeCheck /></ProtectedRoute>} />

      {/* Instructor */}
      <Route path="/instructor/home"     element={<ProtectedRoute roles={['instructor', 'admin']}><InstructorHome /></ProtectedRoute>} />
      <Route path="/instructor/courses"  element={<ProtectedRoute roles={['instructor', 'admin']}><InstructorMyCourses /></ProtectedRoute>} />
      <Route path="/instructor/announce" element={<ProtectedRoute roles={['instructor', 'admin']}><InstructorAnnounce /></ProtectedRoute>} />
      <Route path="/instructor/select"   element={<ProtectedRoute roles={['instructor', 'staff', 'admin']}><InstructorSelect /></ProtectedRoute>} />
      <Route path="/instructor/profile"  element={<ProtectedRoute roles={['instructor', 'admin']}><InstructorProfile /></ProtectedRoute>} />

      {/* Staff */}
      <Route path="/staff/home"    element={<ProtectedRoute roles={['staff', 'admin']}><StaffHome /></ProtectedRoute>} />
      <Route path="/staff/review"  element={<ProtectedRoute roles={['staff', 'admin']}><StaffReview /></ProtectedRoute>} />
      <Route path="/staff/docs"    element={<ProtectedRoute roles={['staff', 'admin']}><StaffDocs /></ProtectedRoute>} />
      <Route path="/staff/profile" element={<ProtectedRoute roles={['staff']}><StaffProfile /></ProtectedRoute>} />
      <Route path="/staff/course/:year/:semester/:code/:section" element={<ProtectedRoute roles={['staff', 'admin']}><StaffCourseDetail /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/overview" element={<ProtectedRoute roles={['admin']}><AdminOverview /></ProtectedRoute>} />
      <Route path="/admin/users"    element={<ProtectedRoute roles={['admin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/courses"  element={<ProtectedRoute roles={['admin']}><AdminCourses /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </PageLoadBoundary>
  )
}
