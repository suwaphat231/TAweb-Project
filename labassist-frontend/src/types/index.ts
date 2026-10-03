export type UserRole = 'student' | 'instructor' | 'staff' | 'admin'
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type CourseStatus = 'open' | 'closing_soon' | 'closed' | 'draft' | 'archived'

export interface User {
  id: number
  username: string
  full_name: string
  avatar_url?: string
  email: string
  role: UserRole
  student_id?: string
  google_sub?: string
  gpa?: number
  faculty?: string
  year?: number
  is_active: boolean
  created_at: string
  transcript_grades?: Record<string, string>
  transcript_status?: 'pass' | 'needs_review' | 'fail'
  transcript_message?: string
  transcript_confidence?: number
  transcript_updated_at?: string
}

/** One course from the core_courses catalog paired with the grade OCR read. */
export interface CourseGrade {
  code: string
  title: string
  /** Absent when found is false. */
  grade?: string
  found: boolean
}

/** One row from GET /admin/core-courses — the department's required-course
 *  reference list (used for OCR transcript matching), not an imported class
 *  posting. */
export interface CoreCourse {
  id: number
  program: 'IT' | 'CS'
  code: string
  title: string
  credits?: string
}

/** Result of POST /student/profile/transcript (OCR). */
export interface TranscriptOCRResult {
  status: 'pass' | 'needs_review' | 'fail'
  message: string
  confidence_score: number
  /** '' when the student's faculty matched neither curriculum. */
  program: 'IT' | 'CS' | ''
  courses: CourseGrade[]
  updated_at: string
  user: User
}

export interface Course {
	posting_id?: number
  id: number
  code: string
  title: string
  english_title?: string
  credits?: string
  section?: number
  schedule?: string
  instructor_id: number | null
  instructor_name: string
  instructors_raw?: string
  applicant_count?: number
  semester: string
  academic_year: number
  labboy_slots: number
  labboy_accepted: number
  status: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
  // When true, applicants must attach an image of their grade instead of
  // just self-reporting it — set per posting by the instructor.
  require_grade_proof: boolean
  labboy_schedule_confirmed: boolean
  // Set by /student/courses and /student/dashboard when the course schedule
  // overlaps the student's confirmed term schedule. Empty / absent = no conflict.
  conflict_day?: string
  created_at: string
}

export type CourseInstructorSource = 'imported' | 'self_added'

/** One row from GET /instructor/my-courses — a course linked to the instructor
 *  via the M:N course_instructors table, with a source badge. */
export interface CourseRelation {
  id: number
  course: Course
  source: CourseInstructorSource
  created_at: string
}

export interface LabBoyAssignment {
  course_id: number
  course_code: string
  course_title: string
  course_section: number
  course_schedule: string
  semester: string
  academic_year: number
}

