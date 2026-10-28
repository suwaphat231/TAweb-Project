package admin

import (
	"fmt"
	"labassist/database"
	"labassist/models"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

// columnKeywords maps a substring that may appear in a spreadsheet header cell
// to the internal field key. Real classlist exports vary in exact wording
// (e.g. "รายวิชา" vs "รหัสวิชา", "ชื่อวิชา" vs "ชื่อรายวิชา"), so headers are
// matched by "contains" rather than exact equality. Order matters: more
// specific keywords (english_title, credits) are checked before the generic
// "ชื่อ...วิชา" one so e.g. "ชื่อวิชา(อังกฤษ)" maps to english_title, not title.
var columnKeywords = []struct {
	key      string
	keywords []string
	// exact requires the whole normalized header cell to equal the keyword
	// rather than merely contain it. Needed for short, generic headers like
	// "กลุ่ม" (section) that would otherwise also match longer unrelated
	// headers such as "กลุ่มผู้เรียน/หมายเหตุ" (the group-note column).
	exact bool
}{
	{"english_title", []string{"coursename", "อังกฤษ", "english"}, false},
	{"credits", []string{"หน่วยกิต"}, false},
	{"schedule", []string{"เวลา", "ตาราง"}, false},
	{"instructor", []string{"ผู้สอน", "อาจารย์ผู้สอน"}, false},
	{"code", []string{"รหัสวิชา", "รหัสรายวิชา", "รายวิชา"}, false},
	{"section", []string{"กลุ่ม", "กลุ่มเรียน", "ตอนเรียน", "หมู่", "หมู่เรียน", "sec", "sec.", "section", "sect"}, true},
	{"capacity", []string{"รับ"}, true},
	{"enrolled", []string{"ลงทะเบียนแล้ว"}, false},
	{"title", []string{"ชื่อวิชา", "ชื่อรายวิชา"}, false},
}

func normalizeHeaderCell(h string) string {
	h = strings.TrimSpace(h)
	h = strings.Trim(h, ":：")
	h = strings.ReplaceAll(h, "\uFEFF", "") // strip stray BOM some exporters leave in the first cell
	return strings.ToLower(h)
}

// mapColumns matches each header cell against columnKeywords and returns the
// column index for every field key it recognizes.
func mapColumns(header []string) map[string]int {
	idx := make(map[string]int, len(header))
	for i, raw := range header {
		h := normalizeHeaderCell(raw)
		if h == "" {
			continue
		}
		for _, ck := range columnKeywords {
			if _, taken := idx[ck.key]; taken {
				continue
			}
			for _, kw := range ck.keywords {
				matched := h == kw
				if !ck.exact {
					matched = strings.Contains(h, kw)
				}
				if matched {
					idx[ck.key] = i
					break
				}
			}
		}
	}
	return idx
}

// requiredColumnKeys are the columns a row cannot be imported without.
// "instructor" is deliberately not required: a row missing it still becomes
// a course (unassigned instructor) instead of being skipped.
var requiredColumnKeys = []string{"code", "title"}

// findHeaderRow scans the first few rows for the one that maps all required
// columns, so a title/logo row above the real header doesn't break detection.
func findHeaderRow(rows [][]string) (map[string]int, int) {
	limit := 10
	if len(rows) < limit {
		limit = len(rows)
	}
	for r := 0; r < limit; r++ {
		idx := mapColumns(rows[r])
		allFound := true
		for _, key := range requiredColumnKeys {
			if _, ok := idx[key]; !ok {
				allFound = false
				break
			}
		}
		if allFound {
			return idx, r
		}
	}
	return mapColumns(rows[0]), 0
}

func matchInstructor(instructors []models.User, name string) (models.User, bool) {
	target := database.NormalizeInstructorName(name)
	if target == "" {
		return models.User{}, false
	}
	for _, u := range instructors {
		if database.NormalizeInstructorName(u.FullName) == target {
			return u, true
		}
	}
	return models.User{}, false
}

// ImportCourseResult describes one course row created by an import
type ImportCourseResult struct {
	Row        int    `json:"row" example:"2"`
	Code       string `json:"code" example:"CS101"`
	Title      string `json:"title" example:"Introduction to Programming"`
	Instructor string `json:"instructor" example:"John Doe; Jane Doe"`
}

// ImportSkippedRow describes one spreadsheet row that was not imported
// (only genuinely empty rows — with neither a code nor a title — are skipped)
type ImportSkippedRow struct {
	Row    int    `json:"row" example:"2"`
	Reason string `json:"reason" example:"empty row"`
}

// ImportCourseFields are the spreadsheet-sourced values of a course, used to
// compare an uploaded row against the course already in the system.
type ImportCourseFields struct {
	Title          string `json:"title"`
	EnglishTitle   string `json:"english_title"`
	Credits        string `json:"credits"`
	Schedule       string `json:"schedule"`
	Capacity       int    `json:"capacity"`
	Enrolled       int    `json:"enrolled"`
	InstructorsRaw string `json:"instructors_raw"`
}

// ImportDuplicate is an uploaded row identical to a course already in the system.
type ImportDuplicate struct {
	Row     int    `json:"row"`
	Code    string `json:"code"`
	Section int    `json:"section"`
	Title   string `json:"title"`
}

// ImportConflict is an uploaded row that matches an existing course (same code,
// section, semester, year) but with different values. Nothing is changed until
// the admin picks a side via ResolveImportConflicts.
type ImportConflict struct {
	Row       int                `json:"row"`
	CourseID  uint               `json:"course_id"`
	Code      string             `json:"code"`
	Section   int                `json:"section"`
	Old       ImportCourseFields `json:"old"`
	New       ImportCourseFields `json:"new"`
	Different []string           `json:"different"`
}

// ImportCoursesResponse is the response for the spreadsheet course import endpoint
type ImportCoursesResponse struct {
	Created    []ImportCourseResult `json:"created"`
	Skipped    []ImportSkippedRow   `json:"skipped"`
	Duplicates []ImportDuplicate    `json:"duplicates"`
	Conflicts  []ImportConflict     `json:"conflicts"`
	// CatalogSaved is how many course codes from the file were saved to the
	// OCR catalog (core_courses) for the program, lecture-only rows included.
	CatalogSaved int `json:"catalog_saved"`
}

func diffImportFields(old, nw ImportCourseFields) []string {
	var d []string
	if old.Title != nw.Title {
		d = append(d, "title")
	}
	if old.EnglishTitle != nw.EnglishTitle {
		d = append(d, "english_title")
	}
	if old.Credits != nw.Credits {
		d = append(d, "credits")
	}
	if old.Schedule != nw.Schedule {
		d = append(d, "schedule")
	}
	if old.Capacity != nw.Capacity {
		d = append(d, "capacity")
	}
	if old.Enrolled != nw.Enrolled {
		d = append(d, "enrolled")
	}
	if old.InstructorsRaw != nw.InstructorsRaw {
		d = append(d, "instructors_raw")
	}
	return d
}

func courseImportFields(c models.Course) ImportCourseFields {
	return ImportCourseFields{
		Title: c.Title, EnglishTitle: c.EnglishTitle, Credits: c.Credits, Schedule: c.Schedule,
		Capacity: c.Capacity, Enrolled: c.Enrolled, InstructorsRaw: c.InstructorsRaw,
	}
}

// ImportCourses godoc
// @Summary      นำเข้ารายวิชาจากไฟล์ Excel (.xlsx)
// @Description  แสดงชื่อผู้สอนตามที่พิมพ์มาในไฟล์เสมอ ระบบพยายามจับคู่ชื่อแรกกับผู้ใช้ role=instructor ที่มีอยู่จริงเพื่อผูกวิชากับบัญชีนั้น (ให้อาจารย์ล็อกอินดูวิชาของตัวเองได้) แต่ถ้าจับคู่ไม่ได้ก็ไม่มีผลต่อการนำเข้า รหัสวิชาซ้ำกันได้ (คนละกลุ่มเรียน) มีเพียงแถวที่ว่างจริงๆ เท่านั้นที่จะถูกข้าม
// @Tags         admin
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file          formData  file    true  "ไฟล์ Excel รายวิชา .xlsx (คอลัมน์: รายวิชา, ชื่อรายวิชา, COURSENAME, หน่วยกิต, กลุ่ม, รับ, ลงทะเบียนแล้ว, เวลา, ผู้สอน)"
// @Param        semester      formData  string  true  "ภาคการศึกษา"
// @Param        academic_year formData  int     true  "ปีการศึกษา"
// @Param        program       formData  string  false "สาขาที่บันทึกรายวิชาไว้ให้ OCR ตรวจเกรด: IT หรือ CS (ค่าเริ่มต้น CS)"
// @Success      200  {object}  ImportCoursesResponse
// @Failure      400  {object}  handlers.ErrorResponse
// @Router       /admin/courses/import [post]
func (h *Handler) ImportCourses(c *gin.Context) {
	// A malformed or unusually-structured spreadsheet shouldn't crash the
	// server with a raw 500 — report it as a normal import error instead.
	defer func() {
		if r := recover(); r != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("failed to read xlsx file: %v", r)})
		}
	}()

	semester := c.PostForm("semester")
	academicYear, yearErr := strconv.Atoi(c.PostForm("academic_year"))
	if semester == "" || yearErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "semester and academic_year are required"})
		return
	}

	// The program whose catalog (core_courses) these codes are saved to.
	// Defaults to CS (วิทยาการคอมพิวเตอร์) when the form leaves it out.
	program := strings.ToUpper(strings.TrimSpace(c.PostForm("program")))
	if program == "" {
		program = models.ProgramCS
	}
	if program != models.ProgramIT && program != models.ProgramCS {
		c.JSON(http.StatusBadRequest, gin.H{"error": "program must be IT or CS"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "xlsx file is required"})
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot open uploaded file"})
		return
	}
	defer f.Close()

	xf, err := excelize.OpenReader(f)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid xlsx file: " + err.Error()})
		return
	}
	defer xf.Close()

	sheets := xf.GetSheetList()
	if len(sheets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "xlsx file has no sheets"})
		return
	}
	rows, err := xf.GetRows(sheets[0])
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid xlsx file: " + err.Error()})
		return
	}
	if len(rows) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "xlsx file has no data rows"})
		return
	}

	colIdx, headerRow := findHeaderRow(rows)
	for _, required := range requiredColumnKeys {
		if _, ok := colIdx[required]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "xlsx is missing a required column (รหัสวิชา/รายวิชา, ชื่อวิชา)"})
			return
		}
	}
	// Without a section column every row would land in section 0, so Sec 2's
	// meeting times would collide with Sec 1's slots and be dropped as
	// "already in the system". The classlist lists a code's sections in
	// order, so number them by how often the code has appeared instead.
	_, hasSectionCol := colIdx["section"]
	if !hasSectionCol {
		log.Printf("course import: no section column in header %q; numbering sections by row order", rows[headerRow])
	}
	codeSeen := map[string]int{}
	catalog := map[string]models.CoreCourse{}

	instructors, err := database.ListUsers(string(models.RoleInstructor), "", 1000, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp := ImportCoursesResponse{
		Created: []ImportCourseResult{}, Skipped: []ImportSkippedRow{},
		Duplicates: []ImportDuplicate{}, Conflicts: []ImportConflict{},
	}

	get := func(row []string, key string) string {
		idx, ok := colIdx[key]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}
	getInt := func(row []string, key string) int {
		n, _ := strconv.Atoi(get(row, key))
		return n
	}

	for i, row := range rows[headerRow+1:] {
		rowNum := headerRow + i + 2
		code := get(row, "code")
		title := get(row, "title")

		// A row with neither a code nor a title carries no course data at
		// all (e.g. a blank separator row) — there's nothing to import.
		if code == "" && title == "" {
			resp.Skipped = append(resp.Skipped, ImportSkippedRow{Row: rowNum, Reason: "empty row"})
			continue
		}
		// Every course with a 6-digit code and a title goes into the catalog
		// the OCR matches against, including lecture-only rows that are
		// skipped below. The catalog is per program, so one code is saved once.
		if catalogCode := database.CatalogCodeFromCell(code); catalogCode != "" && title != "" {
			if _, seen := catalog[catalogCode]; !seen {
				catalog[catalogCode] = models.CoreCourse{
					Program: program, Code: catalogCode, Title: title, Credits: get(row, "credits"),
				}
			}
		}

		if title == "" {
			title = code
		}

		// Skip lecture-only courses (lab hours = 0 in the credits string).
		// Only courses with lab sessions are eligible for Lab Boy hiring.
		credits := get(row, "credits")
		labHours := database.LabHoursFromCredits(credits)
		if labHours == 0 {
			skip := "ไม่มีคาบแลป"
			if credits != "" {
				skip += " (หน่วยกิต: " + credits + ")"
			}
			resp.Skipped = append(resp.Skipped, ImportSkippedRow{Row: rowNum, Reason: skip})
			continue
		}

		// The instructor cell is shown to the admin exactly as written in
		// the file (InstructorsRaw), co-teaching names and all — nothing is
		// checked or filtered for display. Separately, the first name that
		// matches an existing instructor account becomes InstructorID, the
		// real FK a matched instructor needs to log in and see this course;
		// if none match, the course simply has no linked account yet.
		instructorsRaw := get(row, "instructor")
		var instructorID *uint
		for _, n := range database.SplitInstructorNames(instructorsRaw) {
			if instructor, ok := matchInstructor(instructors, n); ok {
				id := instructor.ID
				instructorID = &id
				break
			}
		}

		// A code legitimately repeats across sections, so a course is only
		// "already in the system" when code + section + time + term all match.
		// Each meeting time of a section is its own course (slot), so a row
		// listing several times is compared/created one time at a time.
		// Identical -> report as duplicate; different -> let the admin choose.
		section := parseSection(get(row, "section"))
		if !hasSectionCol {
			codeSeen[code]++
			section = codeSeen[code]
		}
		for slot, schedule := range database.SplitScheduleDays(get(row, "schedule")) {
			if existing, found := database.FindCourseSlot(code, semester, academicYear, section, slot); found {
				newFields := ImportCourseFields{
					Title: title, EnglishTitle: get(row, "english_title"), Credits: credits,
					Schedule: schedule, Capacity: getInt(row, "capacity"),
					Enrolled: getInt(row, "enrolled"), InstructorsRaw: instructorsRaw,
				}
				oldFields := courseImportFields(existing)
				if diff := diffImportFields(oldFields, newFields); len(diff) > 0 {
					resp.Conflicts = append(resp.Conflicts, ImportConflict{
						Row: rowNum, CourseID: existing.ID, Code: code, Section: section,
						Old: oldFields, New: newFields, Different: diff,
					})
				} else {
					resp.Duplicates = append(resp.Duplicates, ImportDuplicate{
						Row: rowNum, Code: code, Section: section, Title: title,
					})
				}
				continue
			}

			// Course codes intentionally aren't required to be unique here: a
			// real classlist export legitimately repeats one code across
			// several rows, one per section/group.
			course := database.CreateCourse(models.Course{
				Code:           code,
				Title:          title,
				EnglishTitle:   get(row, "english_title"),
				Credits:        credits,
				Schedule:       schedule,
				Section:        section,
				Slot:           slot,
				Capacity:       getInt(row, "capacity"),
				Enrolled:       getInt(row, "enrolled"),
				InstructorID:   instructorID,
				InstructorsRaw: instructorsRaw,
				Semester:       semester,
				AcademicYear:   academicYear,
				Status:         models.StatusDraft,
				HasLab:         labHours > 0,
			})
			if course.ID == 0 {
				resp.Skipped = append(resp.Skipped, ImportSkippedRow{Row: rowNum, Reason: "cannot save course; check duplicate section or instructor"})
				continue
			}
			resp.Created = append(resp.Created, ImportCourseResult{
				Row: rowNum, Code: course.Code, Title: course.Title, Instructor: instructorsRaw,
			})
		}
	}

	catalogCourses := make([]models.CoreCourse, 0, len(catalog))
	for _, cc := range catalog {
		catalogCourses = append(catalogCourses, cc)
	}
	if err := database.UpsertCoreCourses(catalogCourses); err != nil {
		log.Printf("course import: save core course catalog: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	resp.CatalogSaved = len(catalogCourses)

	c.JSON(http.StatusOK, resp)
}

// ResolveImportConflictsRequest carries the conflicts where the admin chose the
// uploaded (new) version over the existing one.
type ResolveImportConflictsRequest struct {
	Updates []struct {
		CourseID uint               `json:"course_id"`
		Fields   ImportCourseFields `json:"fields"`
	} `json:"updates"`
}

// ResolveImportConflicts godoc
// @Summary      ใช้ข้อมูลใหม่จากไฟล์แทนข้อมูลเดิมของวิชาที่ซ้ำ
// @Tags         admin
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  ResolveImportConflictsRequest  true  "รายการวิชาที่เลือกใช้ข้อมูลใหม่"
// @Success      200  {object}  map[string]int
// @Router       /admin/courses/import/resolve [post]
func (h *Handler) ResolveImportConflicts(c *gin.Context) {
	var req ResolveImportConflictsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	instructors, err := database.ListUsers(string(models.RoleInstructor), "", 1000, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	updated := 0
	for _, u := range req.Updates {
		f := u.Fields
		_, ok := database.UpdateCourse(u.CourseID, func(course *models.Course) {
			course.Title = f.Title
			course.EnglishTitle = f.EnglishTitle
			course.Credits = f.Credits
			course.Schedule = f.Schedule
			course.Capacity = f.Capacity
			course.Enrolled = f.Enrolled
			if f.InstructorsRaw != course.InstructorsRaw {
				course.InstructorsRaw = f.InstructorsRaw
				for _, n := range database.SplitInstructorNames(f.InstructorsRaw) {
					if inst, ok := matchInstructor(instructors, n); ok {
						id := inst.ID
						course.InstructorID = &id
						break
					}
				}
			}
			course.HasLab = database.LabHoursFromCredits(f.Credits) > 0
		})
		if ok {
			updated++
		}
	}
	c.JSON(http.StatusOK, gin.H{"updated": updated})
}

var leadingNumberRe = regexp.MustCompile(`\d+`)

// parseSection reads a section cell that may be written as "1", "1.0" or
// "Sec 1" — the first run of digits is the section number.
func parseSection(cell string) int {
	n, _ := strconv.Atoi(leadingNumberRe.FindString(cell))
	return n
}
