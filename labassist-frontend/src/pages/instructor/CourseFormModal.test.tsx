import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Course, CreateCoursePayload } from '../../types'
import { ToastContext } from '../../hooks/useToast'
import { CourseFormModal } from './CourseFormModal'
import { COURSE_FORM_EMPTY } from './_courseFormShared'

// The project has no DOM test environment, so these render the modal to HTML
// on the server and check its structure (effects do not run).
const CODE = '517433-165, -160'

function course(p: Partial<Course>): Course {
  return { id: 1, code: CODE, title: 'Software Engineering', semester: '2', academic_year: 2568, section: 1, ...p } as Course
}

function render(opts: { isOpen?: boolean; editId?: number | null; form?: Partial<CreateCoursePayload>; sections?: Course[] } = {}) {
  const form: CreateCoursePayload = { ...COURSE_FORM_EMPTY, code: CODE, title: 'Software Engineering', semester: '2', academic_year: 2568, ...opts.form }
  const qc = new QueryClient()
  qc.setQueryData(['instructor-course-catalog'], [course({})])
  qc.setQueryData(['course-catalog-sections', form.code, form.semester, form.academic_year], opts.sections ?? [])
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ show: () => {} }}>
      <CourseFormModal
        isOpen={opts.isOpen ?? true}
        onClose={() => {}}
        editId={opts.editId ?? null}
        form={form}
        setForm={() => {}}
        minGrade="B"
        setMinGrade={() => {}}
        sectionIds={[]}
        setSectionIds={() => {}}
        onSubmit={() => {}}
        loading={false}
      />
      </ToastContext.Provider>
    </QueryClientProvider>,
  )
}

describe('CourseFormModal layout', () => {
  it('renders nothing while closed', () => {
    expect(render({ isOpen: false })).toBe('')
  })

  it('shows the three sections in order', () => {
    const html = render()
    const a = html.indexOf('ข้อมูลวิชา')
    const b = html.indexOf('ตอนเรียนและตารางสอน')
    const c = html.indexOf('เงื่อนไขการสมัคร')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('keeps a combined curriculum code whole and shows the one-line hint', () => {
    const html = render()
    expect(html).toContain(`value="${CODE}"`)
    expect(html).not.toContain('value="517433"')
    expect(html).toContain('รองรับรหัสหลายหลักสูตร เช่น 517433-165, -160')
  })

  it('pairs ภาคเรียน/ปีการศึกษา and Slots/วันปิดรับสมัคร in one row each', () => {
    const rows = render().split('class="course-form-row"').slice(1)
    expect(rows.some((r) => r.indexOf('ภาคเรียน') > -1 && r.indexOf('ภาคเรียน') < r.indexOf('ปีการศึกษา'))).toBe(true)
    expect(rows.some((r) => r.indexOf('Lab Boy Slots') > -1 && r.indexOf('Lab Boy Slots') < r.indexOf('วันปิดรับสมัคร'))).toBe(true)
  })

  it('keeps every condition field and the short grade help', () => {
    const html = render()
    for (const text of ['Lab Boy Slots', 'วันปิดรับสมัคร *', 'เกรดเฉลี่ยขั้นต่ำ *', 'ต้องแนบรูปภาพเกรดยืนยัน', 'ผู้สมัครต้องมีเกรดเฉลี่ยไม่ต่ำกว่าเกณฑ์ที่กำหนด']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('type="date"')
  })

  it('lists imported sections with Sec and time, and warns when there are none', () => {
    const html = render({ sections: [course({ id: 7, section: 2, status: 'draft', schedule: 'Tu 13:00-16:00 1227' })] })
    expect(html).toContain('Sec 2')
    expect(html).toContain('type="checkbox"')
    expect(render({ sections: [] })).toContain('ไม่พบ section ของวิชานี้')
  })

  it('locks the code when editing an existing posting', () => {
    const html = render({ editId: 5, form: { section: 1, schedule: 'Tu 13:00-16:00 1227' } })
    expect(html).toMatch(new RegExp(`value="${CODE}"[^>]*disabled|disabled[^>]*value="${CODE}"`))
    expect(html).toContain('แก้ไขวิชา')
  })
})
