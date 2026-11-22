import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Application, Course } from '../../types'
import { groupCourseSections } from '../../utils/courseGrouping'
import { ToastContext } from '../../hooks/useToast'
import InstructorHome from './InstructorHome'

// No DOM test environment: render on the server with the query cache filled.
// <Navigate> fires in an effect, so a redirect shows up as empty markup.
const CODE = '517433-165, -160'
const course: Course = {
  id: 18, code: CODE, title: 'Software Engineering', semester: '1', academic_year: 2569, section: 1,
  status: 'open', labboy_slots: 2, labboy_accepted: 0, schedule: 'Tu 13:00-16:00 1227',
  requirements: 'เกรดขั้นต่ำ: B', deadline: '2099-01-01',
} as Course
const pending = { id: 1, course_id: 18, student_id: 5, student_name: 'สมชาย', status: 'pending', applied_at: '2026-11-01' } as Application
const KEY = groupCourseSections([course])[0].key

function render(entry: string | { pathname: string; state: unknown }) {
  const qc = new QueryClient()
  qc.setQueryData(['instructor-courses'], [course])
  qc.setQueryData(['course-applicants', 18], [pending])
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={qc}>
        <ToastContext.Provider value={{ show: () => {} }}>
          <InstructorHome />
        </ToastContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('InstructorHome without the posting detail page', () => {
  it('redirects an old ?posting= link instead of rendering a detail page', () => {
    const html = render(`/instructor/home?posting=${encodeURIComponent(KEY)}`)
    expect(html).toBe('')
  })

  it('shows a notice naming the posting after the redirect', () => {
    const html = render({ pathname: '/instructor/home', state: { removedPostingKey: KEY } })
    expect(html).toContain('หน้ารายละเอียดประกาศถูกนำออกจากระบบแล้ว')
    expect(html).toContain(`<strong>${CODE}</strong>`)
    expect(html).toContain('แสดงประกาศนี้')
  })

  it('says the posting is gone when the old key no longer matches', () => {
    const html = render({ pathname: '/instructor/home', state: { removedPostingKey: 'nope' } })
    expect(html).toContain('ไม่พบประกาศจากลิงก์เดิม')
  })

  it('renders the list with no way into a detail page', () => {
    const html = render('/instructor/home')
    expect(html).toContain('ประกาศของฉัน')
    expect(html).toContain(CODE)
    expect(html).not.toContain('posting=')
    expect(html).not.toContain('ดูรายละเอียดประกาศ')
    expect(html).not.toContain('รายชื่อผู้สมัคร')
    expect(html).not.toContain('title-link')
    expect(html).not.toContain('หน้ารายละเอียดประกาศถูกนำออก')
  })

  it('keeps the row actions and sends the task to the select page', () => {
    const html = render('/instructor/home')
    expect(html).toContain('href="/instructor/select?course=18"')
    for (const label of ['ดูผู้สมัคร', 'แก้ไขประกาศ', 'ปิดรับสมัคร', 'ลบประกาศ', 'คัดเลือกผู้สมัคร']) expect(html).toContain(label)
  })
})
