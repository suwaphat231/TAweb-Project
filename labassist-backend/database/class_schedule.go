package database

import (
	"time"

	"labassist/models"
)

// UpsertClassSchedule saves or replaces a student's timetable image evidence.
// Slots are no longer written here (they live in term_schedules); pass nil.
func UpsertClassSchedule(userID uint, fileName string, imageData []byte, slots []models.ScheduleSlot) (models.ClassSchedule, error) {
	if slots == nil {
		slots = []models.ScheduleSlot{}
	}
	var cs models.ClassSchedule
	if DB.Where("user_id = ?", userID).First(&cs).Error == nil {
		cs.FileName = fileName
		cs.ImageData = imageData
		cs.Slots = slots
		cs.UpdatedAt = time.Now()
		if err := DB.Save(&cs).Error; err != nil {
			return models.ClassSchedule{}, err
		}
		return cs, nil
	}
	cs = models.ClassSchedule{
		UserID:    userID,
		FileName:  fileName,
		ImageData: imageData,
		Slots:     slots,
		UpdatedAt: time.Now(),
	}
	if err := DB.Create(&cs).Error; err != nil {
		return models.ClassSchedule{}, err
	}
	return cs, nil
}

// ClassScheduleByUserID returns the schedule metadata and slots without the
// image bytes (use ClassScheduleImageByUserID for the raw image).
func ClassScheduleByUserID(userID uint) (models.ClassSchedule, bool) {
	var cs models.ClassSchedule
	if DB.Select("id", "user_id", "file_name", "slots", "updated_at").
		Where("user_id = ?", userID).First(&cs).Error != nil {
		return models.ClassSchedule{}, false
	}
	return cs, true
}

// ClassScheduleImageByUserID returns the raw image bytes and file name for the
// authenticated download endpoint — kept separate so the list endpoint never
// loads potentially large blobs unnecessarily.
func ClassScheduleImageByUserID(userID uint) (fileName string, data []byte, ok bool) {
	var cs models.ClassSchedule
	if DB.Select("file_name", "image_data").Where("user_id = ?", userID).First(&cs).Error != nil {
		return "", nil, false
	}
	if len(cs.ImageData) == 0 {
		return "", nil, false
	}
	return cs.FileName, cs.ImageData, true
}
