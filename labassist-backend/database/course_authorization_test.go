package database

import (
	"labassist/models"
	"testing"
)

func TestInstructorOwnershipDoesNotTrustDisplayNames(t *testing.T) {
	course := models.Course{InstructorID: 12, InstructorsRaw: "Alice Example"}
	for _, tc := range []struct {
		name     string
		id       uint
		fullName string
		admin    bool
		want     bool
	}{
		{"owner after renaming", 12, "New Name", false, true},
		{"unrelated account", 34, "Other Name", false, false},
		{"impersonates imported instructor", 34, "Alice Example", false, false},
		{"administrator", 34, "Other Name", true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := InstructorOwnsCourse(course, tc.id, tc.fullName, tc.admin); got != tc.want {
				t.Fatalf("ownership = %v, want %v", got, tc.want)
			}
		})
	}
	if InstructorOwnsCourse(models.Course{}, 0, "", false) {
		t.Fatal("unassigned course must not authorize a zero account ID")
	}
}
