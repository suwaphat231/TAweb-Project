package database

import (
	_ "embed"
	"fmt"
	"labassist/models"
	"log"
	"strconv"
	"strings"
)

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

	users := ListUsers(string(models.RoleInstructor), "", 1000, 0)

	for _, r := range rows {
		section, _ := strconv.Atoi(r.SectionNo)

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
			Title:          r.TitleTH,
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

	log.Printf("Seeded %d courses from classlist SQL", len(rows))
	return nil
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
