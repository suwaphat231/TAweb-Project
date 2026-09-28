package database

import (
	"labassist/models"
	"testing"
)

func ptrUint(n uint) *uint { return &n }

// TestInstructorOwnershipEdgeCases tests the edge cases that don't require a
// database connection: admin always gets access, zero ID and nil DB never do.
// Full ownership is now enforced via the course_instructors M:N table, so the
// deep ownership assertions require an integration test with a real DB.
func TestInstructorOwnershipEdgeCases(t *testing.T) {
	course := models.Course{ID: 99, InstructorID: ptrUint(12)}

	// Admin always gets access regardless of DB state.
	if !InstructorOwnsCourse(course, 34, "", true) {
		t.Fatal("admin must always be authorized")
	}

	// Zero instructorID is always denied — prevents anonymous authorization.
	if InstructorOwnsCourse(course, 0, "", false) {
		t.Fatal("zero instructorID must never be authorized")
	}

	// DB == nil → safe fallback to false (startup safety).
	// DB is nil in unit tests, so any non-admin/non-zero call returns false.
	if InstructorOwnsCourse(course, 12, "", false) {
		t.Fatal("ownership check with nil DB must return false, not panic")
	}

	// Unassigned course with zero ID also stays false.
	if InstructorOwnsCourse(models.Course{}, 0, "", false) {
		t.Fatal("unassigned course must not authorize a zero account ID")
	}
}
