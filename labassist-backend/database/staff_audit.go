package database

import "labassist/models"

// CreateStaffAuditLog records a significant action in the staff workflow audit trail.
func CreateStaffAuditLog(log models.StaffAuditLog) {
	log.ID = 0
	DB.Create(&log)
}

// StaffAuditLogsForCase returns all audit log entries for a staff case, newest first.
func StaffAuditLogsForCase(staffCaseID uint) []models.StaffAuditLog {
	var out []models.StaffAuditLog
	DB.Where("staff_case_id = ?", staffCaseID).Order("id DESC").Find(&out)
	return out
}
