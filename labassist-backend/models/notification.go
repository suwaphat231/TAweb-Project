package models

import "time"

type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null" json:"user_id"`
	CourseID  *uint     `json:"course_id,omitempty"`
	Title     string    `gorm:"size:300;not null" json:"title"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	IsRead    bool      `gorm:"default:false" json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

func (Notification) TableName() string { return "notifications" }
