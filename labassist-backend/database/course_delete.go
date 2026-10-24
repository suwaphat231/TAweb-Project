package database

import (
	"errors"
	"fmt"
	"strings"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CourseDeleteBlockedError says why an admin cannot delete a course. It
// unwraps to ErrConflict.
type CourseDeleteBlockedError struct {
	Reasons []string
}

func (e *CourseDeleteBlockedError) Error() string {
	return "ลบไม่ได้: " + strings.Join(e.Reasons, ", ")
}

func (e *CourseDeleteBlockedError) Unwrap() error { return ErrConflict }

// SkippedCourse is a course a bulk delete left in place, and why.
type SkippedCourse struct {
	ID      uint   `json:"id"`
	Code    string `json:"code"`
	Section int    `json:"section"`
	Title   string `json:"title"`
	Reason  string `json:"reason"`
}

// courseDeleteBlockers lists what keeps an admin from deleting a course:
// recruitment that is open right now, and any record that must be kept —
// pending, accepted or rejected applications, earlier rounds that were not
// withdrawals, staff reviews and documents, Lab Boy work and reports.
// Applications the students withdrew do not block deletion.
func courseDeleteBlockers(tx *gorm.DB, id uint) ([]string, error) {
	postings := tx.Model(&models.Posting{}).Select("id").Where("course_id = ?", id)
	byCourse := func(table string) *gorm.DB {
		return tx.Table(table).Where("course_id = ? OR posting_id IN (?)", id, postings)
	}

	var reasons []string
	var n int64

	if err := tx.Model(&models.Posting{}).
		Where("course_id = ? AND is_active = ? AND status IN ?", id, true,
			[]models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
		Count(&n).Error; err != nil {
		return nil, err
	}
	if n > 0 {
		reasons = append(reasons, "อาจารย์เปิดรับสมัครอยู่ (ให้อาจารย์ปิดหรือลบประกาศก่อน)")
	}

	var apps []struct {
		Status models.AppStatus
		N      int64
	}
	if err := byCourse("applications").Select("status, COUNT(*) AS n").
		Where("status <> ?", models.AppWithdrawn).Group("status").Scan(&apps).Error; err != nil {
		return nil, err
	}
	appLabels := map[models.AppStatus]string{
		models.AppPending:  "ใบสมัครที่รอพิจารณา",
		models.AppAccepted: "นักศึกษาที่รับแล้ว",
		models.AppRejected: "ใบสมัครที่ไม่ผ่านการคัดเลือก",
	}
	for _, a := range apps {
		label := appLabels[a.Status]
		if label == "" {
			label = "ใบสมัคร"
		}
		reasons = append(reasons, fmt.Sprintf("มี%s %d รายการ", label, a.N))
	}

	checks := []struct {
		query *gorm.DB
		label string
	}{
		{byCourse("application_history").Where("status <> ?", string(models.AppWithdrawn)), "ประวัติการสมัครรอบก่อน"},
		{byCourse("form_reviews"), "แบบฟอร์มที่เจ้าหน้าที่ตรวจแล้ว"},
		{byCourse("staff_documents"), "เอกสารของเจ้าหน้าที่"},
		{tx.Table("staff_cases").Where("course_id = ? AND id NOT IN (?)", id, emptyStaffCases(tx, id)), "งานจ้าง Lab Boy ของเจ้าหน้าที่"},
		{tx.Table("labboy_reports").Where("course_id = ?", id), "รายงาน Lab Boy"},
	}
	for _, c := range checks {
		if !tx.Migrator().HasTable(c.query.Statement.Table) {
			continue // a feature's table not created in this database
		}
		if err := c.query.Count(&n).Error; err != nil {
			return nil, err
		}
		if n > 0 {
			reasons = append(reasons, fmt.Sprintf("มี%s %d รายการ", c.label, n))
		}
	}
	return reasons, nil
}

// staffCaseChildren are the tables that hold a staff case's actual work. A
// case with rows in none of them is the empty shell opened with a posting.
var staffCaseChildren = []string{
	"staff_case_schedule_groups", "work_occurrences", "monthly_periods",
	"staff_documents", "staff_audit_logs", "calendar_dates",
}

// emptyStaffCases is a subquery of the course's staff cases that hold no
// work yet, so they neither block nor survive a course delete.
func emptyStaffCases(tx *gorm.DB, courseID uint) *gorm.DB {
	q := tx.Table("staff_cases").Select("id").Where("course_id = ?", courseID)
	for _, table := range staffCaseChildren {
		if tx.Migrator().HasTable(table) {
			q = q.Where("NOT EXISTS (SELECT 1 FROM " + table + " c WHERE c.staff_case_id = staff_cases.id)")
		}
	}
	return q
}

// adminDeleteCourseTx deletes a course for an admin. Nothing is written
// unless every check passes; the withdrawn applications (and withdrawn
// earlier rounds) are removed together with the course.
func adminDeleteCourseTx(tx *gorm.DB, id uint) error {
	var course models.Course
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&course, id).Error; err != nil {
		return err
	}
	reasons, err := courseDeleteBlockers(tx, id)
	if err != nil {
		return err
	}
	if len(reasons) > 0 {
		return &CourseDeleteBlockedError{Reasons: reasons}
	}

	postings := tx.Model(&models.Posting{}).Select("id").Where("course_id = ?", id)
	if err := tx.Where("(course_id = ? OR posting_id IN (?)) AND status = ?", id, postings, models.AppWithdrawn).
		Delete(&models.ApplicationHistory{}).Error; err != nil {
		return err
	}
	if err := tx.Where("(course_id = ? OR posting_id IN (?)) AND status = ?", id, postings, models.AppWithdrawn).
		Delete(&models.Application{}).Error; err != nil {
		return err
	}
	if err := tx.Model(&models.Notification{}).Where("course_id = ?", id).Update("course_id", nil).Error; err != nil {
		return err
	}
	if tx.Migrator().HasTable("course_edit_requests") {
		if err := tx.Where("course_id = ?", id).Delete(&models.CourseEditRequest{}).Error; err != nil {
			return err
		}
	}
	if tx.Migrator().HasTable("staff_cases") {
		var empty []uint
		if err := emptyStaffCases(tx, id).Pluck("id", &empty).Error; err != nil {
			return err
		}
		if len(empty) > 0 {
			if err := tx.Exec("DELETE FROM staff_cases WHERE id IN ?", empty).Error; err != nil {
				return err
			}
		}
	}
	if err := tx.Where("course_id = ?", id).Delete(&models.Posting{}).Error; err != nil {
		return err
	}
	return tx.Delete(&course).Error
}

// DeleteCourse deletes one course for an admin. A *CourseDeleteBlockedError
// explains a refusal; gorm.ErrRecordNotFound means there is no such course.
func DeleteCourse(id uint) error {
	return DB.Transaction(func(tx *gorm.DB) error { return adminDeleteCourseTx(tx, id) })
}

// DeleteCoursesByTerm deletes every course of a term an admin may delete and
// reports the ones it left in place with the reason.
func DeleteCoursesByTerm(semester string, academicYear int) (int, []SkippedCourse, error) {
	deleted := 0
	skipped := []SkippedCourse{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var courses []models.Course
		if err := tx.Where("semester = ? AND academic_year = ?", semester, academicYear).
			Order("code, section, id").Find(&courses).Error; err != nil {
			return err
		}
		for _, c := range courses {
			err := adminDeleteCourseTx(tx, c.ID)
			var blocked *CourseDeleteBlockedError
			if errors.As(err, &blocked) {
				skipped = append(skipped, SkippedCourse{
					ID: c.ID, Code: c.Code, Section: c.Section, Title: c.Title,
					Reason: strings.Join(blocked.Reasons, ", "),
				})
				continue
			}
			if err != nil {
				return err
			}
			deleted++
		}
		return nil
	})
	if err != nil {
		return 0, nil, err
	}
	return deleted, skipped, nil
}
