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
	StudentID   uint        `gorm:"not null" json:"student_id"`
	Student     User        `gorm:"foreignKey:StudentID" json:"-"`
	CourseID    uint        `gorm:"not null" json:"course_id"`
	Course      Course      `gorm:"foreignKey:CourseID" json:"-"`
	RoleApplied RoleApplied `gorm:"type:role_applied;not null" json:"role_applied"`
	Status      AppStatus   `gorm:"type:app_status;default:'pending'" json:"status"`
	// Grade is the letter grade the student earned when they previously took
	// this course, self-reported at application time so the instructor can
	// check it against the course's minimum-grade requirement.
	Grade        *string    `gorm:"size:5" json:"grade,omitempty"`
	AppliedAt    time.Time  `gorm:"default:CURRENT_TIMESTAMP" json:"applied_at"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
	ReviewedByID *uint      `json:"reviewed_by_id,omitempty"`
	ReviewedBy   *User      `gorm:"foreignKey:ReviewedByID" json:"-"`
	Note         *string    `gorm:"type:text" json:"note,omitempty"`

	// GradeProof is the image the student attaches as proof of the
	// self-reported Grade above, required only on postings where the
	// instructor turned RequireGradeProof on. Raw bytes never serialize —
	// HasGradeProof below is what callers see; the image itself is only
	// ever served through the dedicated download endpoints.
	GradeProofFileName string `json:"-"`
	GradeProofData     []byte `json:"-"`

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
}

func (Application) TableName() string { return "applications" }
