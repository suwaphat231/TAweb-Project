import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Application, Course, CourseRelation } from '../../types'
import { ToastContext } from '../../hooks/useToast'
import InstructorMyCourses from './InstructorMyCourses'

// No DOM test environment: render on the server with the query cache filled
// in, so this checks the initial (default Sec 1) markup. Switching tabs is
// covered by the selectedSectionOf/tabTargetIndex tests in myCourseGroups.
const CODE = '517122-165, -2560'

function rel(id: number, p: Partial<Course>): CourseRelation {
  return {
    id, source: 'imported', created_at: '',
    course: { id, code: CODE, title: 'COMPUTER PROGRAMMING SKILL II', semester: '2', academic_year: 2568, section: 1, labboy_slots: 1, labboy_accepted: 1, ...p } as Course,
  }
}

function accepted(id: number, name: string): Application {
  return { id, student_id: id, student_name: name, student_code: `6501${id}`, status: 'accepted' } as Application
}

function render(rels: CourseRelation[], applicants: Record<number, Application[]>) {
  const qc = new QueryClient()
  qc.setQueryData(['instructor-my-courses'], rels)
  qc.setQueryData(['instructor-course-edit-requests'], [])
  for (const r of rels) qc.setQueryData(['course-applicants', r.course.id], applicants[r.course.id] ?? [])
  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastContext.Provider value={{ show: () => {} }}>
          <InstructorMyCourses />
        </ToastContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const tabs = (html: string) => Array.from(html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g), (m) => m[0])

describe('InstructorMyCourses Section tabs', () => {
  const twoSecs = () => render(
    [rel(1, { section: 1, schedule: 'Tu 09:00-12:00 1227' }), rel(2, { section: 2, schedule: 'Th 13:00-16:00 1301' })],
    { 1: [accepted(11, 'สมชาย หนึ่ง')], 2: [accepted(22, 'สมหญิง สอง')] },
  )

  it('shows Sec tabs from the data and no curriculum buttons', () => {
    const html = twoSecs()
    const t = tabs(html)
    expect(t.map((b) => b.replace(/<[^>]+>/g, ''))).toEqual(['Sec 1', 'Sec 2'])
    expect(html).not.toMatch(/role="tab"[^>]*>-\s*(165|2560)</)
    expect(html).not.toContain('หลักสูตร</span>')
    expect(html).toContain('ข้อมูลตารางเรียนและ Lab Boy ตาม Section ที่เลือก')
  })

  it('selects Sec 1 by default with aria state and roving tabindex', () => {
    const [one, two] = tabs(twoSecs())
    expect(one).toContain('aria-selected="true"')
    expect(one).toContain('tabindex="0"')
    expect(two).toContain('aria-selected="false"')
    expect(two).toContain('tabindex="-1"')
  })

  it('shows only the selected Section schedule and Lab Boys', () => {
    const html = twoSecs()
    expect(html).toContain('สมชาย หนึ่ง')
    expect(html).toContain('09:00–12:00')
    expect(html).not.toContain('สมหญิง สอง')
    expect(html).not.toContain('13:00–16:00')
  })

  it('keeps the combined course code whole', () => {
    const html = twoSecs()
    expect(html).toContain(CODE)
    expect(html).not.toMatch(/517122-165(?!, -2560)/)
    expect(html).not.toMatch(/>517122-2560</)
  })

  it('shows a single Sec tab when the course has one Section', () => {
    const t = tabs(render([rel(1, { section: 1, schedule: 'Tu 09:00-12:00 1227' })], {}))
    expect(t).toHaveLength(1)
    expect(t[0]).toContain('>Sec 1<')
  })
})
