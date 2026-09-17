package database

import (
	"fmt"
	"sort"
	"time"

	"labassist/models"
)

// WorkSession is one lab-assistant session derived from a StaffDocument that
// includes the student in its roster. DocumentType lets the frontend know
// which document type generated the session (for display/filtering).
type WorkSession struct {
	CourseID        uint           `json:"course_id"`
	CourseCode      string         `json:"course_code"`
	CourseTitle     string         `json:"course_title"`
	CourseSection   int            `json:"course_section"`
	Semester        string         `json:"semester"`
	AcademicYear    int            `json:"academic_year"`
	DocumentID      uint           `json:"document_id"`
	DocumentType    models.DocType `json:"document_type"`
	SessionDate     string         `json:"session_date"` // YYYY-MM-DD (CE)
	WorkDay         string         `json:"work_day"`
	WorkTimeStart   string         `json:"work_time_start"`
	WorkTimeEnd     string         `json:"work_time_end"`
	HoursPerSession float64        `json:"hours_per_session"`
}

// WorkScheduleForStudent returns every work session found in StaffDocuments
// where the student (by userID) appears as an accepted Lab Boy in the roster.
// Sessions are deduplicated by (course, date) — multiple document types can
// cover the same period — and returned sorted oldest-first.
func WorkScheduleForStudent(studentUserID uint) []WorkSession {
	var apps []models.Application
	DB.Where("student_id = ? AND status = ?", studentUserID, models.AppAccepted).Find(&apps)
	if len(apps) == 0 {
		return []WorkSession{}
	}

	courseIDs := make([]uint, 0, len(apps))
	for _, a := range apps {
		courseIDs = append(courseIDs, a.CourseID)
	}

	var docs []models.StaffDocument
	DB.Where("course_id IN ?", courseIDs).Find(&docs)

	seen := make(map[string]bool)
	out := make([]WorkSession, 0)

	for _, doc := range docs {
		if doc.Period == nil || len(doc.SessionDates) == 0 || doc.CourseID == nil {
			continue
		}
		inRoster := false
		for _, entry := range doc.Roster {
			if entry.StudentID == studentUserID {
				inRoster = true
				break
			}
		}
		if !inRoster {
			continue
		}

		course, _ := CourseByID(*doc.CourseID)
		ceYear := doc.Period.Year - 543

		for _, day := range doc.SessionDates {
			dateStr := time.Date(ceYear, time.Month(doc.Period.Month), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
			key := fmt.Sprintf("%d_%s", *doc.CourseID, dateStr)
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, WorkSession{
				CourseID:        *doc.CourseID,
				CourseCode:      course.Code,
				CourseTitle:     course.Title,
				CourseSection:   course.Section,
				Semester:        course.Semester,
				AcademicYear:    course.AcademicYear,
				DocumentID:      doc.ID,
				DocumentType:    doc.Type,
				SessionDate:     dateStr,
				WorkDay:         doc.WorkDay,
				WorkTimeStart:   doc.WorkTimeStart,
				WorkTimeEnd:     doc.WorkTimeEnd,
				HoursPerSession: doc.HoursPerSession,
			})
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].SessionDate < out[j].SessionDate
	})
	return out
}
