package student

import (
	"labassist/database"
	"labassist/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

func filterFirstSemesterFreshmanCourses(student models.User, courses []models.Course) []models.Course {
	if student.StudentID == nil {
		return courses
	}
	out := courses[:0]
	for _, course := range courses {
		freshman, valid := database.IsFirstSemesterFreshman(*student.StudentID, course.Semester, course.AcademicYear)
		if !valid || !freshman {
			out = append(out, course)
		}
	}
	return out
}

// enrichConflicts stamps ScheduleMissing on each course whose term the student
// has no saved schedule for, and ConflictDay on each course that overlaps the
// student's confirmed term schedule, reusing cached lookups per term.
func enrichConflicts(studentID uint, courses []models.Course) []models.Course {
	type termKey struct {
		Semester     string
		AcademicYear int
	}
	cache := map[termKey]models.TermSchedule{}

	for i, course := range courses {
		k := termKey{course.Semester, course.AcademicYear}
		ts, seen := cache[k]
		if !seen {
			ts = database.TermScheduleByUserTerm(studentID, course.Semester, course.AcademicYear)
			cache[k] = ts
		}
		if !ts.Confirmed() {
			courses[i].ScheduleMissing = true
			continue
		}
		if day := database.ConflictingDay(course.Schedule, ts); day != "" {
			courses[i].ConflictDay = day
		}
	}
	return courses
}

// StudentCourses returns all open courses visible to the student, with
// ConflictDay set on any course whose schedule overlaps the student's
// confirmed term schedule so the frontend can render a disabled state.
func (h *Handler) StudentCourses(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)
	courses, err := database.ListCourses(c.Query("status"), c.Query("q"), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if student, ok := database.UserByID(sid); ok {
		courses = filterFirstSemesterFreshmanCourses(student, courses)
	}
	c.JSON(http.StatusOK, enrichConflicts(sid, courses))
}
