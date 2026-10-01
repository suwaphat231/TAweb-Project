package teacher

import (
	"fmt"
	"labassist/database"
	"labassist/models"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// meetingStart finds where each meeting begins inside an imported schedule,
// e.g. "Mo 10:20 - 12:05 ร.วท.2 Tu 13:00 - 16:35 1227/1,1227/2 ว.1" — a day
// abbreviation followed by a time.
var meetingStart = regexp.MustCompile(`(?:^|\s)(Mo|Tu|We|Th|Fr|Sa|Su)\s+\d`)

// meetingTime is the "Tu 13:00 - 16:35" part of one meeting; whatever follows
// it is the room.
var meetingTime = regexp.MustCompile(`^(Mo|Tu|We|Th|Fr|Sa|Su)\s+\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}`)

// splitSchedule breaks an imported schedule into one string per meeting.
// Must stay in step with splitSchedule in the frontend's courseDisplay.ts.
func splitSchedule(schedule string) []string {
	schedule = strings.TrimSpace(schedule)
	if schedule == "" {
		return nil
	}
	idx := meetingStart.FindAllStringIndex(schedule, -1)
	if len(idx) == 0 {
		return []string{schedule}
	}
	starts := make([]int, 0, len(idx))
	for i, m := range idx {
		start := m[0]
		if i > 0 || start > 0 {
			start++ // skip the whitespace the match consumed
		}
		starts = append(starts, start)
	}
	if starts[0] != 0 {
		starts = append([]int{0}, starts...)
	}
	out := make([]string, 0, len(starts))
	for i, start := range starts {
		end := len(schedule)
		if i+1 < len(starts) {
			end = starts[i+1]
		}
		if part := strings.TrimSpace(schedule[start:end]); part != "" {
			out = append(out, part)
		}
	}
	return out
}

// splitMeeting separates one meeting into its time key ("Tu 13:00 - 16:35",
// spacing normalised) and room. A meeting the pattern doesn't recognise is
// keyed by its whole text.
func splitMeeting(meeting string) (key, room string) {
	m := meetingTime.FindString(meeting)
	if m == "" {
		return strings.Join(strings.Fields(meeting), " "), ""
	}
	return strings.Join(strings.Fields(strings.ReplaceAll(m, "-", " - ")), " "), strings.TrimSpace(meeting[len(m):])
}

// SlotInput is one time slot to open, plus the imported Sec rows that meet
// in it (several when Secs share the same slot).
type SlotInput struct {
	Time       string `json:"time" binding:"required" example:"Tu 13:00 - 16:35"`
	SectionIDs []uint `json:"section_ids" binding:"required,min=1"`
}

// OpenSlotsRequest is the request body for opening postings per time slot.
type OpenSlotsRequest struct {
	Slots             []SlotInput         `json:"slots" binding:"required,min=1,dive"`
	LabBoySlots       int                 `json:"labboy_slots" binding:"min=0" example:"2"`
	Status            models.CourseStatus `json:"status" binding:"omitempty,oneof=open closing_soon closed draft" example:"open"`
	Description       *string             `json:"description,omitempty"`
	Requirements      *string             `json:"requirements,omitempty"`
	Deadline          string              `json:"deadline,omitempty" binding:"omitempty,datetime=2006-01-02" example:"2026-08-01"`
	RequireGradeProof bool                `json:"require_grade_proof" example:"false"`
}

// OpenSlots godoc
// @Summary      เปิดรับสมัครแยกตามช่วงเวลา
// @Description  สร้างประกาศ 1 รายการต่อ 1 ช่วงเวลาเรียน (จากเวลาเรียนที่นำเข้าจากไฟล์ Excel) — Sec ที่เรียนช่วงเวลาเดียวกันรวมเป็นประกาศเดียว
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      OpenSlotsRequest  true  "ช่วงเวลาที่จะเปิดรับสมัคร"
// @Success      201   {array}   models.Course
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      409   {object}  handlers.ErrorResponse
// @Router       /instructor/courses/open-slots [post]
func (h *Handler) OpenSlots(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	isAdmin := role.(string) == "admin"

	var body OpenSlotsRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := body.Status
	if status == "" {
		status = models.StatusOpen
	}
	deadline := parseDeadline(body.Deadline)
	if recruiting(status) && deadlinePassed(deadline) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot open a course whose deadline has already passed"})
		return
	}

	// Validate every slot before creating anything, so a bad slot doesn't
	// leave the batch half-opened.
	planned := make([]models.Course, 0, len(body.Slots))
	for _, slot := range body.Slots {
		wantKey, _ := splitMeeting(slot.Time)

		var base models.Course
		secNums := make([]int, 0, len(slot.SectionIDs))
		rooms := make([]string, 0, len(slot.SectionIDs))
		for i, id := range slot.SectionIDs {
			src, ok := database.CourseByID(id)
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "section not found"})
				return
			}
			// Same visibility rule as the picker (TaughtCourseSections):
			// unmatched imports (InstructorID=0) are open to any instructor.
			if src.Sections != "" || (src.InstructorID != 0 && !database.InstructorOwnsCourse(src, userID.(uint), "", isAdmin)) {
				c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
				return
			}
			if i == 0 {
				base = src
			} else if src.Code != base.Code || src.Semester != base.Semester || src.AcademicYear != base.AcademicYear {
				c.JSON(http.StatusBadRequest, gin.H{"error": "sections in one slot must be the same course and term"})
				return
			}

			found := false
			for _, meeting := range splitSchedule(src.Schedule) {
				if key, room := splitMeeting(meeting); key == wantKey {
					found = true
					if room != "" && !containsString(rooms, room) {
						rooms = append(rooms, room)
					}
				}
			}
			if !found {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Sec %d ไม่มีช่วงเวลา %s", src.Section, wantKey)})
				return
			}
			secNums = append(secNums, src.Section)
		}
		sort.Ints(secNums)

		if database.SlotPostingExists(base.Code, base.Semester, base.AcademicYear, wantKey) {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("ช่วงเวลา %s ของวิชา %s เปิดรับสมัครไปแล้ว", wantKey, base.Code)})
			return
		}

		owner := userID.(uint)
		if isAdmin && base.InstructorID != 0 {
			owner = base.InstructorID
		}
		schedule := wantKey
		if len(rooms) > 0 {
			schedule += " " + strings.Join(rooms, " / ")
		}
		secStrs := make([]string, len(secNums))
		for i, n := range secNums {
			secStrs[i] = strconv.Itoa(n)
		}

		planned = append(planned, models.Course{
			Code:              base.Code,
			Title:             base.Title,
			EnglishTitle:      base.EnglishTitle,
			GroupNote:         base.GroupNote,
			Credits:           base.Credits,
			Section:           secNums[0],
			Sections:          strings.Join(secStrs, ","),
			Schedule:          schedule,
			InstructorID:      owner,
			InstructorsRaw:    base.InstructorsRaw,
			Semester:          base.Semester,
			AcademicYear:      base.AcademicYear,
			HasLab:            base.HasLab,
			LabBoySlots:       body.LabBoySlots,
			Status:            status,
			Description:       body.Description,
			Requirements:      body.Requirements,
			Deadline:          deadline,
			RequireGradeProof: body.RequireGradeProof,
		})
	}

	created := make([]models.Course, 0, len(planned))
	for _, p := range planned {
		created = append(created, database.CreateCourse(p))
	}
	c.JSON(http.StatusCreated, created)
}

func containsString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
