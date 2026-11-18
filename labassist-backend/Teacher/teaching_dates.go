package teacher

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"labassist/Staff"
	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// TeachingDate is one class day of a section within the semester.
type TeachingDate struct {
	Date        string `json:"date"` // YYYY-MM-DD
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	Holiday     bool   `json:"holiday"`
	HolidayName string `json:"holiday_name,omitempty"`
}

// CourseTeachingDates lists every class day of one course row (section + time).
type CourseTeachingDates struct {
	CourseID  uint           `json:"course_id"`
	Section   int            `json:"section"`
	Schedule  string         `json:"schedule"`
	TermKnown bool           `json:"term_known"` // false when the semester open/close dates are not set
	// What the admin's academic calendar holds for this course's semester, so
	// the page can say exactly what is missing.
	Semester     string `json:"semester"`
	AcademicYear int    `json:"academic_year"`
	OpenDate     string `json:"open_date,omitempty"`
	CloseDate    string `json:"close_date,omitempty"`
	Dates     []TeachingDate `json:"dates"`
}

// TeachingDates godoc
// @Summary วันที่สอนทั้งหมดของวิชา (ตามตารางเรียนและวันเปิด-ปิดภาคเรียน)
// @Description คำนวณวันสอนทุกวันตั้งแต่วันเปิดถึงวันปิดภาคเรียน วันที่ตรงกับวันหยุดที่มีผลต่อการทำงานจะถูกระบุ holiday=true
// @Tags instructor
// @Produce json
// @Security BearerAuth
// @Param course_ids query string true "รหัสวิชา คั่นด้วยจุลภาค"
// @Success 200 {array} CourseTeachingDates
// @Router /instructor/teaching-dates [get]
func (h *Handler) TeachingDates(c *gin.Context) {
	var ids []uint
	for _, s := range strings.Split(c.Query("course_ids"), ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		n, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid course_ids"})
			return
		}
		ids = append(ids, uint(n))
	}
	if len(ids) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course_ids required"})
		return
	}

	type termKey struct {
		sem  string
		year int
	}
	type termInfo struct {
		open, close *time.Time
		holidays    map[string]string
	}
	terms := map[termKey]*termInfo{}
	loadTerm := func(sem string, year int) (*termInfo, error) {
		k := termKey{sem, year}
		if t, ok := terms[k]; ok {
			return t, nil
		}
		info := &termInfo{holidays: map[string]string{}}
		rows, err := database.ListAcademicTerms(year)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			if r.Semester == sem || (sem == "3" && r.Semester == "S") {
				info.open, info.close = r.OpenDate, r.CloseDate
			}
		}
		cals, err := database.ListCalendarDatesBySemester(sem, year)
		if err != nil {
			return nil, err
		}
		for _, cd := range cals {
			if cd.AffectsWork != nil && *cd.AffectsWork {
				info.holidays[cd.Date.Format(dateOnlyLayout)] = cd.Name
			}
		}
		terms[k] = info
		return info, nil
	}

	out := make([]CourseTeachingDates, 0, len(ids))
	for _, id := range ids {
		var course models.Course
		if err := database.DB.First(&course, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
			return
		}
		if !ownsCourse(c, course) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		res := CourseTeachingDates{CourseID: course.ID, Section: course.Section, Schedule: course.Schedule, Dates: []TeachingDate{}}
		term, err := loadTerm(course.Semester, course.AcademicYear)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		res.Semester, res.AcademicYear = course.Semester, course.AcademicYear
		if term.open != nil {
			res.OpenDate = term.open.Format(dateOnlyLayout)
		}
		if term.close != nil {
			res.CloseDate = term.close.Format(dateOnlyLayout)
		}
		if term.open != nil && term.close != nil {
			res.TermKnown = true
			for _, slot := range staff.ParseThaiSchedule(course.Schedule) {
				d := time.Date(term.open.Year(), term.open.Month(), term.open.Day(), 0, 0, 0, 0, time.UTC)
				end := time.Date(term.close.Year(), term.close.Month(), term.close.Day(), 0, 0, 0, 0, time.UTC)
				for ; !d.After(end); d = d.AddDate(0, 0, 1) {
					if int(d.Weekday()) != slot.Weekday {
						continue
					}
					key := d.Format(dateOnlyLayout)
					name, hol := term.holidays[key]
					res.Dates = append(res.Dates, TeachingDate{
						Date: key, StartTime: slot.StartTime, EndTime: slot.EndTime, Holiday: hol, HolidayName: name,
					})
				}
			}
			sort.Slice(res.Dates, func(i, j int) bool {
				if res.Dates[i].Date != res.Dates[j].Date {
					return res.Dates[i].Date < res.Dates[j].Date
				}
				return res.Dates[i].StartTime < res.Dates[j].StartTime
			})
		}
		out = append(out, res)
	}
	c.JSON(http.StatusOK, out)
}
