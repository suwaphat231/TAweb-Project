import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { instructorApi } from '../services/api'
import { groupCourseSections } from '../utils/courseGrouping'
import { deadlineInfo, type DeadlineInfo } from '../utils/postingDeadline'

export interface PostingTask {
  /** Posting key (same as the grouping key used on the instructor home page). */
  key: string
  code: string
  title: string
  /** Applicants still waiting for a decision. */
  pending: number
  /** Set only when the deadline is near or already past while still recruiting. */
  deadline: DeadlineInfo | null
}

/**
 * Work the instructor still has to do: postings about to close and postings
 * with applicants nobody has decided on yet. Shares query keys with the home
 * page, so using it in the sidebar costs no extra requests.
 */
export function useInstructorTasks(enabled = true) {
  const { data: courses = [] } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.courses(),
    enabled,
  })
  const applicantQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-applicants', c.id],
      queryFn: () => instructorApi.applicants(c.id),
      enabled,
    })),
  })

  return useMemo(() => {
    const pendingById = new Map<number, number>()
    courses.forEach((c, i) => {
      pendingById.set(c.id, (applicantQueries[i]?.data ?? []).filter((a) => a.status === 'pending').length)
    })
    const live = courses.filter((c) => c.status !== 'archived' && c.status !== 'draft')
    const tasks: PostingTask[] = groupCourseSections(live).flatMap((g) => {
      const pending = g.sections.reduce((n, s) => n + (pendingById.get(s.id) ?? 0), 0)
      const earliest = g.sections.map((s) => s.deadline).filter((d): d is string => !!d).sort()[0]
      const info = deadlineInfo(earliest, g.status)
      const deadline = info && (info.tone === 'soon' || info.tone === 'overdue') ? info : null
      if (!pending && !deadline) return []
      return [{ key: g.key, code: g.code, title: g.title, pending, deadline }]
    })
    return { tasks, count: tasks.length }
  }, [courses, applicantQueries])
}
