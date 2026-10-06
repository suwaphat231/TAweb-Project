package staff

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// ScheduleGroupResponse enriches ScheduleGroup with the list of assigned Lab Boys.
type ScheduleGroupResponse struct {
	models.ScheduleGroup
	AssignedStudents []LabBoyInfo `json:"assigned_students"`
}

func enrichScheduleGroup(sg models.ScheduleGroup, postingID uint) ScheduleGroupResponse {
	resp := ScheduleGroupResponse{ScheduleGroup: sg}
	assignedIDs := database.GroupStudentIDs(sg.ID)
	idSet := make(map[uint]bool, len(assignedIDs))
	for _, id := range assignedIDs {
		idSet[id] = true
	}
	for _, app := range database.AcceptedStudentsForPosting(postingID) {
		if idSet[app.StudentID] {
			resp.AssignedStudents = append(resp.AssignedStudents, LabBoyInfo{
				StudentID:   app.StudentID,
				StudentCode: app.StudentCode,
				StudentName: app.StudentName,
			})
		}
	}
	return resp
}

// StaffCaseResponse is the enriched staff case returned to the frontend.
type StaffCaseResponse struct {
	models.StaffCase
	CourseCode           string               `json:"course_code"`
	CourseTitle          string               `json:"course_title"`
	Section              int                  `json:"section"`
	Schedule             string               `json:"schedule"`
	CourseScheduleSlots  []CourseScheduleSlot `json:"course_schedule_slots"`
	InstructorName       string               `json:"instructor_name"`
	LabBoys              []LabBoyInfo         `json:"lab_boys"`
	NextTask             string               `json:"next_task"`
	InstructorConfirmed  bool                 `json:"instructor_confirmed"`
}

// LabBoyInfo is a lightweight student summary on a StaffCaseResponse.
type LabBoyInfo struct {
	StudentID   uint   `json:"student_id"`
	StudentCode string `json:"student_code"`
	StudentName string `json:"student_name"`
}

func enrichStaffCase(sc models.StaffCase) StaffCaseResponse {
	resp := StaffCaseResponse{StaffCase: sc}

	if p, ok := database.PostingByIDExported(sc.PostingID); ok {
		resp.InstructorConfirmed = p.LabBoyAccepted > 0
		if c, ok := database.CourseByID(p.CourseID); ok {
			resp.CourseCode = c.Code
			resp.CourseTitle = c.Title
			resp.Section = c.Section
			resp.Schedule = c.Schedule
			resp.CourseScheduleSlots = ParseThaiSchedule(c.Schedule)
			resp.InstructorName = c.InstructorName
		}
		for _, app := range database.AcceptedStudentsForPosting(sc.PostingID) {
			resp.LabBoys = append(resp.LabBoys, LabBoyInfo{
				StudentID:   app.StudentID,
				StudentCode: app.StudentCode,
				StudentName: app.StudentName,
			})
		}
	}

	switch sc.Status {
	case models.StaffCaseOpen:
		resp.NextTask = "ตรวจสอบและล็อกแผนการทำงาน"
	case models.StaffCasePlanLocked:
		resp.NextTask = "สร้างเอกสารต้นภาคเรียน"
	case models.StaffCaseDone:
		resp.NextTask = "เสร็จสิ้น"
	default:
		resp.NextTask = ""
	}
	return resp
}

// ListCases godoc
// @Summary รายการ Staff Cases ทั้งหมด
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param status query string false "open | plan_locked | done | cancelled"
// @Success 200 {array} StaffCaseResponse
// @Router /staff/cases [get]
func (h *Handler) ListCases(c *gin.Context) {
	statusFilter := c.Query("status")
	cases := database.ListStaffCases(statusFilter)
	out := make([]StaffCaseResponse, 0, len(cases))
	for _, sc := range cases {
		out = append(out, enrichStaffCase(sc))
	}
	c.JSON(http.StatusOK, out)
}

// GetCase godoc
// @Summary รายละเอียด Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {object} StaffCaseResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id} [get]
func (h *Handler) GetCase(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	c.JSON(http.StatusOK, enrichStaffCase(sc))
}

type updateCaseRequest struct {
	HoursPerSession *float64 `json:"hours_per_session"`
	RatePerHour     *int64   `json:"rate_per_hour"` // satang
	WorkStartDate   *string  `json:"work_start_date"` // YYYY-MM-DD
	WorkEndDate     *string  `json:"work_end_date"`   // YYYY-MM-DD
}

