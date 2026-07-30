package models

import "time"

type ReviewStatus string

const (
	ReviewPending  ReviewStatus = "pending"
	ReviewVerified ReviewStatus = "verified"
	ReviewReturned ReviewStatus = "returned"
)

// FormReview tracks the staff's review decision for a single course posting.
// Stored in-memory; CourseID is the unique key (one review per course).
type FormReview struct {
	ID         uint         `json:"id"`
	CourseID   uint         `json:"course_id"`
	ReviewerID uint         `json:"reviewer_id"`
	Status     ReviewStatus `json:"status"`
	Note       string       `json:"note,omitempty"`
	UpdatedAt  time.Time    `json:"updated_at"`

	// Enriched from the courses table — never stored
	CourseCode     string `json:"course_code"`
	CourseTitle    string `json:"course_title"`
	Section        int    `json:"section"`
	Semester       string `json:"semester"`
	AcademicYear   int    `json:"academic_year"`
	InstructorName string `json:"instructor_name"`
	LabBoySlots    int    `json:"labboy_slots"`
	AcceptedCount  int    `json:"labboy_accepted"`
	SubmittedAt    string `json:"submitted_at"`
}
