package database

import (
	"slices"
	"sort"
	"strings"

	"labassist/models"
)

// WorkSession is one Lab Boy work day from the staff's work plan.
type WorkSession struct {
	CourseID      uint   `json:"course_id"`
	CourseCode    string `json:"course_code"`
	CourseTitle   string `json:"course_title"`
	CourseSection int    `json:"course_section"`
	Semester      string `json:"semester"`
	AcademicYear  int    `json:"academic_year"`
	SessionDate   string `json:"session_date"` // YYYY-MM-DD (CE)
	WorkDay       string `json:"work_day"`     // MON..SUN
	WorkTimeStart string `json:"work_time_start"`
	WorkTimeEnd   string `json:"work_time_end"`
	// Status is scheduled, completed or absent.
	Status          models.OccurrenceStatus `json:"status"`
	IsMakeup        bool                    `json:"is_makeup"`
	HoursPerSession float64                 `json:"hours_per_session"`
}

// LabBoyAssignment is a course where the student is an accepted Lab Boy and
// staff have confirmed the work schedule.
type LabBoyAssignment struct {
	CourseID       uint   `json:"course_id"`
	CourseCode     string `json:"course_code"`
	CourseTitle    string `json:"course_title"`
	CourseSection  int    `json:"course_section"`
	CourseSchedule string `json:"course_schedule"`
	Semester       string `json:"semester"`
	AcademicYear   int    `json:"academic_year"`
}

// LabBoyAssignmentsForStudent returns all courses where the student has an
// accepted application and staff have confirmed the schedule.
func LabBoyAssignmentsForStudent(studentUserID uint) ([]LabBoyAssignment, error) {
	var apps []models.Application
	if err := DB.Where("student_id = ? AND status = ?", studentUserID, models.AppAccepted).Find(&apps).Error; err != nil {
		return nil, err
	}
	out := make([]LabBoyAssignment, 0, len(apps))
	for _, app := range apps {
		// Read schedule-confirmed flag from the posting.
		p, ok := postingByID(app.PostingID)
		if !ok {
			// Fallback: check active posting for the course (legacy row).
			if app.CourseID != 0 {
				p, ok = ActivePostingForCourse(app.CourseID)
			}
			if !ok {
				continue
			}
		}
		if !p.IsActive || !p.LabBoyScheduleConfirmed {
			continue
		}
		courseID := p.CourseID
		if courseID == 0 {
			courseID = app.CourseID
		}
		course, ok := CourseByID(courseID)
		if !ok {
			continue
		}
		out = append(out, LabBoyAssignment{
			CourseID:       course.ID,
			CourseCode:     course.Code,
			CourseTitle:    course.Title,
			CourseSection:  course.Section,
			CourseSchedule: course.Schedule,
			Semester:       course.Semester,
			AcademicYear:   course.AcademicYear,
		})
	}
	return out, nil
}

// WorkScheduleForStudent returns the student's work days from the work plan
// of every course where they are an accepted Lab Boy and staff have confirmed
// the schedule, oldest first. Days cancelled for a holiday are left out; a
// makeup day shows up as its own session. A schedule group with students
// assigned covers only them; one without covers every Lab Boy of the course.
func WorkScheduleForStudent(studentUserID uint) ([]WorkSession, error) {
	var apps []models.Application
	if err := DB.Where("student_id = ? AND status = ?", studentUserID, models.AppAccepted).Find(&apps).Error; err != nil {
		return nil, err
	}
	out := make([]WorkSession, 0)
	for _, app := range apps {
		p, ok := postingByID(app.PostingID)
		if !ok || !p.IsActive || !p.LabBoyScheduleConfirmed {
			continue
		}
		sc, ok := StaffCaseByPostingID(p.ID)
		if !ok {
			continue
		}
		course, ok := CourseByID(p.CourseID)
		if !ok {
			continue
		}
		groups, err := ScheduleGroupsForCase(sc.ID)
		if err != nil {
			return nil, err
		}
		mine := make(map[uint]bool, len(groups))
		groupHours := make(map[uint]float64, len(groups))
		for _, g := range groups {
			ids, err := GroupStudentIDs(g.ID)
			if err != nil {
				return nil, err
			}
			mine[g.ID] = len(ids) == 0 || slices.Contains(ids, studentUserID)
			groupHours[g.ID] = g.HoursPerSession
		}
		var occs []models.WorkOccurrence
		if err := DB.Where("staff_case_id = ? AND status IN ?", sc.ID, []models.OccurrenceStatus{
			models.OccurrenceScheduled, models.OccurrenceCompleted, models.OccurrenceAbsent,
		}).Order("scheduled_date, start_time").Find(&occs).Error; err != nil {
			return nil, err
		}
		for _, o := range occs {
			if o.ScheduleGroupID != nil && !mine[*o.ScheduleGroupID] {
				continue
			}
			hours := o.ActualHours
			if hours == 0 && o.ScheduleGroupID != nil {
				hours = groupHours[*o.ScheduleGroupID]
			}
			if hours == 0 {
				hours = sc.HoursPerSession
			}
			if hours == 0 {
				hours = occurrenceHours(o.StartTime, o.EndTime)
			}
			out = append(out, WorkSession{
				CourseID:        course.ID,
				CourseCode:      course.Code,
				CourseTitle:     course.Title,
				CourseSection:   course.Section,
				Semester:        course.Semester,
				AcademicYear:    course.AcademicYear,
				SessionDate:     o.ScheduledDate.Format("2006-01-02"),
				WorkDay:         strings.ToUpper(o.ScheduledDate.Weekday().String()[:3]),
				WorkTimeStart:   o.StartTime,
				WorkTimeEnd:     o.EndTime,
				Status:          o.Status,
				IsMakeup:        o.RescheduledFromOccurrenceID != nil,
				HoursPerSession: hours,
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SessionDate != out[j].SessionDate {
			return out[i].SessionDate < out[j].SessionDate
		}
		return out[i].WorkTimeStart < out[j].WorkTimeStart
	})
	return out, nil
}
