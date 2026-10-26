package models

import "time"

// Transcript holds one student's uploaded PDF transcript. The file is in
// object storage under FileKey; FileData only holds files uploaded before
// that (see filestore). UserID is unique: each student keeps at most one
// transcript, and a new upload replaces the previous file.
type Transcript struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	FileName   string    `gorm:"size:255;not null" json:"file_name"`
	FileKey    string    `gorm:"size:255;not null;default:''" json:"-"`
	FileData   []byte    `gorm:"type:longblob" json:"-"`
	FileSize   int64     `gorm:"not null" json:"file_size"`
	UploadedAt time.Time `json:"uploaded_at"`
}

func (Transcript) TableName() string { return "transcripts" }
