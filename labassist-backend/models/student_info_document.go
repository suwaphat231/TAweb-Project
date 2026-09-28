package models

import "time"

// StudentInfoDocument holds the most recently uploaded student info document
// and the fields extracted from it. One row per student (uniqueIndex on
// user_id), so a new upload always replaces the previous one.
//
// Allowlist: student_id, full_name_th, full_name_en, education_level,
// curriculum, faculty, campus.
// Sensitive fields (national_id, birth_date, age, etc.) are never stored.
type StudentInfoDocument struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	UserID   uint   `gorm:"uniqueIndex;not null" json:"user_id"`
	FileName string `gorm:"size:255" json:"file_name"`
	FileData []byte `gorm:"type:longblob" json:"-"`

	OcrStudentID      *string `gorm:"size:30"  json:"ocr_student_id,omitempty"`
	OcrFullNameTh     *string `gorm:"size:300" json:"ocr_full_name_th,omitempty"`
	OcrFullNameEn     *string `gorm:"size:300" json:"ocr_full_name_en,omitempty"`
	OcrEducationLevel *string `gorm:"size:100" json:"ocr_education_level,omitempty"`
	OcrCurriculum     *string `gorm:"size:300" json:"ocr_curriculum,omitempty"`
	OcrFaculty        *string `gorm:"size:300" json:"ocr_faculty,omitempty"`
	OcrCampus         *string `gorm:"size:200" json:"ocr_campus,omitempty"`

	Confidence  float64    `gorm:"type:decimal(5,4)" json:"confidence"`
	ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (StudentInfoDocument) TableName() string { return "student_info_documents" }
