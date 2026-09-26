package models

import "testing"

func TestStudentViewHidesCancelledAcceptance(t *testing.T) {
	uid := uint(7)
	note := "x"
	cancelled := Application{Status: AppRejected, Cancelled: true, ReviewedByID: &uid, Note: &note, ReviewedByName: "อาจารย์"}
	got := cancelled.StudentView()
	if got.Status != AppPending || got.Cancelled || got.ReviewedByID != nil || got.Note != nil || got.ReviewedByName != "" {
		t.Fatalf("cancelled acceptance leaked to student: %+v", got)
	}

	rejected := Application{Status: AppRejected, ReviewedByID: &uid}
	if got := rejected.StudentView(); got.Status != AppRejected || got.ReviewedByID == nil {
		t.Fatalf("real rejection must stay rejected: %+v", got)
	}
}