// UpdateCase godoc
// @Summary อัปเดตข้อมูล Staff Case (ชั่วโมง, อัตราค่าตอบแทน, ช่วงวันทำงาน)
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {object} StaffCaseResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id} [put]
func (h *Handler) UpdateCase(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body updateCaseRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sc, ok := database.UpdateStaffCase(uint(id), func(sc *models.StaffCase) {
		if body.HoursPerSession != nil {
			sc.HoursPerSession = *body.HoursPerSession
		}
		if body.RatePerHour != nil {
			sc.RatePerHour = *body.RatePerHour
		}
		if body.WorkStartDate != nil && *body.WorkStartDate != "" {
			t, err := time.Parse("2006-01-02", *body.WorkStartDate)
			if err == nil {
				sc.WorkStartDate = &t
			}
		}
		if body.WorkEndDate != nil && *body.WorkEndDate != "" {
			t, err := time.Parse("2006-01-02", *body.WorkEndDate)
			if err == nil {
				sc.WorkEndDate = &t
			}
		}
	})
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "staff_case",
		EntityID:    sc.ID,
		Action:      "case_updated",
		ActorID:     staffID.(uint),
	})
	c.JSON(http.StatusOK, enrichStaffCase(sc))
}

// LockPlan godoc
// @Summary ล็อกแผนการทำงาน (เปลี่ยน status เป็น plan_locked)
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {object} StaffCaseResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/lock-plan [post]
func (h *Handler) LockPlan(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	if sc.Status != models.StaffCaseOpen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "แผนถูกล็อกแล้วหรือ case ถูกปิดไปแล้ว"})
		return
	}
	uid := staffID.(uint)
	now := time.Now()
	sc, ok = database.UpdateStaffCase(uint(id), func(s *models.StaffCase) {
		s.Status = models.StaffCasePlanLocked
		s.PlanLockedAt = &now
		s.PlanLockedByID = &uid
	})
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot lock plan"})
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "staff_case",
		EntityID:    sc.ID,
		Action:      "plan_locked",
		ActorID:     uid,
	})
	c.JSON(http.StatusOK, enrichStaffCase(sc))
}

// GetCaseAuditLog godoc
// @Summary ประวัติการดำเนินงาน (audit log) ของ Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} models.StaffAuditLog
// @Router /staff/cases/{id}/audit [get]
func (h *Handler) GetCaseAuditLog(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	logs := database.StaffAuditLogsForCase(uint(id))
	c.JSON(http.StatusOK, logs)
}

// GetCaseScheduleGroups godoc
// @Summary รายการ schedule groups ของ Staff Case
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 200 {array} ScheduleGroupResponse
// @Router /staff/cases/{id}/schedule-groups [get]
func (h *Handler) GetCaseScheduleGroups(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	groups := database.ScheduleGroupsForCase(uint(id))
	out := make([]ScheduleGroupResponse, 0, len(groups))
	for _, sg := range groups {
		out = append(out, enrichScheduleGroup(sg, sc.PostingID))
	}
	c.JSON(http.StatusOK, out)
}

type addScheduleGroupRequest struct {
	GroupName         string                    `json:"group_name"`
	WeekDay           string                    `json:"week_day"`
	StartTime         string                    `json:"start_time"`
	EndTime           string                    `json:"end_time"`
	WeekDaySlots      []models.GroupWeekDaySlot `json:"week_day_slots"` // multi-day; overrides WeekDay/StartTime/EndTime
	HoursPerSession   float64                   `json:"hours_per_session"`
	RatePerHourSatang *int64                    `json:"rate_per_hour_satang"`
	WorkStartDate     *string                   `json:"work_start_date"`
	WorkEndDate       *string                   `json:"work_end_date"`
	Note              string                    `json:"note"`
}

