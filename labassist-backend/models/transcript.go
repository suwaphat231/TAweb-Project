package models

import "time"

// Transcript holds one student's uploaded PDF transcript, stored directly in
// Postgres as bytea rather than on disk (simplest option given this app has
// no dedicated file storage/volume). UserID is unique: each student keeps at
// most one transcript, and a new upload replaces the previous file.
type Transcript struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	FileName   string    `gorm:"size:255;not null" json:"file_name"`
	FileData   []byte    `gorm:"type:bytea;not null" json:"-"`
	FileSize   int64     `gorm:"not null" json:"file_size"`
	UploadedAt time.Time `json:"uploaded_at"`
}

func (Transcript) TableName() string { return "transcripts" }
