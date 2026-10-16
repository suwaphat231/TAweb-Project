package database

import (
	"errors"
	"strings"

	"labassist/models"

	mysqldriver "github.com/go-sql-driver/mysql"
)

// --- Users (MySQL-backed via DB, see database/connection.go) ---

func UserByID(id uint) (models.User, bool) {
	// 0 is never a real id (MySQL AUTO_INCREMENT starts at 1) — imported courses
	// use it as the "no matching instructor" placeholder, so this is hit on
	// every such course. Skip the query instead of round-tripping to the DB
	// just to log a "record not found".
	if id == 0 {
		return models.User{}, false
	}
	var u models.User
	if err := DB.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByUsername(username string) (models.User, bool) {
	var u models.User
	if err := DB.Where("username = ?", username).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByGoogleSub(sub string) (models.User, bool) {
	var u models.User
	if err := DB.Where("google_sub = ?", sub).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByEmail(email string) (models.User, bool) {
	var u models.User
	if err := DB.Where("email = ?", email).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func UserByStudentID(studentID string) (models.User, bool) {
	var u models.User
	if err := DB.Where("student_id = ?", studentID).First(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func ListUsers(role, search string, limit, offset int) ([]models.User, error) {
	q := DB.Model(&models.User{}).Order("id DESC")
	if role != "" {
		q = q.Where("role = ?", role)
	}
	if search != "" {
		s := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(full_name) LIKE ? OR LOWER(full_name_en) LIKE ? OR LOWER(email) LIKE ?", s, s, s)
	}
	out := make([]models.User, 0)
	if err := q.Offset(offset).Limit(limit).Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

func CreateUser(u models.User) (models.User, error) {
	if u.Username != nil {
		var count int64
		if err := DB.Model(&models.User{}).Where("username = ?", *u.Username).Count(&count).Error; err != nil {
			return models.User{}, err
		}
		if count > 0 {
			return models.User{}, ErrConflict
		}
	}
	if u.Email != "" {
		var count int64
		if err := DB.Model(&models.User{}).Where("email = ?", u.Email).Count(&count).Error; err != nil {
			return models.User{}, err
		}
		if count > 0 {
			return models.User{}, ErrConflict
		}
	}
	u.ID = 0
	u.IsActive = true
	if err := DB.Create(&u).Error; err != nil {
		// A concurrent insert can still hit the unique index after the checks
		// above; anything else is a real database failure, not a conflict.
		var mysqlErr *mysqldriver.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
			return models.User{}, ErrConflict
		}
		return models.User{}, err
	}
	return u, nil
}

func UpdateUser(id uint, fn func(u *models.User)) (models.User, bool) {
	var u models.User
	if err := DB.First(&u, id).Error; err != nil {
		return models.User{}, false
	}
	fn(&u)
	if err := DB.Save(&u).Error; err != nil {
		return models.User{}, false
	}
	return u, true
}

func CountUsers() (int64, error) {
	var n int64
	err := DB.Model(&models.User{}).Count(&n).Error
	return n, err
}

func CountUsersByRole(role models.UserRole) (int64, error) {
	var n int64
	err := DB.Model(&models.User{}).Where("role = ?", role).Count(&n).Error
	return n, err
}