// AddScheduleGroup godoc
// @Summary เพิ่ม schedule group ใหม่
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Success 201 {object} models.ScheduleGroup
// @Router /staff/cases/{id}/schedule-groups [post]
func (h *Handler) AddScheduleGroup(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if _, ok := database.StaffCaseByID(uint(id)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	var body addScheduleGroupRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sg := models.ScheduleGroup{
		StaffCaseID:     uint(id),
		GroupName:       body.GroupName,
		WeekDay:         body.WeekDay,
		StartTime:       body.StartTime,
		EndTime:         body.EndTime,
		HoursPerSession: body.HoursPerSession,
		Note:            body.Note,
	}
	if len(body.WeekDaySlots) > 0 {
		// Multi-day: encode as JSON; also populate legacy single-day fields from first slot.
		if j, err := json.Marshal(body.WeekDaySlots); err == nil {
			sg.WeekDaysJSON = string(j)
		}
		sg.WeekDay = body.WeekDaySlots[0].Day
		sg.StartTime = body.WeekDaySlots[0].StartTime
		sg.EndTime = body.WeekDaySlots[0].EndTime
	}
	if body.RatePerHourSatang != nil {
		sg.RatePerHourSatang = *body.RatePerHourSatang
	}
	if body.WorkStartDate != nil && *body.WorkStartDate != "" {
		if t, err := time.Parse("2006-01-02", *body.WorkStartDate); err == nil {
			sg.WorkStartDate = &t
		}
	}
	if body.WorkEndDate != nil && *body.WorkEndDate != "" {
		if t, err := time.Parse("2006-01-02", *body.WorkEndDate); err == nil {
			sg.WorkEndDate = &t
		}
	}
	created, err := database.UpsertScheduleGroup(sg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot add schedule group"})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// DeleteScheduleGroup godoc
// @Summary ลบ schedule group
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 204
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId} [delete]
func (h *Handler) DeleteScheduleGroup(c *gin.Context) {
	caseID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	groupID, _ := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if !database.DeleteScheduleGroup(uint(groupID), uint(caseID)) {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

type updateScheduleGroupRequest struct {
	GroupName         *string                    `json:"group_name"`
	WeekDay           *string                    `json:"week_day"`
	StartTime         *string                    `json:"start_time"`
	EndTime           *string                    `json:"end_time"`
	WeekDaySlots      []models.GroupWeekDaySlot  `json:"week_day_slots"` // multi-day; overrides WeekDay/StartTime/EndTime
	HoursPerSession   *float64                   `json:"hours_per_session"`
	RatePerHourSatang *int64                     `json:"rate_per_hour_satang"`
	WorkStartDate     *string                    `json:"work_start_date"`
	WorkEndDate       *string                    `json:"work_end_date"`
	Note              *string                    `json:"note"`
}

// UpdateScheduleGroup godoc
// @Summary แก้ไข schedule group (เฉพาะที่ยังไม่ locked)
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 200 {object} ScheduleGroupResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId} [put]
func (h *Handler) UpdateScheduleGroup(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	var body updateScheduleGroupRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sg, ok := database.UpdateScheduleGroupByID(uint(groupID), uint(caseID), func(sg *models.ScheduleGroup) {
		if body.GroupName != nil {
			sg.GroupName = *body.GroupName
		}
		if len(body.WeekDaySlots) > 0 {
			// Multi-day: encode and populate legacy fields from first slot.
			if j, err := json.Marshal(body.WeekDaySlots); err == nil {
				sg.WeekDaysJSON = string(j)
			}
			sg.WeekDay = body.WeekDaySlots[0].Day
			sg.StartTime = body.WeekDaySlots[0].StartTime
			sg.EndTime = body.WeekDaySlots[0].EndTime
		} else {
			// Legacy single-day path.
			if body.WeekDay != nil {
				sg.WeekDay = *body.WeekDay
			}
			if body.StartTime != nil {
				sg.StartTime = *body.StartTime
			}
			if body.EndTime != nil {
				sg.EndTime = *body.EndTime
			}
			// Clear multi-day JSON if switching back to single.
			if body.WeekDay != nil || body.StartTime != nil || body.EndTime != nil {
				sg.WeekDaysJSON = ""
			}
		}
		if body.HoursPerSession != nil {
			sg.HoursPerSession = *body.HoursPerSession
		}
		if body.RatePerHourSatang != nil {
			sg.RatePerHourSatang = *body.RatePerHourSatang
		}
		if body.WorkStartDate != nil {
			if *body.WorkStartDate == "" {
				sg.WorkStartDate = nil
			} else if t, err := time.Parse("2006-01-02", *body.WorkStartDate); err == nil {
				sg.WorkStartDate = &t
			}
		}
		if body.WorkEndDate != nil {
			if *body.WorkEndDate == "" {
				sg.WorkEndDate = nil
			} else if t, err := time.Parse("2006-01-02", *body.WorkEndDate); err == nil {
				sg.WorkEndDate = &t
			}
		}
		if body.Note != nil {
			sg.Note = *body.Note
		}
	})
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schedule group not found or already locked"})
		return
	}
	c.JSON(http.StatusOK, enrichScheduleGroup(sg, sc.PostingID))
}

type initCaseRequest struct {
	CourseID uint `json:"course_id" binding:"required"`
}

// InitCase godoc
// @Summary สร้าง Staff Case จากรายวิชาที่อาจารย์ยืนยันแล้ว (ใช้กู้คืนรายวิชาเก่าที่ยืนยันก่อน feature นี้ถูกเพิ่ม)
// @Description ถ้ามี posting ที่ LabBoyScheduleConfirmed=true แต่ยังไม่มี StaffCase จะสร้างให้อัตโนมัติ
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body initCaseRequest true "course_id"
// @Success 200 {object} StaffCaseResponse
// @Success 201 {object} StaffCaseResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 422 {object} handlers.ErrorResponse
// @Router /staff/cases/init [post]
func (h *Handler) InitCase(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	var body initCaseRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	course, ok := database.CourseByID(body.CourseID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "course not found"})
		return
	}

	posting, ok := database.ActivePostingForCourse(body.CourseID)
	if !ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ไม่พบ posting ที่ใช้งานอยู่สำหรับรายวิชานี้"})
		return
	}

	if posting.LabBoyAccepted < 1 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ยังไม่มีนักศึกษา Lab Boy ที่ได้รับเลือก กรุณาให้อาจารย์ยืนยันรายชื่อก่อน"})
		return
	}

	// Check if a case already exists; if so return it (idempotent).
	if existing, ok := database.StaffCaseByPostingID(posting.ID); ok {
		c.JSON(http.StatusOK, enrichStaffCase(existing))
		return
	}

	sc, err := database.EnsureStaffCase(posting.ID, body.CourseID, course.Semester, course.AcademicYear, staffID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create staff case: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, enrichStaffCase(sc))
}

