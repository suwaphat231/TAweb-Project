package models

import "time"

type AppStatus string
type RoleApplied string

const (
	AppPending   AppStatus = "pending"
	AppAccepted  AppStatus = "accepted"
	AppRejected  AppStatus = "rejected"
	AppWithdrawn AppStatus = "withdrawn"

	// RoleLabBoy is the only role the department recruits for — TA
	// recruitment was removed. RoleApplied stays as its own type in case a
	// role is reintroduced later.
	RoleLabBoy RoleApplied = "labboy"
)

type Application struct {
	ID          uint        `gorm:"primaryKey" json:"id"`
	StudentID   uint        `gorm:"not null;uniqueIndex:idx_application_student_course" json:"student_id"`
	Student     User        `gorm:"belongsTo:Student;foreignKey:StudentID;references:ID" json:"-"`
	CourseID    uint        `gorm:"not null;index;uniqueIndex:idx_application_student_course" json:"course_id"`
	Course      Course      `gorm:"foreignKey:CourseID;references:ID" json:"-"`
	RoleApplied RoleApplied `gorm:"type:enum('labboy');not null" json:"role_applied"`
	Status      AppStatus   `gorm:"type:enum('pending','accepted','rejected','withdrawn');default:'pending'" json:"status"`
	// Grade is the letter grade the student earned when they previously took
	// this course, self-reported at application time so the instructor can
	// check it against the course's minimum-grade requirement.
	Grade        *string    `gorm:"size:5" json:"grade,omitempty"`
	AppliedAt    time.Time  `gorm:"autoCreateTime" json:"applied_at"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
	ReviewedByID *uint      `json:"reviewed_by_id,omitempty"`
	ReviewedBy   *User      `gorm:"foreignKey:ReviewedByID;references:ID" json:"-"`
	Note         *string    `gorm:"type:text" json:"note,omitempty"`
	// Cancelled marks a rejection that came from the instructor undoing an
	// accept clicked by mistake. The instructor's list shows no status for
	// it and can accept again; the student sees it as still pending (see
	// StudentView), so like a pending application it cannot be re-applied.
	Cancelled bool `gorm:"not null;default:false" json:"cancelled,omitempty"`

	// GradeProof is the image the student attaches as proof of the
	// self-reported Grade above, required only on postings where the
	// instructor turned RequireGradeProof on. Raw bytes never serialize —
	// HasGradeProof below is what callers see; the image itself is only
	// ever served through the dedicated download endpoints.
	GradeProofFileName string `json:"-"`
	GradeProofData     []byte `gorm:"type:longblob" json:"-"`

	// OcrWarning is set after grade-proof upload when OCR detects a
	// mismatch between the student's self-reported grade and the image,
	// the grade is below the course threshold, or OCR cannot read the
	// image. Stored so instructors see the flag when reviewing — never
	// blocks submission per Rule 3.
	OcrWarning *string `gorm:"type:text" json:"ocr_warning,omitempty"`

	// Computed fields (not in DB)
	HasGradeProof      bool    `gorm:"-" json:"has_grade_proof"`
	StudentName        string  `gorm:"-" json:"student_name"`
	StudentCode        string  `gorm:"-" json:"student_code"`
	StudentGPA         float64 `gorm:"-" json:"student_gpa"`
	StudentEmail       string  `gorm:"-" json:"student_email,omitempty"`
	StudentFaculty     string  `gorm:"-" json:"student_faculty,omitempty"`
	StudentYear        int     `gorm:"-" json:"student_year,omitempty"`
	CourseCode         string  `gorm:"-" json:"course_code"`
	CourseTitle        string  `gorm:"-" json:"course_title"`
	CourseEnglishTitle string  `gorm:"-" json:"course_english_title,omitempty"`
	CourseSection      int     `gorm:"-" json:"course_section,omitempty"`
	CourseSchedule     string  `gorm:"-" json:"course_schedule,omitempty"`
	ReviewedByName     string  `gorm:"-" json:"reviewed_by_name,omitempty"`

	// Blacklists holds the student's active blacklist entries. Only the
	// instructor applicants endpoint fills it in — student-facing responses
	// must never carry it.
	Blacklists []Blacklist `gorm:"-" json:"blacklists,omitempty"`
}

func (Application) TableName() string { return "applications" }

// StudentView is the application as its student should see it. A cancelled
// acceptance is only a rejection on the instructor's side — to the student it
// reads as still awaiting review, with no trace of the reverted decision.
// Every student-facing response must go through this.
func (a Application) StudentView() Application {
	if a.Cancelled && a.Status == AppRejected {
		a.Status = AppPending
		a.ReviewedAt = nil
		a.ReviewedByID = nil
		a.ReviewedByName = ""
		a.Note = nil
	}
	a.Cancelled = false
	return a
}

// ApplicationHistory archives a rejected or withdrawn application round
// before the student re-applies to the same course. The unique index on
// (student_id, course_id) allows only one live row per student+course, so
// older rounds live here instead of being deleted.
type ApplicationHistory struct {
	ID            uint        `gorm:"primaryKey" json:"id"`
	ApplicationID uint        `gorm:"not null;index" json:"application_id"`
	StudentID     uint        `gorm:"not null" json:"student_id"`
	CourseID      uint        `gorm:"not null" json:"course_id"`
	RoleApplied   RoleApplied `json:"role_applied"`
	Status        AppStatus   `json:"status"`
	Grade         *string     `gorm:"size:5" json:"grade,omitempty"`
	AppliedAt     time.Time   `json:"applied_at"`
	ReviewedAt    *time.Time  `json:"reviewed_at,omitempty"`
	ReviewedByID  *uint       `json:"reviewed_by_id,omitempty"`
	Note          *string     `gorm:"type:text" json:"note,omitempty"`
	OcrWarning    *string     `gorm:"type:text" json:"ocr_warning,omitempty"`
	// GradeProofData is included so the instructor can still view proof
	// from a rejected round when reconsidering.
	GradeProofFileName string `json:"grade_proof_file_name,omitempty"`
	GradeProofData     []byte `gorm:"type:longblob" json:"-"`
	ArchivedAt         time.Time `json:"archived_at"`
}

func (ApplicationHistory) TableName() string { return "application_history" }
