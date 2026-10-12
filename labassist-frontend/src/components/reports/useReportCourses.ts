import { useQuery } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { groupCourseSections } from '../../utils/courseGrouping'
import type { CourseGroup } from '../../utils/courseGrouping'

// useReportCourses lists the courses an instructor may file Lab Boy reports
// for — only the ones linked from the official class list ("imported"),
// which is what the server checks — grouped so all sections of one course
// show as a single menu item. Admins may report on any course.
export function useReportCourses() {
  const { user } = useAuth()
  return useQuery<CourseGroup[]>({
    queryKey: ['report-courses', user?.role],
    queryFn: async () => {
      const courses = user?.role === 'admin'
        ? await instructorApi.courses()
        : (await instructorApi.myCourses()).filter((r) => r.source === 'imported').map((r) => r.course)
      return groupCourseSections(courses).sort((a, b) =>
        b.academic_year - a.academic_year || b.semester.localeCompare(a.semester) || a.code.localeCompare(b.code))
    },
  })
}
