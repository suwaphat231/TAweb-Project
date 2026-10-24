package database

import (
	"fmt"
	"strings"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// UserDeleteBlockedError says why an admin cannot delete a user. It unwraps
// to ErrConflict.
type UserDeleteBlockedError struct {
	Reasons []string
}

func (e *UserDeleteBlockedError) Error() string {
	return "ลบไม่ได้: " + strings.Join(e.Reasons, ", ")
}

func (e *UserDeleteBlockedError) Unwrap() error { return ErrConflict }

// userRecordRefs are the records that must outlive the account that made or
// owns them, so any of them keeps an admin from deleting the user.
var userRecordRefs = []struct {
	table, where, label string
}{
	{"courses", "instructor_id = ?", "เป็นผู้สอนหลักของรายวิชา"},
	{"course_instructors", "instructor_id = ?", "เป็นผู้สอนของรายวิชา"},
	{"applications", "student_id = ?", "มีใบสมัคร"},
	{"application_history", "student_id = ?", "มีประวัติการสมัคร"},
	{"schedule_group_assignments", "student_id = ?", "มีการจัดกลุ่มปฏิบัติงาน Lab Boy"},
	{"blacklists", "student_id = ? OR reported_by_id = ? OR revoked_by_id = ?", "มีประวัติ blacklist"},
	{"labboy_reports", "student_id = ? OR reporter_id = ?", "มีรายงาน Lab Boy"},
	{"labboy_report_responses", "author_id = ?", "มีคำชี้แจงรายงาน Lab Boy"},
	{"labboy_report_evidence", "uploaded_by_id = ?", "มีหลักฐานรายงาน Lab Boy"},
	{"labboy_report_reviews", "reviewer_id = ?", "มีผลพิจารณารายงาน Lab Boy"},
	{"labboy_report_status_history", "actor_id = ?", "มีประวัติสถานะรายงาน Lab Boy"},
	{"form_reviews", "reviewer_id = ?", "มีแบบฟอร์มที่ตรวจแล้ว"},
	{"staff_documents", "staff_id = ? OR signed_by_id = ?", "มีเอกสารของเจ้าหน้าที่"},
	{"staff_cases", "created_by_id = ? OR plan_locked_by_id = ?", "มีงานจ้าง Lab Boy"},
	{"staff_case_schedule_groups", "locked_by_id = ?", "มีกลุ่มปฏิบัติงานที่ล็อกไว้"},
	{"staff_audit_logs", "actor_id = ?", "มีบันทึกการทำงานของเจ้าหน้าที่"},
	{"monthly_periods", "closed_by_id = ?", "มีงวดเดือนที่ปิดแล้ว"},
	{"work_occurrences", "updated_by_id = ?", "มีบันทึกวันปฏิบัติงาน"},
	{"calendar_dates", "created_by_id = ?", "มีวันในปฏิทินที่สร้างไว้"},
}

// userPersonalTables hold data that belongs only to the user and goes with
// the account (the FKs cascade too; this covers databases without them).
var userPersonalTables = []string{
	"notifications", "transcripts", "transcript_images", "class_schedules",
	"term_schedules", "student_info_documents",
}

func userDeleteBlockers(tx *gorm.DB, id uint) ([]string, error) {
	var reasons []string
	for _, ref := range userRecordRefs {
		if !tx.Migrator().HasTable(ref.table) {
			continue // a feature's table not created in this database
		}
		args := make([]any, strings.Count(ref.where, "?"))
		for i := range args {
			args[i] = id
		}
		var n int64
		if err := tx.Table(ref.table).Where(ref.where, args...).Count(&n).Error; err != nil {
			return nil, err
		}
		if n > 0 {
			reasons = append(reasons, fmt.Sprintf("%s %d รายการ", ref.label, n))
		}
	}
	return reasons, nil
}

// DeleteUser removes an account that has no records worth keeping. A
// *UserDeleteBlockedError explains a refusal; gorm.ErrRecordNotFound means
// there is no such user.
func DeleteUser(id uint) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, id).Error; err != nil {
			return err
		}
		reasons, err := userDeleteBlockers(tx, id)
		if err != nil {
			return err
		}
		if len(reasons) > 0 {
			return &UserDeleteBlockedError{Reasons: reasons}
		}

		for _, table := range userPersonalTables {
			if !tx.Migrator().HasTable(table) {
				continue
			}
			if err := tx.Exec("DELETE FROM "+table+" WHERE user_id = ?", id).Error; err != nil {
				return err
			}
		}
		for _, table := range []string{"applications", "application_history"} {
			if err := tx.Table(table).Where("reviewed_by_id = ?", id).Update("reviewed_by_id", nil).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&user).Error
	})
}
