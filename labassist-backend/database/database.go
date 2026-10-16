package database

import (
	"errors"
	"regexp"
	"strconv"
	"time"

	"labassist/models"
)

// labCreditRe matches the "(lecture-lab-self_study)" part of a credit string.
var labCreditRe = regexp.MustCompile(`\((\d+)-(\d+)-(\d+)\)`)

// LabHoursFromCredits parses a credit string like "3 (2-3-6)" and returns the
// lab-hour component (the middle number). Returns -1 when the format cannot be
// parsed — callers should treat -1 as "unknown" and not filter the course out.
func LabHoursFromCredits(credits string) int {
	m := labCreditRe.FindStringSubmatch(credits)
	if m == nil {
		return -1
	}
	n, _ := strconv.Atoi(m[2])
	return n
}

var ErrConflict = errors.New("conflict")

// ErrWithdrawalClosed is returned by WithdrawApplication when an accepted
// student tries to withdraw after the instructor has manually closed the posting.
var ErrWithdrawalClosed = errors.New("withdrawal not allowed after instructor closed the posting")

// bangkokLoc is UTC+7 with no DST — matches Asia/Bangkok without requiring
// the system timezone database (safe in slim Docker images).
var bangkokLoc = time.FixedZone("Asia/Bangkok", 7*60*60)

// applyPostingToCourse copies the recruitment-round fields from a Posting onto
// the Course's gorm:"-" fields so callers get a fully populated Course value
// without a separate Posting lookup.
func applyPostingToCourse(p models.Posting, c *models.Course) {
	c.PostingID = p.ID
	c.LabBoySlots = p.LabBoySlots
	c.LabBoyAccepted = p.LabBoyAccepted
	c.Status = p.Status
	c.Deadline = p.Deadline
	c.Description = p.Description
	c.Requirements = p.Requirements
	c.RequireGradeProof = p.RequireGradeProof
	c.ClosedByInstructor = p.ClosedByInstructor
	c.LabBoyScheduleConfirmed = p.LabBoyScheduleConfirmed
}

// closeIfPastDeadline flips an open/closing_soon posting to closed once its
// deadline has passed, persisting the change to the postings table so every
// caller sees it closed without needing a background job. Runs lazily on read
// via courseWithInstructor, the one chokepoint every course-returning query
// already passes through.
func closeIfPastDeadline(c models.Course) models.Course {
	if c.Deadline == nil || (c.Status != models.StatusOpen && c.Status != models.StatusClosingSoon) {
		return c
	}
	d := c.Deadline.In(bangkokLoc)
	endOfDeadline := time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, bangkokLoc)
	if time.Now().After(endOfDeadline) {
		c.Status = models.StatusClosed
		DB.Model(&models.Posting{}).
			Where("id = ? AND status IN ?", c.PostingID, []models.CourseStatus{models.StatusOpen, models.StatusClosingSoon}).
			Update("status", models.StatusClosed)
	}
	return c
}

func courseWithInstructor(c models.Course) models.Course {
	if p, ok := ActivePostingForCourse(c.ID); ok {
		applyPostingToCourse(p, &c)
	}
	// Per-row enrichment has no error path; a failed count shows as 0 and the
	// failure itself is logged by gormLogger.
	c.ApplicantCount, _ = countNonWithdrawnApplications(c.ID)
	c = closeIfPastDeadline(c)
	if c.InstructorID != nil {
		if u, ok := UserByID(*c.InstructorID); ok {
			c.InstructorName = u.FullName
		}
	}
	return c
}

func countNonWithdrawnApplications(courseID uint) (int, error) {
	var n int64
	if p, ok := ActivePostingForCourse(courseID); ok {
		if err := DB.Model(&models.Application{}).Where("posting_id = ? AND status <> ?", p.ID, models.AppWithdrawn).Count(&n).Error; err != nil {
			return 0, err
		}
	}
	return int(n), nil
}

func enrichApplication(a models.Application) models.Application {
	if u, ok := UserByID(a.StudentID); ok {
		a.StudentName = u.FullName
		if u.StudentID != nil {
			a.StudentCode = *u.StudentID
		}
		if u.GPA != nil {
			a.StudentGPA = *u.GPA
		}
		a.StudentEmail = u.Email
		if u.Faculty != nil {
			a.StudentFaculty = *u.Faculty
		}
		if u.Year != nil {
			a.StudentYear = int(*u.Year)
		}
	}
	// Resolve course from the application's own recruitment round so CourseID
	// is populated correctly even after ResetCourseToDraft creates new postings.
	if p, ok := postingByID(a.PostingID); ok {
		a.PostingActive = p.IsActive
		a.RequireGradeProof = p.RequireGradeProof
		a.CourseID = p.CourseID
		if c, ok := CourseByID(p.CourseID); ok {
			a.CourseCode = c.Code
			a.CourseTitle = c.Title
			a.CourseEnglishTitle = c.EnglishTitle
			a.CourseSection = c.Section
			a.CourseSchedule = c.Schedule
		}
	} else if c, ok := CourseByID(a.CourseID); ok {
		// Fallback for legacy rows where posting_id was not yet set.
		a.CourseCode = c.Code
		a.CourseTitle = c.Title
		a.CourseEnglishTitle = c.EnglishTitle
		a.CourseSection = c.Section
		a.CourseSchedule = c.Schedule
	}
	if a.ReviewedByID != nil {
		if u, ok := UserByID(*a.ReviewedByID); ok {
			a.ReviewedByName = u.FullName
		}
	}
	a.HasGradeProof = len(a.GradeProofData) > 0
	return a
}

// postingByID returns a Posting by its primary key.
func postingByID(id uint) (models.Posting, bool) {
	if id == 0 {
		return models.Posting{}, false
	}
	var p models.Posting
	if DB.First(&p, id).Error != nil {
		return models.Posting{}, false
	}
	return p, true
}
