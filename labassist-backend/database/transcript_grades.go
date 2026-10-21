package database

import "labassist/models"

// TranscriptGrade returns the grade the student has on file for courseCode,
// as read from transcripts submitted on the grade-check page.
func TranscriptGrade(userID uint, courseCode string) (string, bool) {
	u, ok := UserByID(userID)
	if !ok {
		return "", false
	}
	grade, found := u.TranscriptGrades[courseCode]
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
	DB.Raw(`SELECT code, MIN(title) AS title FROM courses WHERE code IN ? GROUP BY code`, codes).Scan(&rows)
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

// SaveTranscriptGrade records one course's OCR-read grade among the
// student's transcript grades, replacing any earlier grade for that course.
func SaveTranscriptGrade(userID uint, courseCode, grade string) {
	UpdateUser(userID, func(u *models.User) {
		if u.TranscriptGrades == nil {
			u.TranscriptGrades = models.StringMap{}
		}
		if u.TranscriptOcrGrades == nil {
			u.TranscriptOcrGrades = models.StringMap{}
		}
		u.TranscriptGrades[courseCode] = grade
		u.TranscriptOcrGrades[courseCode] = grade
	})
}

// TranscriptGradeEdited reports whether the student's grade on file for
// courseCode was corrected by hand, and if so what OCR originally read.
func TranscriptGradeEdited(u models.User, courseCode string) (ocrGrade string, edited bool) {
	ocrGrade, ok := u.TranscriptOcrGrades[courseCode]
	return ocrGrade, ok && ocrGrade != u.TranscriptGrades[courseCode]
}
