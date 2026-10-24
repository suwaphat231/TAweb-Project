package models

import "time"

type CourseEditRequestStatus string

const (
	EditRequestPending  CourseEditRequestStatus = "pending"
	EditRequestApproved CourseEditRequestStatus = "approved"
	EditRequestRejected CourseEditRequestStatus = "rejected"
)

// CourseEditRequest is an instructor's proposed change to a course's
// catalog details (title, credits, meeting time). The course itself stays
// untouched until an admin approves; the fields hold the full proposed
// values, and the Old* fields snapshot what the course had when the request
// was sent so the history still reads correctly after approval.
type CourseEditRequest struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	CourseID     uint   `gorm:"not null;index" json:"course_id"`
	RequestedBy  uint   `gorm:"not null;index" json:"requested_by"`
	Title        string `gorm:"size:300;not null" json:"title"`
	EnglishTitle string `gorm:"size:300" json:"english_title"`
	Credits      string `gorm:"size:20" json:"credits"`
	Schedule     string `gorm:"type:text" json:"schedule"`
	// Note is the instructor's reason for the change, shown to the admin.
	Note string `gorm:"type:text" json:"note"`

	OldTitle        string `gorm:"size:300" json:"old_title"`
	OldEnglishTitle string `gorm:"size:300" json:"old_english_title"`
	OldCredits      string `gorm:"size:20" json:"old_credits"`
	OldSchedule     string `gorm:"type:text" json:"old_schedule"`

	Status       CourseEditRequestStatus `gorm:"type:enum('pending','approved','rejected');not null;default:'pending';index" json:"status"`
	RejectReason string                  `gorm:"type:text" json:"reject_reason,omitempty"`
	ReviewedBy   *uint                   `json:"reviewed_by,omitempty"`
	ReviewedAt   *time.Time              `json:"reviewed_at,omitempty"`
	CreatedAt    time.Time               `json:"created_at"`
	UpdatedAt    time.Time               `json:"updated_at"`

	// Filled on read for display; not stored.
	CourseCode     string `gorm:"-" json:"course_code,omitempty"`
	CourseSection  int    `gorm:"-" json:"course_section,omitempty"`
	CourseSemester string `gorm:"-" json:"course_semester,omitempty"`
	CourseYear     int    `gorm:"-" json:"course_academic_year,omitempty"`
	RequesterName  string `gorm:"-" json:"requester_name,omitempty"`
}

func (CourseEditRequest) TableName() string { return "course_edit_requests" }
