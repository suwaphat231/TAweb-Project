package database

import (
	_ "embed"
	"fmt"
	"labassist/models"
	"log"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// unlimitedCapacity is the capacity the classlist export uses for sections
// with no seat limit.
const unlimitedCapacity = 9999

//go:embed data/classlist.sql
var classlistSQL string

// seedCoursesFromClasslist executes the embedded classlist SQL to create the
// classlist_courses staging table, then imports each row into the courses table.
// Skips the import entirely if any courses already exist (idempotent).
func seedCoursesFromClasslist() error {
	for _, stmt := range splitSQLStatements(classlistSQL) {
		if err := DB.Exec(stmt).Error; err != nil {
			return fmt.Errorf("execute classlist sql: %w", err)
		}
	}

	var count int64
	DB.Model(&models.Course{}).Count(&count)
	if count > 0 {
		return nil
	}

	type classlistRow struct {
		AcademicYear int    `gorm:"column:academic_year"`
		Semester     int    `gorm:"column:semester"`
		SubjectCode  string `gorm:"column:subject_code"`
		TitleTH      string `gorm:"column:title_th"`
		TitleEN      string `gorm:"column:title_en"`
		Credits      string `gorm:"column:credits"`
		Schedule     string `gorm:"column:schedule"`
		SectionNo    string `gorm:"column:section_no"`
		Capacity     int    `gorm:"column:capacity"`
		Enrolled     int    `gorm:"column:enrolled"`
		Instructors  string `gorm:"column:instructors"`
	}

	var rows []classlistRow
	if err := DB.Raw(`SELECT academic_year, semester, subject_code, title_th, title_en,
		credits, schedule, section_no, capacity, enrolled, instructors
		FROM classlist_courses`).Scan(&rows).Error; err != nil {
		return fmt.Errorf("query classlist_courses: %w", err)
	}

	// The classlist lists one row per curriculum group (e.g. 517433-160 and
	// 517433-165), so a single class shared by several year groups appears
	// more than once. Rows with the same code, section and meeting time are
	// the same physical class — merge them into one course so instructors
	// don't see identical sections twice. Same section number with a
	// different time stays separate.
	type classKey struct {
		code     string
		section  int
		semester int
		year     int
		schedule string
	}
	var order []classKey
	merged := map[classKey]*classlistRow{}
	groups := map[classKey]int{}
	for i := range rows {
		r := rows[i]
		section, _ := strconv.Atoi(r.SectionNo)
		k := classKey{r.SubjectCode, section, r.Semester, r.AcademicYear, strings.TrimSpace(r.Schedule)}
		groups[k]++
		m, ok := merged[k]
		if !ok {
			merged[k] = &r
			order = append(order, k)
			continue
		}
		m.Enrolled += r.Enrolled
		// 9999 is the classlist's "no limit" capacity; summing it would be
		// meaningless, so an unlimited group keeps the merged class unlimited.
		if m.Capacity >= unlimitedCapacity || r.Capacity >= unlimitedCapacity {
			m.Capacity = unlimitedCapacity
		} else {
			m.Capacity += r.Capacity
		}
	}

	users := ListUsers(string(models.RoleInstructor), "", 1000, 0)

	for _, k := range order {
		r := merged[k]
		section := k.section

		// The Thai title carries a per-group note on its second line
		// ("(ล.คอมปี3ขึ้นไป ...)"); once groups are merged that note only
		// describes one of them, so keep just the course name.
		title := r.TitleTH
		if groups[k] > 1 {
			title = strings.TrimSpace(strings.SplitN(title, "\n", 2)[0])
		}

		var instructorID uint
		for _, name := range SplitInstructorNames(r.Instructors) {
			target := NormalizeInstructorName(name)
			for _, u := range users {
				if NormalizeInstructorName(u.FullName) == target {
					instructorID = u.ID
					break
				}
			}
			if instructorID != 0 {
				break
			}
		}

		CreateCourse(models.Course{
			Code:           r.SubjectCode,
			Title:          title,
			EnglishTitle:   r.TitleEN,
			Credits:        r.Credits,
			Schedule:       r.Schedule,
			Section:        section,
			Capacity:       r.Capacity,
			Enrolled:       r.Enrolled,
			InstructorID:   instructorID,
			InstructorsRaw: r.Instructors,
			Semester:       strconv.Itoa(r.Semester),
			AcademicYear:   r.AcademicYear,
			Status:         models.StatusDraft,
			HasLab:         LabHoursFromCredits(r.Credits) > 0,
		})
	}

	log.Printf("Seeded %d courses from %d classlist rows", len(order), len(rows))
	return nil
}

// courseRefTables are the tables whose course_id points at a course. A
// duplicate course referenced from any of them has real activity attached and
// is never merged away.
var courseRefTables = []string{
	"applications", "application_history", "blacklists",
	"form_reviews", "notifications", "staff_documents",
}

// mergeDuplicateCourses folds courses that are the same physical class (same
// code, section, term and meeting time) into one row. Databases seeded before
// seedCoursesFromClasslist merged curriculum groups hold one course per group,
// so an instructor saw the same section twice. Rows that nothing references
// yet are merged into the one that is kept.
func mergeDuplicateCourses() error {
	var courses []models.Course
	if err := DB.Order("id ASC").Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses: %w", err)
	}

	type classKey struct {
		code, semester, schedule string
		section, year            int
	}
	groups := map[classKey][]models.Course{}
	var order []classKey
	for _, c := range courses {
		k := classKey{c.Code, c.Semester, strings.TrimSpace(c.Schedule), c.Section, c.AcademicYear}
		if _, ok := groups[k]; !ok {
			order = append(order, k)
		}
		groups[k] = append(groups[k], c)
	}

	removed := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, k := range order {
			g := groups[k]
			if len(g) < 2 {
				continue
			}
			// Keep the row that already has activity attached (if any) so
			// its references stay valid; otherwise keep the lowest id.
			keepIdx := 0
			for i, c := range g {
				if courseReferenced(tx, c.ID) {
					keepIdx = i
					break
				}
			}
			keep := g[keepIdx]
			var drop []uint
			for i, c := range g {
				if i == keepIdx || courseReferenced(tx, c.ID) {
					continue
				}
				drop = append(drop, c.ID)
				keep.Enrolled += c.Enrolled
				if keep.Capacity >= unlimitedCapacity || c.Capacity >= unlimitedCapacity {
					keep.Capacity = unlimitedCapacity
				} else {
					keep.Capacity += c.Capacity
				}
			}
			if len(drop) == 0 {
				continue
			}
			title := strings.TrimSpace(strings.SplitN(keep.Title, "\n", 2)[0])
			if err := tx.Model(&models.Course{}).Where("id = ?", keep.ID).Updates(map[string]any{
				"title": title, "enrolled": keep.Enrolled, "capacity": keep.Capacity,
			}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&models.Course{}, drop).Error; err != nil {
				return err
			}
			removed += len(drop)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if removed > 0 {
		log.Printf("Merged %d duplicate courses (same code, section, term and time)", removed)
	}
	return nil
}

func courseReferenced(tx *gorm.DB, courseID uint) bool {
	for _, t := range courseRefTables {
		var n int64
		if err := tx.Table(t).Where("course_id = ?", courseID).Count(&n).Error; err != nil || n > 0 {
			return true
		}
	}
	return false
}

// splitSQLStatements splits a SQL file into individual executable statements,
// stripping comment lines and skipping session/transaction control commands.
func splitSQLStatements(sql string) []string {
	var stmts []string
	for _, seg := range strings.Split(sql, ";") {
		// Remove comment lines from this segment
		var lines []string
		for _, line := range strings.Split(seg, "\n") {
			if !strings.HasPrefix(strings.TrimSpace(line), "--") {
				lines = append(lines, line)
			}
		}
		s := strings.TrimSpace(strings.Join(lines, "\n"))
		if s == "" {
			continue
		}
		upper := strings.ToUpper(s)
		if strings.HasPrefix(upper, "SET ") ||
			upper == "START TRANSACTION" ||
			upper == "COMMIT" {
			continue
		}
		stmts = append(stmts, s)
	}
	return stmts
}
