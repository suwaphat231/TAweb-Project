package database

import (
	"log"
	"time"

	"labassist/models"
)

// --- Activity logs ---

// CreateActivityLog is best-effort: a failed audit write must not fail the
// request it describes, so the error is logged rather than returned.
func CreateActivityLog(l models.ActivityLog) {
	l.ID = 0
	l.CreatedAt = time.Now()
	if err := DB.Create(&l).Error; err != nil {
		log.Printf("create activity log (%s %s): %v", l.Method, l.Path, err)
	}
}

func ListActivityLogs(userID, method string, offset, limit int) ([]models.ActivityLog, int64, error) {
	q := DB.Model(&models.ActivityLog{})
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if method != "" {
		q = q.Where("method = ?", method)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	out := make([]models.ActivityLog, 0)
	if err := q.Order("id DESC").Offset(offset).Limit(limit).Find(&out).Error; err != nil {
		return nil, 0, err
	}
	return out, total, nil
}
