import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AppShell } from '../components/layout/AppShell'
import LoginPage from '../pages/auth/LoginPage'
import AuthCallback from '../pages/auth/AuthCallback'
import StudentHome from '../pages/student/StudentHome'
import StudentApply from '../pages/student/StudentApply'
import StudentStatus from '../pages/student/StudentStatus'
import StudentProfile from '../pages/student/StudentProfile'
import InstructorAnnounce from '../pages/instructor/InstructorAnnounce'
import InstructorSelect from '../pages/instructor/InstructorSelect'
import StaffDocs from '../pages/staff/StaffDocs'
import AdminOverview from '../pages/admin/AdminOverview'
import type { UserRole } from '../types'

const homeByRole: Record<UserRole, string> = {
  student: '/student',
  instructor: '/instructor/announce',
  staff: '/staff/docs',
  admin: '/admin',
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

function HomeRedirect() {
  const { user, isAuthenticated } = useAuth()
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />
  return <Navigate to={homeByRole[user.role]} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Student */}
      <Route path="/student" element={<ProtectedRoute roles={['student']}><StudentHome /></ProtectedRoute>} />
      <Route path="/student/apply" element={<ProtectedRoute roles={['student']}><StudentApply /></ProtectedRoute>} />
      <Route path="/student/status" element={<ProtectedRoute roles={['student']}><StudentStatus /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute roles={['student']}><StudentProfile /></ProtectedRoute>} />

      {/* Instructor */}
      <Route path="/instructor/announce" element={<ProtectedRoute roles={['instructor', 'admin']}><InstructorAnnounce /></ProtectedRoute>} />
      <Route path="/instructor/select" element={<ProtectedRoute roles={['instructor', 'staff', 'admin']}><InstructorSelect /></ProtectedRoute>} />

      {/* Staff */}
      <Route path="/staff/docs" element={<ProtectedRoute roles={['staff', 'admin']}><StaffDocs /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminOverview /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
