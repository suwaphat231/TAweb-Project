package database

import (
	"time"

	"labassist/models"
)

// --- Notifications ---

func CreateNotifications(notifs []models.Notification) int {
	if len(notifs) == 0 {
		return 0
	}
	for i := range notifs {
		notifs[i].ID = 0
		notifs[i].CreatedAt = time.Now()
	}
	if DB.Create(&notifs).Error != nil {
		return 0
	}
	return len(notifs)
}

func UserNotifications(userID uint) ([]models.Notification, error) {
	out := make([]models.Notification, 0)
	if err := DB.Where("user_id = ?", userID).Order("id DESC").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

func MarkNotifRead(id, userID uint) error {
	return DB.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("is_read", true).Error
}

func MarkAllNotifsRead(userID uint) error {
	return DB.Model(&models.Notification{}).Where("user_id = ?", userID).Update("is_read", true).Error
}

func AcceptedStudentsForCourse(courseID uint) ([]models.Application, error) {
	posting, ok := ActivePostingForCourse(courseID)
	if !ok {
		return []models.Application{}, nil
	}
	rows, err := applicationRows("posting_id = ? AND status = ?", posting.ID, models.AppAccepted)
	if err != nil {
		return nil, err
	}
	out := make([]models.Application, 0, len(rows))
	for _, a := range rows {
		out = append(out, enrichApplication(a))
	}
	return out, nil
}
