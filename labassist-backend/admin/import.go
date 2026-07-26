package admin

import (
	"fmt"
	"labassist/database"
	"labassist/models"
	"net/http"
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
	{"section", []string{"กลุ่ม"}, true},
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

// instructorTitlePrefixes are stripped before comparing names so that
// "ผู้ช่วยศาสตราจารย์ ดร.สมชาย ใจดี" in the system matches a plain
// "สมชาย ใจดี" typed into the CSV.
var instructorTitlePrefixes = []string{
	"ผู้ช่วยศาสตราจารย์", "รองศาสตราจารย์", "ศาสตราจารย์",
	"อาจารย์", "ดร.", "ดร", "นางสาว", "นาง", "นาย",
}

func normalizeInstructorName(s string) string {
	s = strings.TrimSpace(s)
	for changed := true; changed; {
		changed = false
		for _, p := range instructorTitlePrefixes {
			if strings.HasPrefix(s, p) {
				s = strings.TrimSpace(strings.TrimPrefix(s, p))
				changed = true
			}
		}
	}
	return strings.Join(strings.Fields(s), "")
}

// splitInstructorNames splits a spreadsheet cell listing one or more
// instructors (co-taught sections separate names with ";") into individual,
// trimmed names.
func splitInstructorNames(s string) []string {
	parts := strings.Split(s, ";")
	names := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			names = append(names, p)
		}
	}
	return names
}

func matchInstructor(instructors []models.User, name string) (models.User, bool) {
	target := normalizeInstructorName(name)
	if target == "" {
		return models.User{}, false
	}
	for _, u := range instructors {
		if normalizeInstructorName(u.FullName) == target {
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

// ImportCoursesResponse is the response for the spreadsheet course import endpoint
type ImportCoursesResponse struct {
	Created []ImportCourseResult `json:"created"`
	Skipped []ImportSkippedRow   `json:"skipped"`
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

	instructors := database.ListUsers(string(models.RoleInstructor), "", 1000, 0)

	resp := ImportCoursesResponse{Created: []ImportCourseResult{}, Skipped: []ImportSkippedRow{}}

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
		if title == "" {
			title = code
		}

		// The instructor cell is shown to the admin exactly as written in
		// the file (InstructorsRaw), co-teaching names and all — nothing is
		// checked or filtered for display. Separately, the first name that
		// matches an existing instructor account becomes InstructorID, the
		// real FK a matched instructor needs to log in and see this course;
		// if none match, the course simply has no linked account yet.
		instructorsRaw := get(row, "instructor")
		var instructorID uint
		for _, n := range splitInstructorNames(instructorsRaw) {
			if instructor, ok := matchInstructor(instructors, n); ok {
				instructorID = instructor.ID
				break
			}
		}

		// Course codes intentionally aren't required to be unique here: a
		// real classlist export legitimately repeats one code across
		// several rows, one per section/group.
		course := database.CreateCourse(models.Course{
			Code:           code,
			Title:          title,
			EnglishTitle:   get(row, "english_title"),
			Credits:        get(row, "credits"),
			Schedule:       get(row, "schedule"),
			Section:        getInt(row, "section"),
			Capacity:       getInt(row, "capacity"),
			Enrolled:       getInt(row, "enrolled"),
			InstructorID:   instructorID,
			InstructorsRaw: instructorsRaw,
			Semester:       semester,
			AcademicYear:   academicYear,
			Status:         models.StatusDraft,
		})
		resp.Created = append(resp.Created, ImportCourseResult{
			Row: rowNum, Code: course.Code, Title: course.Title, Instructor: instructorsRaw,
		})
	}

	c.JSON(http.StatusOK, resp)
}
