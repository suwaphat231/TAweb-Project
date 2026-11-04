package database

import (
	"testing"
	"time"

	"labassist/models"
)

func TestAddTranscriptGradeKeepsGradeOnFile(t *testing.T) {
	confirmed := time.Now()
	// The student corrected OCR's "C" to "C+" and confirmed it.
	u := models.User{
		TranscriptGrades:      models.StringMap{"520322": "C+"},
		TranscriptOcrGrades:   models.StringMap{"520322": "C"},
		TranscriptConfirmedAt: &confirmed,
	}

	if addTranscriptGrade(&u, "520322", "B") {
		t.Fatal("added a grade for a course already on file")
	}
	if u.TranscriptGrades["520322"] != "C+" || u.TranscriptOcrGrades["520322"] != "C" {
		t.Errorf("grades changed: %v / %v", u.TranscriptGrades, u.TranscriptOcrGrades)
	}
	if u.TranscriptConfirmedAt == nil {
		t.Error("confirmation was cleared")
	}
	if _, edited := TranscriptGradeEdited(u, "520322"); !edited {
		t.Error("the student's correction is no longer flagged")
	}
}

func TestAddTranscriptGradeAddsNewCourse(t *testing.T) {
	confirmed := time.Now()
	u := models.User{
		TranscriptGrades:      models.StringMap{"520322": "C+"},
		TranscriptOcrGrades:   models.StringMap{"520322": "C"},
		TranscriptConfirmedAt: &confirmed,
	}

	if !addTranscriptGrade(&u, "520343", "B+") {
		t.Fatal("did not add a course with no grade on file")
	}
	if u.TranscriptGrades["520343"] != "B+" || u.TranscriptOcrGrades["520343"] != "B+" {
		t.Errorf("new grade not recorded: %v / %v", u.TranscriptGrades, u.TranscriptOcrGrades)
	}
	if u.TranscriptGrades["520322"] != "C+" {
		t.Error("other courses changed")
	}
	// Only the new course needs checking; the confirmed ones stay confirmed.
	if u.TranscriptConfirmedAt == nil {
		t.Error("adding one course unconfirmed the whole set")
	}
	if len(u.TranscriptPendingGrades) != 1 || u.TranscriptPendingGrades["520343"] != "B+" {
		t.Errorf("pending = %v, want only 520343", u.TranscriptPendingGrades)
	}
}

func TestAddTranscriptGradeKeepsUncheckedOcrGrade(t *testing.T) {
	// OCR read "C" from the grade-check upload and the student hasn't checked
	// it yet: a different reading from an application image doesn't replace
	// it — the student checks the grade and confirms it themselves.
	u := models.User{
		TranscriptGrades:    models.StringMap{"520322": "C"},
		TranscriptOcrGrades: models.StringMap{"520322": "C"},
	}
	if addTranscriptGrade(&u, "520322", "C+") || u.TranscriptGrades["520322"] != "C" {
		t.Errorf("unchecked grade overwritten: %v", u.TranscriptGrades)
	}
}

func TestAddTranscriptGradeToUnconfirmedSet(t *testing.T) {
	// Nothing is confirmed yet, so the whole set is waiting to be checked —
	// no course is tracked as pending on its own.
	u := models.User{TranscriptGrades: models.StringMap{"520322": "C"}}
	if !addTranscriptGrade(&u, "520343", "B+") {
		t.Fatal("did not add a course with no grade on file")
	}
	if u.TranscriptConfirmedAt != nil || len(u.TranscriptPendingGrades) != 0 {
		t.Errorf("confirmed = %v, pending = %v", u.TranscriptConfirmedAt, u.TranscriptPendingGrades)
	}
}

func TestAddTranscriptGradeWithNoTranscript(t *testing.T) {
	var u models.User
	if !addTranscriptGrade(&u, "517121", "D+") || u.TranscriptGrades["517121"] != "D+" {
		t.Errorf("grade not recorded on an empty profile: %v", u.TranscriptGrades)
	}
}
