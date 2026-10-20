import { describe, expect, it } from 'vitest'
import type { DocStatus, DocType, FormReview, StaffDocument } from '../../types'
import { docProgress } from './staffCourseUtils'

const review = { course_id: 7, posting_id: 70, status: 'verified' } as FormReview

let nextId = 1
function doc(type: DocType, status: DocStatus, postingId = 70): StaffDocument {
  return { id: nextId++, posting_id: postingId, course_id: 7, type, status, name: type } as StaffDocument
}

describe('docProgress', () => {
  it('waits for the form check before any document', () => {
    expect(docProgress({ ...review, status: 'pending' }, []).phase).toBe('form_pending')
  })

  it('starts at step 1 with nothing created', () => {
    const p = docProgress(review, [])
    expect(p).toMatchObject({ phase: 'in_progress', signed: 0, total: 4, current: { step: 1, docType: 'hiring_notice' }, currentStatus: 'not_created' })
  })

  it('the current step is the first document not signed yet', () => {
    const p = docProgress(review, [doc('hiring_notice', 'signed'), doc('approval_memo', 'awaiting_signature')])
    expect(p).toMatchObject({ signed: 1, current: { step: 2 }, currentStatus: 'awaiting_signature' })
  })

  it('ignores cancelled and superseded versions and other offerings', () => {
    const p = docProgress(review, [
      doc('hiring_notice', 'superseded'), doc('hiring_notice', 'signed'),
      doc('approval_memo', 'cancelled'), doc('approval_memo', 'signed', 99),
    ])
    expect(p).toMatchObject({ signed: 1, current: { step: 2 }, currentStatus: 'not_created' })
  })

  it('is done once every step is signed', () => {
    const p = docProgress(review, ['hiring_notice', 'approval_memo', 'payment_request', 'work_report'].map((t) => doc(t as DocType, 'signed')))
    expect(p).toMatchObject({ phase: 'done', signed: 4, current: null })
  })
})
