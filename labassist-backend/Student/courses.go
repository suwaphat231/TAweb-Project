package student

import (
	"labassist/database"
	"labassist/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// enrichConflicts stamps ConflictDay on each course that overlaps the student's
// confirmed term schedule, reusing cached TermSchedule lookups per term.
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
			ts = database.BestTermSchedule(studentID, course.Semester, course.AcademicYear)
			cache[k] = ts
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
	courses := database.ListCourses(c.Query("status"), c.Query("q"), nil)
	c.JSON(http.StatusOK, enrichConflicts(sid, courses))
}
