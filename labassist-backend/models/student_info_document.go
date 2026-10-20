package models

import "time"

// StudentInfoDocument holds the student's registrar (REG) screenshots and
// the fields extracted from them. One row per student (uniqueIndex on
// user_id), so a new upload always replaces the previous one.
//
// REG shows the data in two boxes, so there are two images:
//   - ข้อมูลนักศึกษา (Student Information) → FileName/FileData: student ID,
//     education level, curriculum, faculty, campus, student status.
//   - ข้อมูลส่วนตัว (Personal Information) → PersonalFileName/PersonalFileData:
//     the Thai and English names.
//
// Allowlist: student_id, full_name_th, full_name_en, education_level,
// curriculum, faculty, campus, student_status.
// Sensitive fields (national_id, birth_date, age, etc.) are never stored.
type StudentInfoDocument struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	UserID   uint   `gorm:"uniqueIndex;not null" json:"user_id"`
	FileName string `gorm:"size:255" json:"file_name"`
	FileData []byte `gorm:"type:longblob" json:"-"`
	// PersonalFileName defaults to '' so AutoMigrate can add it to existing rows.
	PersonalFileName   string  `gorm:"size:255;not null;default:''" json:"personal_file_name"`
	PersonalFileData   []byte  `gorm:"type:longblob" json:"-"`
	PersonalConfidence float64 `gorm:"type:decimal(5,4);not null;default:0" json:"personal_confidence"`

	OcrStudentID      *string `gorm:"size:30"  json:"ocr_student_id,omitempty"`
	OcrFullNameTh     *string `gorm:"size:300" json:"ocr_full_name_th,omitempty"`
	OcrFullNameEn     *string `gorm:"size:300" json:"ocr_full_name_en,omitempty"`
	OcrEducationLevel *string `gorm:"size:100" json:"ocr_education_level,omitempty"`
	OcrCurriculum     *string `gorm:"size:300" json:"ocr_curriculum,omitempty"`
	OcrFaculty        *string `gorm:"size:300" json:"ocr_faculty,omitempty"`
	OcrCampus         *string `gorm:"size:200" json:"ocr_campus,omitempty"`
	OcrStudentStatus  *string `gorm:"size:100" json:"ocr_student_status,omitempty"`

	Confidence  float64    `gorm:"type:decimal(5,4)" json:"confidence"`
	ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (StudentInfoDocument) TableName() string { return "student_info_documents" }
