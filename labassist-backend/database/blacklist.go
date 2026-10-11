package database

import (
	"labassist/models"
	"time"
)

func enrichBlacklist(b models.Blacklist) models.Blacklist {
	if u, ok := UserByID(b.StudentID); ok {
		b.StudentName = u.FullName
		if u.StudentID != nil {
			b.StudentCode = *u.StudentID
		}
	}
	if u, ok := UserByID(b.ReportedByID); ok {
		b.ReportedByName = u.FullName
	}
	if b.CourseID != nil {
		if c, ok := CourseByID(*b.CourseID); ok {
			b.CourseCode = c.Code
			b.CourseTitle = c.Title
			b.CourseSemester = c.Semester
			b.CourseYear = c.AcademicYear
		}
	}
	return b
}

func CreateBlacklist(b *models.Blacklist) error {
	return DB.Create(b).Error
}

// ActiveBlacklists returns every non-revoked entry, newest first — the shared
// list every instructor can see.
func ActiveBlacklists() ([]models.Blacklist, error) {
	rows := make([]models.Blacklist, 0)
	if err := DB.Where("revoked_at IS NULL").Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i] = enrichBlacklist(rows[i])
	}
	return rows, nil
}

// ActiveBlacklistsByStudent groups the active entries for the given students
// by student ID, for flagging applicants in one query.
func ActiveBlacklistsByStudent(studentIDs []uint) (map[uint][]models.Blacklist, error) {
	out := make(map[uint][]models.Blacklist)
	if len(studentIDs) == 0 {
		return out, nil
	}
	var rows []models.Blacklist
	if err := DB.Where("revoked_at IS NULL AND student_id IN ?", studentIDs).Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, b := range rows {
		out[b.StudentID] = append(out[b.StudentID], enrichBlacklist(b))
	}
	return out, nil
}

func BlacklistByID(id uint) (models.Blacklist, bool) {
	var b models.Blacklist
	if DB.First(&b, id).Error != nil {
		return b, false
	}
	return enrichBlacklist(b), true
}

// HasActiveBlacklistForApplication reports whether the Lab Boy job behind an
// application is already blacklisted, so the same incident isn't filed twice.
func HasActiveBlacklistForApplication(applicationID uint) (bool, error) {
	var n int64
	err := DB.Model(&models.Blacklist{}).Where("application_id = ? AND revoked_at IS NULL", applicationID).Count(&n).Error
	return n > 0, err
}

func RevokeBlacklist(id, revokedByID uint) error {
	now := time.Now()
	return DB.Model(&models.Blacklist{}).Where("id = ? AND revoked_at IS NULL", id).
		Updates(map[string]any{"revoked_at": now, "revoked_by_id": revokedByID}).Error
}
