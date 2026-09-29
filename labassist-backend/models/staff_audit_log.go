package models

import "time"

// StaffAuditLog records significant actions in the staff document workflow.
// Financial documents and audit entries are never hard-deleted.
type StaffAuditLog struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	StaffCaseID *uint     `gorm:"index" json:"staff_case_id,omitempty"`
	EntityType  string    `gorm:"size:50;not null;index" json:"entity_type"`
	EntityID    uint      `gorm:"not null" json:"entity_id"`
	Action      string    `gorm:"size:100;not null" json:"action"`
	ActorID     uint      `gorm:"not null" json:"actor_id"`
	ActorName   string    `gorm:"size:200" json:"actor_name"`
	OldValue    string    `gorm:"type:text" json:"old_value,omitempty"`
	NewValue    string    `gorm:"type:text" json:"new_value,omitempty"`
	Reason      string    `gorm:"size:500" json:"reason,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (StaffAuditLog) TableName() string { return "staff_audit_logs" }
