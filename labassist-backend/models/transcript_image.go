package models

import "time"

// TranscriptImage is one grade-sheet file a student ran through OCR on the
// grade-check page, kept so they can compare it with the grades read from it.
// A student may have several (one per transcript page uploaded).
type TranscriptImage struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"-"`
	FileName    string    `gorm:"size:255;not null" json:"file_name"`
	ContentType string    `gorm:"size:100;not null" json:"content_type"`
	FileData    []byte    `gorm:"type:longblob;not null" json:"-"`
	UploadedAt  time.Time `json:"uploaded_at"`
}
