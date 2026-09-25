package models

import "time"

type CourseStatus string

const (
	StatusOpen        CourseStatus = "open"
	StatusClosingSoon CourseStatus = "closing_soon"
	StatusClosed      CourseStatus = "closed"
	StatusDraft       CourseStatus = "draft"
	StatusArchived    CourseStatus = "archived"
)

type Course struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	Code           string `gorm:"size:20;not null" json:"code"`
	Title          string `gorm:"size:300;not null" json:"title"`
	EnglishTitle   string `gorm:"size:300" json:"english_title,omitempty"`
	GroupNote      string `gorm:"size:200" json:"group_note,omitempty"`
	Credits        string `gorm:"size:20" json:"credits,omitempty"`
	Section        int    `gorm:"default:0" json:"section"`
	Schedule       string `gorm:"size:500" json:"schedule,omitempty"`
	Capacity       int    `gorm:"default:0" json:"capacity"`
	Enrolled       int    `gorm:"default:0" json:"enrolled"`
	InstructorID   uint   `gorm:"not null" json:"instructor_id"`
	Instructor     User   `gorm:"foreignKey:InstructorID" json:"-"`
	InstructorName string `gorm:"-" json:"instructor_name"`
	// InstructorsRaw is the verbatim text of the spreadsheet's instructor
	// cell (kept for display as-is, e.g. co-teaching names the system has
	// no matching account for) — separate from InstructorID, which only
	// ever points to a real, matched user account.
	InstructorsRaw string       `gorm:"size:500" json:"instructors_raw,omitempty"`
	ApplicantCount int          `gorm:"-" json:"applicant_count"`
	Semester       string       `gorm:"size:10;not null" json:"semester"`
	AcademicYear   int          `gorm:"not null" json:"academic_year"`
	HasLab         bool         `gorm:"default:false" json:"has_lab"`
	LabBoySlots    int          `gorm:"default:0" json:"labboy_slots"`
	LabBoyAccepted int          `gorm:"default:0" json:"labboy_accepted"`
	Status         CourseStatus `gorm:"type:enum('open','closing_soon','closed','draft','archived');default:'draft'" json:"status"`
	Deadline       *time.Time   `json:"deadline,omitempty"`
	Description    *string      `gorm:"type:text" json:"description,omitempty"`
	Requirements   *string      `gorm:"type:text" json:"requirements,omitempty"`
	// RequireGradeProof: when true, a student applying must attach an image
	// of their grade (e.g. a MyReg screenshot) instead of just self-reporting
	// a letter grade — set per posting so the instructor decides which
	// courses need proof against students typing in a fake grade.
	RequireGradeProof bool `gorm:"default:false" json:"require_grade_proof"`
	// ClosedByInstructor is true only when an instructor or admin explicitly
	// sets status to "closed". Deadline-based auto-close leaves this false,
	// so accepted students may still withdraw after a deadline expires but
	// not after the instructor has deliberately closed the posting.
	ClosedByInstructor bool `gorm:"default:false" json:"closed_by_instructor"`
	// LabBoyScheduleConfirmed is set by the instructor after finalising which
	// students are accepted — it signals that the work schedule is ready and
	// students can now see it on their /student/schedule page.
	LabBoyScheduleConfirmed bool      `gorm:"default:false" json:"labboy_schedule_confirmed"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

func (Course) TableName() string { return "courses" }
