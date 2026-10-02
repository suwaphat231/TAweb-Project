package database

import (
	_ "embed"
	"fmt"
	"labassist/models"
	"log"
	"strconv"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

		var instructorID *uint
		for _, name := range SplitInstructorNames(r.Instructors) {
			target := NormalizeInstructorName(name)
			for _, u := range users {
				if NormalizeInstructorName(u.FullName) == target {
					id := u.ID
					instructorID = &id
					break
				}
			}
			if instructorID != nil {
				break
			}
		}

		// One row per meeting time so each time is opened/applied to on its own.
		for slot, line := range SplitScheduleDays(r.Schedule) {
			course := CreateCourse(models.Course{
				Code:           r.SubjectCode,
				Title:          title,
				EnglishTitle:   r.TitleEN,
				Credits:        r.Credits,
				Schedule:       line,
				Section:        section,
				Slot:           slot,
				Capacity:       r.Capacity,
				Enrolled:       r.Enrolled,
				InstructorID:   instructorID,
				InstructorsRaw: r.Instructors,
				Semester:       strconv.Itoa(r.Semester),
				AcademicYear:   r.AcademicYear,
				Status:         models.StatusDraft,
				HasLab:         LabHoursFromCredits(r.Credits) > 0,
			})
			if course.ID == 0 {
				return fmt.Errorf("seed course %s section %d slot %d: cannot save course", r.SubjectCode, section, slot)
			}
		}
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
		section, slot, year      int
	}
	groups := map[classKey][]models.Course{}
	var order []classKey
	for _, c := range courses {
		k := classKey{c.Code, c.Semester, strings.TrimSpace(c.Schedule), c.Section, c.Slot, c.AcademicYear}
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

// splitMultiTimeCourses turns each course whose schedule meets on several
// days into one row per day (slot 0 keeps the original row). Databases
// seeded before courses were split per day hold a whole section in one row,
// so instructors could only open "Sec 1" instead of picking the days. Only untouched rows are split — anything already recruiting or
// referenced keeps its row so existing applications stay valid.
func splitMultiTimeCourses() error {
	var courses []models.Course
	if err := DB.Where("slot = 0 AND schedule LIKE ?", "%\n%").Order("id ASC").Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses: %w", err)
	}

	split := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, c := range courses {
			lines := SplitScheduleDays(c.Schedule)
			if len(lines) < 2 || courseReferenced(tx, c.ID) {
				continue
			}
			var recruiting int64
			if err := tx.Model(&models.Posting{}).Where("course_id = ? AND status <> ?", c.ID, models.StatusDraft).Count(&recruiting).Error; err != nil {
				return err
			}
			if recruiting > 0 {
				continue
			}

			var links []models.CourseInstructor
			if err := tx.Where("course_id = ?", c.ID).Find(&links).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.Course{}).Where("id = ?", c.ID).Update("schedule", lines[0]).Error; err != nil {
				return err
			}
			for slot, line := range lines[1:] {
				nc := c
				nc.ID = 0
				nc.Slot = slot + 1
				nc.Schedule = line
				nc.Status = models.StatusDraft
				if err := tx.Omit(clause.Associations).Create(&nc).Error; err != nil {
					return err
				}
				for _, l := range links {
					l.ID = 0
					l.CourseID = nc.ID
					if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&l).Error; err != nil {
						return err
					}
				}
				if err := syncPostingTx(tx, nc); err != nil {
					return err
				}
			}
			split++
		}
		return nil
	})
	if err != nil {
		return err
	}
	if split > 0 {
		log.Printf("Split %d multi-time courses into one course per meeting time", split)
	}
	return nil
}

// mergeSameDaySlots folds slots of one section that meet on the same day back
// into a single row. Sections were briefly split one row per schedule line,
// which turned "We 08:30 - 10:15" and "We 10:20 - 12:05" into two options;
// they are one day's class and are opened/applied to together. Slots are
// renumbered 0..n-1 afterwards so they line up with SplitScheduleDays again.
// A section is left alone if any of its rows is recruiting or referenced.
func mergeSameDaySlots() error {
	var courses []models.Course
	if err := DB.Order("code, semester, academic_year, section, slot").Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses: %w", err)
	}

	type sectionKey struct {
		code, semester string
		year, section  int
	}
	var order []sectionKey
	sections := map[sectionKey][]models.Course{}
	for _, c := range courses {
		k := sectionKey{c.Code, c.Semester, c.AcademicYear, c.Section}
		if _, ok := sections[k]; !ok {
			order = append(order, k)
		}
		sections[k] = append(sections[k], c)
	}

	merged := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, k := range order {
			rows := sections[k]
			if len(rows) < 2 {
				continue
			}
			var dayOrder []string
			byDay := map[string][]models.Course{}
			for _, c := range rows {
				day := strings.TrimSpace(c.Schedule)
				if m := enLineRe.FindStringSubmatch(day); m != nil {
					day = m[1]
				}
				if _, ok := byDay[day]; !ok {
					dayOrder = append(dayOrder, day)
				}
				byDay[day] = append(byDay[day], c)
			}
			if len(dayOrder) == len(rows) {
				continue
			}

			untouched := true
			for _, c := range rows {
				var recruiting int64
				if err := tx.Model(&models.Posting{}).Where("course_id = ? AND status <> ?", c.ID, models.StatusDraft).Count(&recruiting).Error; err != nil {
					return err
				}
				if recruiting > 0 || courseReferenced(tx, c.ID) {
					untouched = false
					break
				}
			}
			if !untouched {
				continue
			}

			for slot, day := range dayOrder {
				group := byDay[day]
				keep := group[0]
				if len(group) > 1 {
					var lines []string
					var drop []uint
					for _, c := range group {
						lines = append(lines, strings.TrimSpace(c.Schedule))
						if c.ID != keep.ID {
							drop = append(drop, c.ID)
						}
					}
					if err := tx.Where("course_id IN ?", drop).Delete(&models.Posting{}).Error; err != nil {
						return err
					}
					if err := tx.Where("course_id IN ?", drop).Delete(&models.CourseInstructor{}).Error; err != nil {
						return err
					}
					if err := tx.Delete(&models.Course{}, drop).Error; err != nil {
						return err
					}
					if err := tx.Model(&models.Course{}).Where("id = ?", keep.ID).Update("schedule", strings.Join(lines, "\n")).Error; err != nil {
						return err
					}
					merged += len(drop)
				}
				// Ascending order only ever moves a row down into a slot that
				// was its own or already vacated, so the unique key holds.
				if keep.Slot != slot {
					if err := tx.Model(&models.Course{}).Where("id = ?", keep.ID).Update("slot", slot).Error; err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if merged > 0 {
		log.Printf("Merged %d same-day course slots into their day's row", merged)
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
