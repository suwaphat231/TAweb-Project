package models

// CoreCourse is one compulsory course in the department's curriculum, used
// to check which required courses a student's uploaded transcript covers.
// The table is migrated now but seeded with no rows yet — see
// database/seed_core_courses.go, where the actual course list gets filled
// in later.
type CoreCourse struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	Code    string `gorm:"size:20;uniqueIndex;not null" json:"code"`
	Title   string `gorm:"size:300;not null" json:"title"`
	Credits string `gorm:"size:20" json:"credits,omitempty"`
}

func (CoreCourse) TableName() string { return "core_courses" }
