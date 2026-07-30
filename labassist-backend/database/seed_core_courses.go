package database

import "labassist/models"

// coreCourses lists the department's compulsory ("core") courses, used to
// check which of them a student's uploaded transcript covers. Intentionally
// left empty for now — the real list gets added here later, one entry per
// course, e.g.:
//
//	{"830101", "Introduction to Computer Science", "3(3-0-6)"},
var coreCourses = []models.CoreCourse{}

// seedCoreCourses inserts every entry in coreCourses that isn't already in
// the core_courses table (matched by Code). Safe to call on every startup;
// a no-op while coreCourses is empty.
func seedCoreCourses() error {
	for _, cc := range coreCourses {
		var count int64
		if err := DB.Model(&models.CoreCourse{}).Where("code = ?", cc.Code).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		if err := DB.Create(&cc).Error; err != nil {
			return err
		}
	}
	return nil
}
