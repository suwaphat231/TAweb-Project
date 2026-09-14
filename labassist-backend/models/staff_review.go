package models

import "time"

type ReviewStatus string

const (
	ReviewPending  ReviewStatus = "pending"
	ReviewVerified ReviewStatus = "verified"
	ReviewReturned ReviewStatus = "returned"
)

// FormReview tracks the staff's review decision for a single course posting.
// CourseID is the unique key (one review per course).
type FormReview struct {
	ID         uint         `gorm:"primaryKey" json:"id"`
	CourseID   uint         `gorm:"not null;uniqueIndex" json:"course_id"`
	ReviewerID uint         `gorm:"not null" json:"reviewer_id"`
	Status     ReviewStatus `gorm:"type:enum('pending','verified','returned');not null;default:'pending'" json:"status"`
	Note       string       `gorm:"type:text" json:"note,omitempty"`
	UpdatedAt  time.Time    `json:"updated_at"`

	// Enriched from the courses table — never stored
	CourseCode     string `gorm:"-" json:"course_code"`
	CourseTitle    string `gorm:"-" json:"course_title"`
	Section        int    `gorm:"-" json:"section"`
	Semester       string `gorm:"-" json:"semester"`
	AcademicYear   int    `gorm:"-" json:"academic_year"`
	InstructorName string `gorm:"-" json:"instructor_name"`
	LabBoySlots    int    `gorm:"-" json:"labboy_slots"`
	AcceptedCount  int    `gorm:"-" json:"labboy_accepted"`
	SubmittedAt    string `gorm:"-" json:"submitted_at"`
}

func (FormReview) TableName() string { return "form_reviews" }
