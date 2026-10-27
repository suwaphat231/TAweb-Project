package database

import (
	"gorm.io/gorm"

	"labassist/models"
)

// DeleteUser hides an account instead of removing its rows. The user's
// applications, courses, reports and audit logs keep pointing at it, so the
// history stays intact. Soft-deleted users drop out of every query on
// models.User, so they cannot sign in. gorm.ErrRecordNotFound means there is
// no active user with that id.
func DeleteUser(id uint) error {
	result := DB.Delete(&models.User{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