// LockScheduleGroup godoc
// @Summary ล็อก schedule group (ยืนยันแผนสำหรับกลุ่มนี้)
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 200 {object} models.ScheduleGroup
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/lock [post]
func (h *Handler) LockScheduleGroup(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	uid := staffID.(uint)
	sg, ok := database.LockScheduleGroup(uint(groupID), uint(caseID), uid)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	sc, _ := database.StaffCaseByID(uint(caseID))
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "schedule_group",
		EntityID:    uint(groupID),
		Action:      "group_locked",
		ActorID:     uid,
	})
	c.JSON(http.StatusOK, sg)
}

type assignStudentsRequest struct {
	StudentIDs []uint `json:"student_ids"`
}

// AssignGroupStudents godoc
// @Summary กำหนดนักศึกษา Lab Boy ให้กับ schedule group
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 200 {object} ScheduleGroupResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/students [put]
func (h *Handler) AssignGroupStudents(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	var body assignStudentsRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	groups := database.ScheduleGroupsForCase(uint(caseID))
	var found models.ScheduleGroup
	for _, sg := range groups {
		if sg.ID == uint(groupID) {
			found = sg
			break
		}
	}
	if found.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	if err := database.AssignStudentsToGroup(uint(groupID), body.StudentIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot assign students"})
		return
	}
	c.JSON(http.StatusOK, enrichScheduleGroup(found, sc.PostingID))
}

type generateGroupOccurrencesRequest struct {
	StartDate string `json:"start_date" binding:"required"` // YYYY-MM-DD
	EndDate   string `json:"end_date" binding:"required"`   // YYYY-MM-DD
}

