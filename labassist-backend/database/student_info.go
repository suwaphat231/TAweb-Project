package database

import (
	"time"

	"labassist/models"

	"gorm.io/gorm/clause"
)

// StudentInfoOCR carries the allowlisted fields read from the ข้อมูลนักศึกษา
// box (the names come from ข้อมูลส่วนตัว instead). Sensitive fields are never
// included here.
type StudentInfoOCR struct {
	StudentID      *string
	EducationLevel *string
	Curriculum     *string
	Faculty        *string
	Campus         *string
	StudentStatus  *string
	Confidence     float64
}

// UpsertStudentInfoDocument stores (or replaces) the ข้อมูลนักศึกษา image and
// the fields read from it. The names come from the other box (see
// UpsertStudentInfoPersonal) and are left alone. ConfirmedAt is always reset
// to nil on each new upload.
func UpsertStudentInfoDocument(userID uint, fileName string, fileData []byte, ocr StudentInfoOCR) (models.StudentInfoDocument, error) {
	doc := models.StudentInfoDocument{
		UserID:            userID,
		FileName:          fileName,
		FileData:          fileData,
		OcrStudentID:      ocr.StudentID,
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
			"ocr_student_id",
			"ocr_education_level", "ocr_curriculum", "ocr_faculty", "ocr_campus",
			"ocr_student_status", "confidence", "confirmed_at", "updated_at",
		}),
	}).Create(&doc).Error; err != nil {
		return models.StudentInfoDocument{}, err
	}
	return mustStudentInfoDocument(userID, doc), nil
}

// UpsertStudentInfoPersonal stores (or replaces) the ข้อมูลส่วนตัว image and
// the Thai/English names read from it. ConfirmedAt is reset to nil.
func UpsertStudentInfoPersonal(userID uint, fileName string, fileData []byte, nameTh, nameEn *string, confidence float64) (models.StudentInfoDocument, error) {
	doc := models.StudentInfoDocument{
		UserID:             userID,
		PersonalFileName:   fileName,
		PersonalFileData:   fileData,
		PersonalConfidence: confidence,
		OcrFullNameTh:      nameTh,
		OcrFullNameEn:      nameEn,
		ConfirmedAt:        nil,
	}
	if err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"personal_file_name", "personal_file_data", "personal_confidence",
			"ocr_full_name_th", "ocr_full_name_en", "confirmed_at", "updated_at",
		}),
	}).Create(&doc).Error; err != nil {
		return models.StudentInfoDocument{}, err
	}
	return mustStudentInfoDocument(userID, doc), nil
}

func mustStudentInfoDocument(userID uint, fallback models.StudentInfoDocument) models.StudentInfoDocument {
	if doc, ok := StudentInfoDocumentByUserID(userID); ok {
		return doc
	}
	return fallback
}

// StudentInfoDocumentByUserID returns the student's info doc (no file data).
func StudentInfoDocumentByUserID(userID uint) (models.StudentInfoDocument, bool) {
	var doc models.StudentInfoDocument
	cols := "id, user_id, file_name, personal_file_name, personal_confidence, " +
		"ocr_student_id, ocr_full_name_th, ocr_full_name_en, " +
		"ocr_education_level, ocr_curriculum, ocr_faculty, ocr_campus, ocr_student_status, " +
		"confidence, confirmed_at, created_at, updated_at"
	if err := DB.Select(cols).Where("user_id = ?", userID).First(&doc).Error; err != nil {
		return models.StudentInfoDocument{}, false
	}
	return doc, true
}

// StudentInfoImageByUserID returns only the raw file bytes for serving —
// the ข้อมูลส่วนตัว image when personal is true, else ข้อมูลนักศึกษา.
func StudentInfoImageByUserID(userID uint, personal bool) (string, []byte, bool) {
	var doc models.StudentInfoDocument
	if err := DB.Select("file_name", "file_data", "personal_file_name", "personal_file_data").
		Where("user_id = ?", userID).First(&doc).Error; err != nil {
		return "", nil, false
	}
	if personal {
		return doc.PersonalFileName, doc.PersonalFileData, len(doc.PersonalFileData) > 0
	}
	return doc.FileName, doc.FileData, len(doc.FileData) > 0
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
