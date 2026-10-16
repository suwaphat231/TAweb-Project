package database

import (
	"time"

	"labassist/models"
)

// --- Transcripts (MySQL-backed via DB) ---
//
// Each student keeps at most one transcript (UserID is uniquely indexed on
// the model); uploading again replaces the stored file rather than adding a
// second row.

func UpsertTranscript(userID uint, fileName string, data []byte) (models.Transcript, error) {
	var t models.Transcript
	if err := DB.Where("user_id = ?", userID).First(&t).Error; err == nil {
		t.FileName = fileName
		t.FileData = data
		t.FileSize = int64(len(data))
		t.UploadedAt = time.Now()
		if err := DB.Save(&t).Error; err != nil {
			return models.Transcript{}, err
		}
		return t, nil
	}

	t = models.Transcript{
		UserID:     userID,
		FileName:   fileName,
		FileData:   data,
		FileSize:   int64(len(data)),
		UploadedAt: time.Now(),
	}
	if err := DB.Create(&t).Error; err != nil {
		return models.Transcript{}, err
	}
	return t, nil
}

func TranscriptByUserID(userID uint) (models.Transcript, bool) {
	var t models.Transcript
	if err := DB.Where("user_id = ?", userID).First(&t).Error; err != nil {
		return models.Transcript{}, false
	}
	return t, true
}