export interface Notification {
  id: number
  user_id: number
  course_id?: number
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export interface Application {
	posting_id?: number
	posting_active?: boolean
  id: number
  student_id: number
  student_name: string
  student_code: string
  student_gpa: number
  student_email?: string
  student_faculty?: string
  student_year?: number
  course_id: number
  course_code: string
  course_title: string
  course_english_title?: string
  course_section?: number
  course_schedule?: string
  role_applied: 'labboy'
  status: ApplicationStatus
  grade?: string
  has_grade_proof?: boolean
  require_grade_proof?: boolean
  applied_at: string
  reviewed_at?: string
  reviewed_by_name?: string
  note?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface GoogleAuthPayload {
  credential: string
}

export interface ReviewPayload {
  status: 'accepted' | 'rejected'
  note?: string
}

export interface BulkReviewPayload {
  application_ids: number[]
  status: 'accepted' | 'rejected'
  note?: string
}

export interface BulkReviewResult {
  updated: number
  notified: number
  skipped_full: number
  skipped_no_proof: number
}

export interface CreateUserPayload {
  full_name: string
  role: UserRole
}

export interface UpdateUserPayload {
  full_name?: string
  role?: UserRole
}

export interface CreateCoursePayload {
  code: string
  title: string
  semester: string
  academic_year: number
  labboy_slots: number
  status?: CourseStatus
  deadline?: string
  description?: string
  requirements?: string
  require_grade_proof?: boolean
  // Read-only, display-only — always sourced from the admin's Excel import,
  // never typed by the instructor. Only meaningful when editing one existing
  // section; opening new sections happens by picking imported rows instead.
  section?: number
  schedule?: string
  // Admin-only: which instructor this manually-added course belongs to
  // (e.g. one an instructor asked for that never made it into the Excel
  // import). Ignored by the backend for non-admin callers.
  instructor_id?: number
}

export interface ApplyPayload {
  course_id: number
  role_applied: 'labboy'
  grade?: string
}

export interface Transcript {
  file_name: string
  file_size: number
  uploaded_at: string
}

export interface ImportCourseResult {
  row: number
  code: string
  title: string
  instructor: string
}

export interface ImportSkippedRow {
  row: number
  reason: string
}

export interface ImportCourseFields {
  title: string
  english_title: string
  credits: string
  schedule: string
  capacity: number
  enrolled: number
  instructors_raw: string
}

export interface ImportDuplicate {
  row: number
  code: string
  section: number
  title: string
}

export interface ImportConflict {
  row: number
  course_id: number
  code: string
  section: number
  old: ImportCourseFields
  new: ImportCourseFields
  different: (keyof ImportCourseFields)[]
}

export interface ImportCoursesResponse {
  created: ImportCourseResult[]
  skipped: ImportSkippedRow[]
  duplicates: ImportDuplicate[]
  conflicts: ImportConflict[]
}

export type ReviewStatus = 'pending' | 'verified' | 'returned'
export type DocType = 'hiring_notice' | 'approval_memo' | 'lab_notice' | 'payment_evidence' | 'payment_request' | 'work_report'
export type DocStatus = 'draft' | 'pending' | 'approved' | 'generated' | 'awaiting_signature' | 'signed' | 'cancelled' | 'superseded'

export interface FormReview {
	posting_id?: number
  id: number
  course_id: number
  reviewer_id: number
  status: ReviewStatus
  note?: string
  updated_at: string
  course_code: string
  course_title: string
  section: number
  semester: string
  academic_year: number
  instructor_name: string
  labboy_slots: number
  labboy_accepted: number
  submitted_at: string
}

export interface WorkDaySlot {
  day: string
  time_start: string
  time_end: string
}

export interface RosterEntry {
  student_id: number
  student_name: string
  student_code: string
  hours: number
  amount: number
}

export interface DocumentPeriod {
  month: number
  year: number
}

export interface StaffDocument {
	posting_id?: number
  id: number
  name: string
  type: DocType
  course_ref: string
  course_id?: number
  staff_id: number
  status: DocStatus
  note?: string
  period?: DocumentPeriod
  session_dates?: number[]
  hours_per_session?: number
  rate?: number
  roster?: RosterEntry[]
  total_amount?: number
  work_day?: string
  work_time_start?: string
  work_time_end?: string
  work_schedule?: WorkDaySlot[]
  sessions_per_month?: number
  ref_number?: string
  prior_memo_ref?: string
  prior_memo_date?: string
  dept_head_name?: string
  dean_name?: string
  staff_officer_name?: string
  version?: number
  created_at: string
}

export interface CreateStaffDocumentPayload {
  type: DocType
  course_ref: string
  note?: string
  course_id?: number
  month?: number
  year?: number
  session_dates?: number[]
  hours_per_session?: number
  rate?: number
  excluded_student_ids?: number[]
  work_day?: string
  work_time_start?: string
  work_time_end?: string
  work_schedule?: WorkDaySlot[]
  sessions_per_month?: number
  ref_number?: string
  prior_memo_ref?: string
  prior_memo_date?: string
  dept_head_name?: string
  dean_name?: string
  staff_officer_name?: string
}

export interface AdminStats {
  total_users: number
  total_students: number
  total_instructors: number
  total_courses: number
  open_courses: number
  total_applications: number
  accepted_applications: number
  pending_applications: number
}

// ─── Staff course management ──────────────────────────────────────────────────
export type CourseDocStatus = 'waiting' | 'in_progress' | 'completed'
export type DocStepStatus = 'not_reached' | 'waiting' | 'created' | 'in_review' | 'approved' | 'awaiting_signature' | 'signed' | 'completed'

export interface Instructor {
  id?: number
  name: string
  email?: string
  isMain?: boolean
}

export interface SelectedLabBoy {
  studentId: number
  studentCode: string
  studentName: string
  studentEmail?: string
}

export interface CourseOffering {
  courseId: number
  academicYear: number
  semester: string
  courseCode: string
  sectionNo: number
  courseTitle: string
  credits?: string
  schedule?: string
  room?: string
  instructors: Instructor[]
  selectedLabBoys: SelectedLabBoy[]
  labboySlots: number
  labboyAccepted: number
  docStatus: CourseDocStatus
  /** Pre-work docs (hiring_notice, approval_memo, lab_notice) signed/completed */
  preWorkCompleted: number
  preWorkTotal: number
  /** Legacy total — kept for progress bar in StaffCourseDetail header */
  completedDocs: number
  totalDocs: number
  reviewStatus: ReviewStatus
}

export interface DocumentWorkflowItem {
  step: number
  label: string
  docType: DocType | null
  status: DocStepStatus
  documentId?: number
  documentName?: string
  createdAt?: string
}

// ─── Student info OCR ────────────────────────────────────────────────────────

export interface StudentInfoDocument {
  id: number
  user_id: number
  file_name: string
  ocr_student_id?: string
  ocr_full_name_th?: string
  ocr_full_name_en?: string
  ocr_education_level?: string
  ocr_curriculum?: string
  ocr_faculty?: string
  ocr_campus?: string
  confidence: number
  confirmed_at?: string
  created_at: string
  updated_at: string
}

export interface StudentInfoFieldStr {
  ocr: string | null
  current: string | null
  match: boolean
}

export interface StudentInfoComparison {
  student_id: StudentInfoFieldStr
  full_name_th: StudentInfoFieldStr
  full_name_en: StudentInfoFieldStr
  education_level: StudentInfoFieldStr
  curriculum: StudentInfoFieldStr
  faculty: StudentInfoFieldStr
  campus: StudentInfoFieldStr
}

export interface StudentInfoUploadResult {
  document: StudentInfoDocument
  comparison: StudentInfoComparison
}

/** One time slot parsed from a class timetable image. */
export interface ScheduleSlot {
  day: string        // MON TUE WED THU FRI SAT SUN
  start_time: string // HH:MM
  end_time: string   // HH:MM
}

/** Stored class schedule image evidence for a student. */
export interface ClassSchedule {
  id: number
  user_id: number
  file_name: string
  /** Legacy OCR slots — may be present from earlier uploads, not confirmed. */
  slots: ScheduleSlot[]
  updated_at: string
}

/** Result of POST /student/profile/class-schedule (image evidence upload, no OCR). */
export interface ClassScheduleImageResult {
  id: number
  file_name: string
  updated_at: string
}

/** Status of a student's term schedule entry. */
export type TermScheduleStatus = 'unset' | 'set' | 'no_class'

/** A student's manually-entered class schedule for one academic term. */
export interface TermSchedule {
  id?: number
  user_id?: number
  semester: string
  academic_year: number
  slots: ScheduleSlot[]
  status: TermScheduleStatus
  updated_at?: string
}

/** A distinct (semester, academic_year) pair from the courses table. */
export interface TermOption {
  semester: string
  academic_year: number
}

// ─── Staff Case workflow ──────────────────────────────────────────────────────

export type StaffCaseStatus = 'open' | 'plan_locked' | 'done'

export interface StaffCase {
  id: number
  posting_id: number
  course_id: number
  semester: string
  academic_year: number
  status: StaffCaseStatus
  labboy_count: number
  hours_per_session: number
  rate_per_hour_satang: number
  work_start_date?: string
  work_end_date?: string
  confirmed_by_instructor_at?: string
  plan_locked_at?: string
  created_by_id: number
  created_at: string
  updated_at: string
}

export interface LabBoyInfo {
  student_id: number
  student_code: string
  student_name: string
}

export interface StaffCaseResponse extends StaffCase {
  course_code: string
  course_title: string
  section: number
  schedule: string
  instructor_name: string
  lab_boys: LabBoyInfo[]
  next_task: string
  instructor_confirmed: boolean
}

// GroupWeekDaySlot is one day-time working slot within a ScheduleGroup.
// Multiple slots are serialised as a JSON array in ScheduleGroup.week_days_json.
export interface GroupWeekDaySlot {
  day: string        // MON TUE WED THU FRI SAT SUN
  start_time: string // HH:MM
  end_time: string   // HH:MM
}

export interface ScheduleGroup {
  id: number
  staff_case_id: number
  group_name?: string
  week_day: string
  start_time: string
  end_time: string
  // week_days_json: JSON string containing GroupWeekDaySlot[].
  // When present, use this for multi-day display; otherwise fall back to week_day/start_time/end_time.
  week_days_json?: string
  hours_per_session: number
  rate_per_hour_satang: number
  work_start_date?: string
  work_end_date?: string
  note?: string
  locked_at?: string
  locked_by_id?: number
  assigned_students: LabBoyInfo[]
  created_at: string
}

// ScheduleGroupMonth records one calendar month that a schedule group is active in.
export interface ScheduleGroupMonth {
  id: number
  schedule_group_id: number
  year: number   // CE year
  month: number  // 1–12
  month_start_date?: string // YYYY-MM-DD, overrides first day of month
  month_end_date?: string   // YYYY-MM-DD, overrides last day of month
  created_at: string
}

// MonthOccurrenceSummary is the server-computed summary for one month.
export interface MonthOccurrenceSummary {
  year: number
  month: number
  total: number
  cancelled_holiday: number
  cancelled_other: number
  rescheduled: number
  valid: number
  valid_minutes: number
  valid_hours: number
  pay_per_person_baht: number
  total_pay_baht: number
}

export type CalendarDateType = 'public_holiday' | 'university_holiday' | 'no_class' | 'case_exception' | 'makeup'
export type CalendarDateScope = 'global' | 'semester' | 'case'

export interface CalendarDate {
  id: number
  date: string
  name: string
  date_type: CalendarDateType
  scope: CalendarDateScope
  semester?: string
  academic_year?: number
  staff_case_id?: number
  affects_work: boolean
  original_date_id?: number
  created_by_id: number
  edit_reason?: string
  created_at: string
  updated_at: string
}

export type OccurrenceStatus = 'scheduled' | 'cancelled_holiday' | 'rescheduled' | 'completed' | 'absent' | 'cancelled_other'

export interface WorkOccurrence {
  id: number
  staff_case_id: number
  schedule_group_id?: number
  scheduled_date: string
  start_time: string
  end_time: string
  status: OccurrenceStatus
  calendar_date_id?: number
  rescheduled_to_date?: string
  rescheduled_to_start?: string
  rescheduled_to_end?: string
  rescheduled_from_occurrence_id?: number
  reason?: string
  actual_hours?: number
  updated_by_id?: number
  updated_at: string
  created_at: string
}

export type MonthlyPeriodStatus = 'open' | 'closed'

export interface MonthlyPeriod {
  id: number
  staff_case_id: number
  month: number
  year: number
  status: MonthlyPeriodStatus
  closed_at?: string
  closed_by_id?: number
  created_at: string
  updated_at: string
}

export interface MonthlyPeriodResponse extends MonthlyPeriod {
  total_sessions: number
  completed_sessions: number
  absent_sessions: number
  cancelled_sessions: number
  total_hours: number
  total_amount_satang: number
}

export interface StaffAuditLog {
  id: number
  staff_case_id?: number
  entity_type: string
  entity_id: number
  action: string
  actor_id: number
  actor_name?: string
  old_value?: string
  new_value?: string
  reason?: string
  created_at: string
}

export interface UpdateCasePayload {
  hours_per_session?: number
  rate_per_hour?: number
  work_start_date?: string
  work_end_date?: string
}

export interface AddScheduleGroupPayload {
  group_name?: string
  week_day?: string
  start_time?: string
  end_time?: string
  week_day_slots?: GroupWeekDaySlot[]
  hours_per_session?: number
  rate_per_hour_satang?: number
  work_start_date?: string
  work_end_date?: string
  note?: string
}

export interface UpdateScheduleGroupPayload {
  group_name?: string
  week_day?: string
  start_time?: string
  end_time?: string
  week_day_slots?: GroupWeekDaySlot[]
  hours_per_session?: number
  rate_per_hour_satang?: number
  work_start_date?: string
  work_end_date?: string
  note?: string
}

export interface AddGroupMonthPayload {
  year: number
  month: number
  month_start_date?: string
  month_end_date?: string
}

export interface CreateCalendarDatePayload {
  date: string
  name: string
  date_type: CalendarDateType
  scope: CalendarDateScope
  semester?: string
  academic_year?: number
  staff_case_id?: number
  affects_work: boolean
  original_date_id?: number
  reason?: string
}

export interface GenerateOccurrencesPayload {
  week_day: string
  start_time: string
  end_time: string
  start_date: string
  end_date: string
}

export interface GenerateGroupOccurrencesPayload {
  start_date: string
  end_date: string
}

// ─── (legacy) One lab-assistant work session derived from a StaffDocument. ───

/** One lab-assistant work session derived from a StaffDocument. */
export interface WorkSession {
  course_id: number
  course_code: string
  course_title: string
  course_section: number
  semester: string
  academic_year: number
  document_id: number
  document_type: DocType
  /** ISO date string YYYY-MM-DD (Common Era) */
  session_date: string
  work_day: string
  work_time_start: string
  work_time_end: string
  hours_per_session: number
}
