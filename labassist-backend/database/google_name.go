package database

import (
	"gorm.io/gorm"
	"labassist/models"
)

// migrateGoogleEnglishNames moves the English name Google gave a student at
// sign-up out of FullName (the Thai name) into FullNameEn, so the student is
// asked for the Thai name on their profile. Idempotent.
func migrateGoogleEnglishNames(db *gorm.DB) error {
	var users []models.User
	if err := db.Where("role = ? AND google_sub IS NOT NULL AND full_name <> '' AND full_name_en = ''", models.RoleStudent).
		Find(&users).Error; err != nil {
		return err
	}
	for _, u := range users {
		if HasThaiLetter(u.FullName) {
			continue
		}
		if err := db.Model(&models.User{}).Where("id = ?", u.ID).
			Updates(map[string]any{"full_name": "", "full_name_en": u.FullName}).Error; err != nil {
			return err
		}
	}
	return nil
}