// GenerateGroupOccurrences godoc
// @Summary สร้างรายการวันทำงานสำหรับ schedule group นี้
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 201 {array} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/generate-occurrences [post]
func (h *Handler) GenerateGroupOccurrences(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	groups := database.ScheduleGroupsForCase(uint(caseID))
	var sg models.ScheduleGroup
	for _, g := range groups {
		if g.ID == uint(groupID) {
			sg = g
			break
		}
	}
	if sg.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	var body generateGroupOccurrencesRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	startDate, err := time.Parse("2006-01-02", body.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_date; use YYYY-MM-DD"})
		return
	}
	endDate, err := time.Parse("2006-01-02", body.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_date; use YYYY-MM-DD"})
		return
	}
	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_date must be on or after start_date"})
		return
	}
	calDates := database.ListCalendarDates(uint(caseID), sc.Semester, sc.AcademicYear, &startDate, &endDate)
	cancelledDates := make(map[string]uint)
	for _, cd := range calDates {
		if cd.AffectsWork != nil && *cd.AffectsWork {
			cancelledDates[cd.Date.Format("2006-01-02")] = cd.ID
		}
	}
	gid := uint(groupID)
	occurrences, err := database.GenerateWorkOccurrences(
		uint(caseID), &gid, sg.WeekDay, sg.StartTime, sg.EndTime,
		startDate, endDate, cancelledDates,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot generate occurrences: " + err.Error()})
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "work_occurrence",
		EntityID:    uint(groupID),
		Action:      "group_occurrences_generated",
		ActorID:     staffID.(uint),
		NewValue:    strconv.Itoa(len(occurrences)),
	})
	c.JSON(http.StatusCreated, occurrences)
}

// ListGroupOccurrences godoc
// @Summary รายการวันทำงานของ schedule group
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 200 {array} models.WorkOccurrence
// @Router /staff/cases/{id}/schedule-groups/{groupId}/occurrences [get]
func (h *Handler) ListGroupOccurrences(c *gin.Context) {
	_, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	occurrences := database.WorkOccurrencesForGroup(uint(groupID))
	c.JSON(http.StatusOK, occurrences)
}

// ── Schedule Group Months ─────────────────────────────────────────────────────

// ListGroupMonths godoc
// @Summary รายการเดือนที่ปฏิบัติงานของ schedule group
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 200 {array} models.ScheduleGroupMonth
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months [get]
func (h *Handler) ListGroupMonths(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	months := database.ListScheduleGroupMonths(uint(groupID))
	c.JSON(http.StatusOK, months)
}

type addGroupMonthRequest struct {
	Year           int     `json:"year" binding:"required"`
	Month          int     `json:"month" binding:"required"`
	MonthStartDate *string `json:"month_start_date"` // YYYY-MM-DD
	MonthEndDate   *string `json:"month_end_date"`   // YYYY-MM-DD
}

// AddGroupMonth godoc
// @Summary เพิ่มเดือนปฏิบัติงานให้ schedule group
// @Tags staff
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Success 201 {object} models.ScheduleGroupMonth
// @Failure 400 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months [post]
func (h *Handler) AddGroupMonth(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	if _, ok := database.StaffCaseByID(uint(caseID)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}
	var body addGroupMonthRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Month < 1 || body.Month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "month must be 1–12"})
		return
	}
	m := models.ScheduleGroupMonth{
		ScheduleGroupID: uint(groupID),
		Year:            body.Year,
		Month:           body.Month,
	}
	if body.MonthStartDate != nil && *body.MonthStartDate != "" {
		if t, err := time.Parse("2006-01-02", *body.MonthStartDate); err == nil {
			m.MonthStartDate = &t
		}
	}
	if body.MonthEndDate != nil && *body.MonthEndDate != "" {
		if t, err := time.Parse("2006-01-02", *body.MonthEndDate); err == nil {
			m.MonthEndDate = &t
		}
	}
	created, err := database.AddScheduleGroupMonth(m)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

