package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm/clause"
)

// StudentInfoOCR carries the allowlisted fields extracted from the document.
// Sensitive fields are never included here.
type StudentInfoOCR struct {
	StudentID      *string
	FullNameTh     *string
	FullNameEn     *string
	EducationLevel *string
	Curriculum     *string
	Faculty        *string
	Campus         *string
	StudentStatus  *string
	Confidence     float64
}

// UpsertStudentInfoDocument stores (or replaces) a student's info document
// and the OCR result. ConfirmedAt is always reset to nil on each new upload.
func UpsertStudentInfoDocument(userID uint, fileName string, fileData []byte, ocr StudentInfoOCR) (models.StudentInfoDocument, error) {
	doc := models.StudentInfoDocument{
		UserID:            userID,
		FileName:          fileName,
		FileData:          fileData,
		OcrStudentID:      ocr.StudentID,
		OcrFullNameTh:     ocr.FullNameTh,
		OcrFullNameEn:     ocr.FullNameEn,
		OcrEducationLevel: ocr.EducationLevel,
		OcrCurriculum:     ocr.Curriculum,
		OcrFaculty:        ocr.Faculty,
		OcrCampus:         ocr.Campus,
		OcrStudentStatus:  ocr.StudentStatus,
		Confidence:        ocr.Confidence,
		ConfirmedAt:       nil,
	}
	if err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"file_name", "file_data",
			"ocr_student_id", "ocr_full_name_th", "ocr_full_name_en",
			"ocr_education_level", "ocr_curriculum", "ocr_faculty", "ocr_campus",
			"ocr_student_status", "confidence", "confirmed_at", "updated_at",
		}),
	}).Create(&doc).Error; err != nil {
		return models.StudentInfoDocument{}, err
	}
	_ = DB.Where("user_id = ?", userID).First(&doc)
	return doc, nil
}

// StudentInfoDocumentByUserID returns the student's info doc (no file data).
func StudentInfoDocumentByUserID(userID uint) (models.StudentInfoDocument, bool) {
	var doc models.StudentInfoDocument
	cols := "id, user_id, file_name, " +
		"ocr_student_id, ocr_full_name_th, ocr_full_name_en, " +
		"ocr_education_level, ocr_curriculum, ocr_faculty, ocr_campus, ocr_student_status, " +
		"confidence, confirmed_at, created_at, updated_at"
	if err := DB.Select(cols).Where("user_id = ?", userID).First(&doc).Error; err != nil {
		return models.StudentInfoDocument{}, false
	}
	return doc, true
}

// StudentInfoImageByUserID returns only the raw file bytes for serving.
func StudentInfoImageByUserID(userID uint) (string, []byte, bool) {
	var doc models.StudentInfoDocument
	if err := DB.Select("file_name", "file_data").Where("user_id = ?", userID).First(&doc).Error; err != nil {
		return "", nil, false
	}
	return doc.FileName, doc.FileData, true
}

// ConfirmStudentInfoDocument stamps confirmed_at and returns the updated row.
func ConfirmStudentInfoDocument(userID uint) (models.StudentInfoDocument, bool) {
	now := time.Now()
	if err := DB.Model(&models.StudentInfoDocument{}).
		Where("user_id = ?", userID).
		Update("confirmed_at", now).Error; err != nil {
		return models.StudentInfoDocument{}, false
	}
	return StudentInfoDocumentByUserID(userID)
}
