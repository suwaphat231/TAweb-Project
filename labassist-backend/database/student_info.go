package database

import (
	"log"
	"net/http"
	"time"

	"labassist/filestore"
	"labassist/models"

	"gorm.io/gorm/clause"
)

// StudentInfoOCR carries the allowlisted fields read from the ข้อมูลนักศึกษา
// box (the names come from ข้อมูลส่วนตัว instead). Sensitive fields are never
// included here.
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

// UpsertStudentInfoDocument stores (or replaces) the REG profile-card image
// and every field read from it. The ข้อมูลส่วนตัว image left over from the
// old two-screenshot flow is cleared. ConfirmedAt is always reset to nil on
// each new upload.
func UpsertStudentInfoDocument(userID uint, fileName string, fileData []byte, ocr StudentInfoOCR) (models.StudentInfoDocument, error) {
	key, blob, err := filestore.Save("student-info", fileData, http.DetectContentType(fileData))
	if err != nil {
		return models.StudentInfoDocument{}, err
	}
	var oldKey string
	DB.Model(&models.StudentInfoDocument{}).Where("user_id = ?", userID).Pluck("file_key", &oldKey)
	doc := models.StudentInfoDocument{
		UserID:            userID,
		FileName:          fileName,
		FileKey:           key,
		FileData:          blob,
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
			"file_name", "file_key", "file_data",
			"personal_file_name", "personal_file_data", "personal_confidence",
			"ocr_student_id", "ocr_full_name_th", "ocr_full_name_en",
			"ocr_education_level", "ocr_curriculum", "ocr_faculty", "ocr_campus",
			"ocr_student_status", "confidence", "confirmed_at", "updated_at",
		}),
	}).Create(&doc).Error; err != nil {
		filestore.Remove(key)
		return models.StudentInfoDocument{}, err
	}
	if oldKey != key {
		filestore.Remove(oldKey)
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

// StudentInfoImageByUserID returns only the raw file bytes for serving.
func StudentInfoImageByUserID(userID uint) (string, []byte, bool) {
	var doc models.StudentInfoDocument
	if err := DB.Select("file_name", "file_key", "file_data").
		Where("user_id = ?", userID).First(&doc).Error; err != nil {
		return "", nil, false
	}
	data, err := filestore.Load(doc.FileKey, doc.FileData)
	if err != nil {
		log.Printf("load student info image for user %d: %v", userID, err)
		return "", nil, false
	}
	return doc.FileName, data, len(data) > 0
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
