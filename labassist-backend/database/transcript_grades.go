package database

import (
	"strings"

	"labassist/models"
)

// TranscriptGrade returns the grade the student has on file for courseCode,
// as read from transcripts submitted on the grade-check page.
func TranscriptGrade(userID uint, courseCode string) (string, bool) {
	u, ok := UserByID(userID)
	if !ok {
		return "", false
	}
	grade, found := u.TranscriptGrades[courseCode]
	if !found || grade == "" {
		if idx := strings.IndexAny(courseCode, "-,"); idx != -1 {
			base := strings.TrimSpace(courseCode[:idx])
			grade, found = u.TranscriptGrades[base]
		}
	}
	return grade, found && grade != ""
}

// WithTranscriptCourseTitles fills in the names of the courses the student
// has transcript grades for, from the core course catalog or else the
// courses table.
func WithTranscriptCourseTitles(u models.User) models.User {
	if len(u.TranscriptGrades) == 0 {
		return u
	}
	codes := make([]string, 0, len(u.TranscriptGrades))
	for code := range u.TranscriptGrades {
		codes = append(codes, code)
	}
	var rows []struct{ Code, Title string }
	// Classlist codes carry the curriculum ("520321-165, -2560"); transcript
	// grades are keyed by the 6-digit code alone.
	DB.Raw(`SELECT LEFT(code, 6) AS code, MIN(title) AS title FROM courses
		WHERE LEFT(code, 6) IN ? GROUP BY LEFT(code, 6)`, codes).Scan(&rows)
	titles := make(map[string]string, len(codes))
	for _, r := range rows {
		titles[r.Code] = r.Title
	}
	// Core course titles are written for the transcript, so they win.
	rows = nil
	DB.Raw(`SELECT code, MIN(title) AS title FROM core_courses WHERE code IN ? GROUP BY code`, codes).Scan(&rows)
	for _, r := range rows {
		titles[r.Code] = r.Title
	}
	u.TranscriptCourseTitles = titles
	return u
}

// SaveTranscriptGrade records one course's OCR-read grade (from a grade-proof
// image attached to an application) among the student's transcript grades,
// so later postings of the course can reuse it. A course already on file is
// left alone: its grade came from the grade-check page, where the student may
// have confirmed or corrected it, and one application image must not undo that.
func SaveTranscriptGrade(userID uint, courseCode, grade string) {
	u, ok := UserByID(userID)
	if !ok || !canAddTranscriptGrade(u, courseCode) {
		return
	}
	UpdateUser(userID, func(u *models.User) {
		addTranscriptGrade(u, courseCode, grade)
	})
}

func canAddTranscriptGrade(u models.User, courseCode string) bool {
	_, onFile := u.TranscriptGrades[courseCode]
	return !onFile
}

// addTranscriptGrade adds a course the student has no grade for yet. Returns
// false, changing nothing, when the course is already on file.
func addTranscriptGrade(u *models.User, courseCode, grade string) bool {
	if !canAddTranscriptGrade(*u, courseCode) {
		return false
	}
	if u.TranscriptGrades == nil {
		u.TranscriptGrades = models.StringMap{}
	}
	if u.TranscriptOcrGrades == nil {
		u.TranscriptOcrGrades = models.StringMap{}
	}
	u.TranscriptGrades[courseCode] = grade
	u.TranscriptOcrGrades[courseCode] = grade
	// The new grade is an unchecked OCR reading. When the rest were already
	// confirmed, mark only this course for checking so they stay confirmed;
	// otherwise the whole set is still waiting to be checked anyway.
	if u.TranscriptConfirmedAt != nil {
		if u.TranscriptPendingGrades == nil {
			u.TranscriptPendingGrades = models.StringMap{}
		}
		u.TranscriptPendingGrades[courseCode] = grade
	}
	return true
}

// TranscriptGradeEdited reports whether the student's grade on file for
// courseCode was corrected by hand, and if so what OCR originally read.
func TranscriptGradeEdited(u models.User, courseCode string) (ocrGrade string, edited bool) {
	ocrGrade, ok := u.TranscriptOcrGrades[courseCode]
	return ocrGrade, ok && ocrGrade != u.TranscriptGrades[courseCode]
}
