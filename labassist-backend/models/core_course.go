package models

// Program identifies which curriculum a CoreCourse belongs to. A student's
// program is derived from their Faculty field — see database.ProgramForFaculty.
type Program = string

const (
	ProgramIT Program = "IT" // เทคโนโลยีสารสนเทศ
	ProgramCS Program = "CS" // วิทยาการคอมพิวเตอร์
)

// CoreCourse is one course in a department's curriculum that the OCR feature
// looks for on an uploaded transcript. Code is the 6-digit number as it is
// printed on the transcript (no "-165" curriculum suffix) — it is the ONLY
// key used to match an OCR result to a course, so it must be exact.
//
// The same course can appear under both programs (e.g. IT students take the
// CS department's 517121), hence the unique key is (program, code) rather
// than code alone.
//
// Rows are seeded from database/migrations/allcourse.sql — see
// database/seed_core_courses.go.
type CoreCourse struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	Program string `gorm:"size:10;not null;uniqueIndex:idx_core_courses_program_code" json:"program"`
	Code    string `gorm:"size:20;not null;uniqueIndex:idx_core_courses_program_code" json:"code"`
	Title   string `gorm:"size:300;not null" json:"title"`
	Credits string `gorm:"size:20" json:"credits,omitempty"`
}

func (CoreCourse) TableName() string { return "core_courses" }