// DeleteGroupMonth godoc
// @Summary ลบเดือนปฏิบัติงานออกจาก schedule group
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Param year path int true "CE Year"
// @Param month path int true "Month 1–12"
// @Success 204
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months/{year}/{month} [delete]
func (h *Handler) DeleteGroupMonth(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}
	if !database.DeleteScheduleGroupMonthByKey(uint(groupID), year, month) {
		c.JSON(http.StatusNotFound, gin.H{"error": "month not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

// GenerateGroupMonthOccurrences godoc
// @Summary สร้าง (หรือสร้างใหม่) occurrences สำหรับ schedule group ในเดือนที่ระบุ
// @Description Idempotent: ลบ draft occurrences ของเดือนนั้นก่อน แล้วสร้างใหม่จาก WeekDaysJSON
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Param year path int true "CE Year"
// @Param month path int true "Month 1–12"
// @Success 201 {array} models.WorkOccurrence
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months/{year}/{month}/generate [post]
func (h *Handler) GenerateGroupMonthOccurrences(c *gin.Context) {
	staffID, _ := c.Get("user_id")
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil || month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}

	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	// Resolve the schedule group.
	groups := database.ScheduleGroupsForCase(uint(caseID))
	var sg models.ScheduleGroup
	for _, g := range groups {
		if g.ID == uint(groupID) {
			sg = g
			break
		}
	}
	if sg.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}
	if sg.LockedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schedule group is locked"})
		return
	}

	// Load the month entry.
	months := database.ListScheduleGroupMonths(uint(groupID))
	var sgMonth *models.ScheduleGroupMonth
	for i, m := range months {
		if m.Year == year && m.Month == month {
			sgMonth = &months[i]
			break
		}
	}
	if sgMonth == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "month not found for this schedule group — add it first"})
		return
	}

	// Resolve the day slots.
	slots, err := database.ParseGroupWeekDaySlots(sg.WeekDaysJSON)
	if err != nil || len(slots) == 0 {
		// Fall back to the legacy single WeekDay/StartTime/EndTime fields.
		if sg.WeekDay == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "schedule group has no day slots configured"})
			return
		}
		slots = []models.GroupWeekDaySlot{{
			Day: sg.WeekDay, StartTime: sg.StartTime, EndTime: sg.EndTime,
		}}
	}

	// Build the holiday map for this month range.
	firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)
	startDate, endDate := firstDay, lastDay
	if sgMonth.MonthStartDate != nil {
		startDate = *sgMonth.MonthStartDate
	}
	if sgMonth.MonthEndDate != nil {
		endDate = *sgMonth.MonthEndDate
	}
	calDates := database.ListCalendarDates(uint(caseID), sc.Semester, sc.AcademicYear, &startDate, &endDate)
	cancelledDates := make(map[string]uint)
	for _, cd := range calDates {
		if cd.AffectsWork != nil && *cd.AffectsWork {
			cancelledDates[cd.Date.Format("2006-01-02")] = cd.ID
		}
	}

	occurrences, err := database.RegenerateGroupMonthOccurrences(uint(caseID), uint(groupID), slots, *sgMonth, cancelledDates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot generate occurrences: " + err.Error()})
		return
	}
	database.CreateStaffAuditLog(models.StaffAuditLog{
		StaffCaseID: &sc.ID,
		EntityType:  "work_occurrence",
		EntityID:    uint(groupID),
		Action:      "group_month_occurrences_generated",
		ActorID:     staffID.(uint),
		NewValue:    strconv.Itoa(len(occurrences)),
	})
	c.JSON(http.StatusCreated, occurrences)
}

// GetGroupMonthSummary godoc
// @Summary สรุปสถิติวันทำงานรายเดือนของ schedule group
// @Tags staff
// @Produce json
// @Security BearerAuth
// @Param id path int true "Staff Case ID"
// @Param groupId path int true "Schedule Group ID"
// @Param year path int true "CE Year"
// @Param month path int true "Month 1–12"
// @Success 200 {object} models.MonthOccurrenceSummary
// @Failure 404 {object} handlers.ErrorResponse
// @Router /staff/cases/{id}/schedule-groups/{groupId}/months/{year}/{month}/summary [get]
func (h *Handler) GetGroupMonthSummary(c *gin.Context) {
	caseID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid case id"})
		return
	}
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
		return
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
		return
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil || month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month"})
		return
	}

	sc, ok := database.StaffCaseByID(uint(caseID))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "staff case not found"})
		return
	}

	groups := database.ScheduleGroupsForCase(uint(caseID))
	var sg models.ScheduleGroup
	for _, g := range groups {
		if g.ID == uint(groupID) {
			sg = g
			break
		}
	}
	if sg.ID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule group not found"})
		return
	}

	occs := database.WorkOccurrencesForGroupInMonth(uint(groupID), year, month)
	effectiveRate := sg.RatePerHourSatang
	if effectiveRate == 0 {
		effectiveRate = sc.RatePerHour
	}
	labBoyCount := len(database.GroupStudentIDs(uint(groupID)))
	summary := database.ComputeMonthOccurrenceSummary(occs, year, month, effectiveRate, labBoyCount)
	c.JSON(http.StatusOK, summary)
}
