package database

import (
	"log"
	"time"

	"labassist/filestore"
	"labassist/models"
)

// maxTranscriptImages is how many grade-sheet files are kept per student;
// older ones are dropped as new pages are uploaded.
const maxTranscriptImages = 5

// SaveTranscriptImage stores an uploaded grade sheet and trims the student's
// oldest files beyond maxTranscriptImages.
func SaveTranscriptImage(userID uint, fileName, contentType string, data []byte) error {
	key, blob, err := filestore.Save("transcript-images", data, contentType)
	if err != nil {
		return err
	}
	img := models.TranscriptImage{
		UserID: userID, FileName: fileName, ContentType: contentType,
		FileKey: key, FileData: blob, UploadedAt: time.Now(),
	}
	if err := DB.Create(&img).Error; err != nil {
		filestore.Remove(key)
		return err
	}
	var keep []uint
	DB.Model(&models.TranscriptImage{}).Where("user_id = ?", userID).
		Order("uploaded_at DESC, id DESC").Limit(maxTranscriptImages).Pluck("id", &keep)
	var dropKeys []string
	DB.Model(&models.TranscriptImage{}).Where("user_id = ? AND id NOT IN ? AND file_key <> ''", userID, keep).
		Pluck("file_key", &dropKeys)
	if err := DB.Where("user_id = ? AND id NOT IN ?", userID, keep).Delete(&models.TranscriptImage{}).Error; err != nil {
		return err
	}
	removeFiles(dropKeys)
	return nil
}

// TranscriptImagesForUser lists the student's stored grade sheets, newest
// first, without the file bytes.
func TranscriptImagesForUser(userID uint) ([]models.TranscriptImage, error) {
	var rows []models.TranscriptImage
	err := DB.Select("id", "user_id", "file_name", "content_type", "uploaded_at").
		Where("user_id = ?", userID).Order("uploaded_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

// TranscriptImageForUser returns one stored grade sheet with its bytes, only
// if it belongs to userID.
func TranscriptImageForUser(id, userID uint) (models.TranscriptImage, bool) {
	var img models.TranscriptImage
	if err := DB.Where("id = ? AND user_id = ?", id, userID).First(&img).Error; err != nil {
		return models.TranscriptImage{}, false
	}
	data, err := filestore.Load(img.FileKey, img.FileData)
	if err != nil {
		log.Printf("load transcript image %d: %v", img.ID, err)
		return models.TranscriptImage{}, false
	}
	img.FileData = data
	return img, true
}
