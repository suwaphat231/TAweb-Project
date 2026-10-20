package database

import (
	_ "embed"
	"errors"
	"fmt"
	"labassist/models"
	"log"
	"slices"
	"sort"
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

// classlistTerm is an academic term as the courses table stores it.
type classlistTerm struct {
	AcademicYear int
	Semester     string
}

// rowsOfNewTerms keeps the classlist rows of terms that have no courses yet.
func rowsOfNewTerms(rows []classlistRow, existing map[classlistTerm]bool) []classlistRow {
	var out []classlistRow
	for _, r := range rows {
		if !existing[classlistTerm{r.AcademicYear, strconv.Itoa(r.Semester)}] {
			out = append(out, r)
		}
	}
	return out
}

// seedCoursesFromClasslist executes the embedded classlist SQL to create the
// classlist_courses staging table, then imports each term's rows into the
// courses table. A term that already has courses is skipped, so the import
// is idempotent and a newly added classlist term is picked up on the next
// start without touching the terms already in use.
func seedCoursesFromClasslist() error {
	for _, stmt := range splitSQLStatements(classlistSQL) {
		if err := DB.Exec(stmt).Error; err != nil {
			return fmt.Errorf("execute classlist sql: %w", err)
		}
	}

	var terms []classlistTerm
	if err := DB.Model(&models.Course{}).Distinct("academic_year", "semester").Scan(&terms).Error; err != nil {
		return fmt.Errorf("list course terms: %w", err)
	}
	existing := map[classlistTerm]bool{}
	for _, t := range terms {
		existing[t] = true
	}

	var all []classlistRow
	if err := DB.Raw(`SELECT academic_year, semester, subject_code, title_th, title_en,
		credits, schedule, section_no, capacity, enrolled, instructors
		FROM classlist_courses`).Scan(&all).Error; err != nil {
		return fmt.Errorf("query classlist_courses: %w", err)
	}
	rows := rowsOfNewTerms(all, existing)
	if len(rows) == 0 {
		return nil
	}

	users, err := ListUsers(string(models.RoleInstructor), "", 1000, 0)
	if err != nil {
		return fmt.Errorf("load instructors: %w", err)
	}

	// One transaction: a failed row rolls the whole import back, so the
	// term is retried on the next start instead of staying half imported.
	days := groupClasslistByDay(rows)
	err = DB.Transaction(func(tx *gorm.DB) error {
		for _, d := range days {
			if err := seedClasslistDay(tx, d, users); err != nil {
				return fmt.Errorf("seed course %s section %d slot %d: %w", d.SubjectCode, d.Section, d.Slot, err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	log.Printf("Seeded %d courses from %d classlist rows", len(days), len(rows))
	return nil
}

// seedClasslistDay creates the course of one section's day, owned by the
// first listed instructor that has an account.
func seedClasslistDay(tx *gorm.DB, d classlistDay, users []models.User) error {
	var instructorID *uint
	for _, name := range SplitInstructorNames(d.Instructors) {
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

	course := models.Course{
		Code:           d.SubjectCode,
		Title:          d.Title,
		EnglishTitle:   d.TitleEN,
		Credits:        d.Credits,
		Schedule:       d.Schedule,
		Section:        d.Section,
		Slot:           d.Slot,
		Capacity:       d.Capacity,
		Enrolled:       d.Enrolled,
		InstructorID:   instructorID,
		InstructorsRaw: d.Instructors,
		Semester:       strconv.Itoa(d.Semester),
		AcademicYear:   d.AcademicYear,
		Status:         models.StatusDraft,
		HasLab:         LabHoursFromCredits(d.Credits) > 0,
	}
	return createCourseTx(tx, &course)
}

// classlistRow is one row of the classlist_courses staging table: one
// curriculum group (e.g. 517433-160) of one section.
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

// classlistDay is one course row to seed: one section's class on one day.
type classlistDay struct {
	AcademicYear, Semester, Section, Slot int
	SubjectCode, Title, TitleEN, Credits  string
	Schedule, Instructors                 string
	Capacity, Enrolled                    int
	groups                                int
	lines                                 []string
}

// lectureRoomMarkers identify the faculty's lecture rooms in a classlist
// period ("We 08:30 - 10:15 ร.วท.2"); computer lab rooms (1227, 1334, 1638,
// 1639, 409/410 …) are none of these.
var lectureRoomMarkers = []string{"ร.วท", "ไววิทย์พุทธารี"}

// lectureRoomNumbers are the lecture classrooms among the numbered rooms
// (confirmed by the department; the rest of building ว.1 are computer labs).
var lectureRoomNumbers = map[string]bool{"1238": true, "1239": true, "1240": true, "1241": true, "511": true}

// isLectureRoomLine reports whether one classlist period is held in a
// lecture room: ร.วท.*, ไววิทย์พุทธารี, a room in building ว.4, or one of
// lectureRoomNumbers.
func isLectureRoomLine(line string) bool {
	line = strings.TrimSpace(line)
	room := line
	if loc := enLineRe.FindStringIndex(line); loc != nil {
		room = strings.TrimSpace(line[loc[1]:])
	}
	if strings.HasSuffix(room, "ว.4") {
		return true
	}
	if f := strings.Fields(room); len(f) > 0 && lectureRoomNumbers[f[0]] {
		return true
	}
	for _, m := range lectureRoomMarkers {
		if strings.Contains(room, m) {
			return true
		}
	}
	return false
}

// lectureHoursFromCredits returns the lecture component of "4 (2-4-6)", or
// 0 when the credits cannot be parsed.
func lectureHoursFromCredits(credits string) int {
	m := labCreditRe.FindStringSubmatch(credits)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// labSchedule drops the lecture periods from a classlist schedule: Lab Boys
// only work the lab. The credits say whether the course has lecture hours
// at all ("4 (2-4-6)" = 2); the room says which periods they are.
func labSchedule(credits, schedule string) string {
	if lectureHoursFromCredits(credits) == 0 {
		return schedule
	}
	var keep []string
	for _, line := range strings.Split(schedule, "\n") {
		if line = strings.TrimSpace(line); line != "" && !isLectureRoomLine(line) {
			keep = append(keep, line)
		}
	}
	return strings.Join(keep, "\n")
}

// periodKey is a classlist period's day and time without its room
// ("Tu 16:40-18:25"), or "" when the line is not a classlist period.
func periodKey(line string) string {
	m := enLineRe.FindStringSubmatch(strings.TrimSpace(line))
	if m == nil {
		return ""
	}
	return m[1] + " " + normTime(m[2]) + "-" + normTime(m[3])
}

// quizPeriods returns the periods every section of a course meets at
// together: the quiz (517121: Fr 16:40-18:25 for both groups, 517122:
// Tu 16:40-18:25), while each section has its own lab times. A course with
// one section has no shared period, and nothing is shared when it would
// leave a section without any lab period.
func quizPeriods(sectionLines map[int][]string) map[string]bool {
	if len(sectionLines) < 2 {
		return nil
	}
	count := map[string]int{}
	for _, lines := range sectionLines {
		seen := map[string]bool{}
		for _, line := range lines {
			if k := periodKey(line); k != "" && !seen[k] {
				seen[k] = true
				count[k]++
			}
		}
	}
	quiz := map[string]bool{}
	for k, n := range count {
		if n == len(sectionLines) {
			quiz[k] = true
		}
	}
	if len(quiz) == 0 {
		return nil
	}
	for _, lines := range sectionLines {
		if !slices.ContainsFunc(lines, func(l string) bool { return !quiz[periodKey(l)] }) {
			return nil
		}
	}
	return quiz
}

// withoutPeriods drops the lines of a schedule that are one of periods.
func withoutPeriods(schedule string, periods map[string]bool) string {
	var keep []string
	for _, line := range strings.Split(schedule, "\n") {
		if line = strings.TrimSpace(line); line != "" && !periods[periodKey(line)] {
			keep = append(keep, line)
		}
	}
	return strings.Join(keep, "\n")
}

// groupClasslistByDay turns classlist rows into one course per section and
// meeting day. The classlist lists a class shared by several curriculum
// groups once per group, and the groups of one section may meet on
// different days or at different times of the same day; every group that
// meets on a day is part of that day's class, so its seats (รับ) and
// enrolled students (รับเกรด) are added in. The quiz period all sections
// share (see quizPeriods) is not staffed either. Slots are numbered per
// section in order of first appearance.
func groupClasslistByDay(rows []classlistRow) []classlistDay {
	type dayKey struct {
		code                    string
		section, semester, year int
		day                     string
	}
	type sectionKey struct {
		code                    string
		section, semester, year int
	}
	type courseKey struct {
		code           string
		semester, year int
	}

	sectionLines := map[courseKey]map[int][]string{}
	for _, r := range rows {
		ck := courseKey{r.SubjectCode, r.Semester, r.AcademicYear}
		if sectionLines[ck] == nil {
			sectionLines[ck] = map[int][]string{}
		}
		section, _ := strconv.Atoi(r.SectionNo)
		for _, line := range strings.Split(labSchedule(r.Credits, r.Schedule), "\n") {
			if line = strings.TrimSpace(line); line != "" {
				sectionLines[ck][section] = append(sectionLines[ck][section], line)
			}
		}
	}
	quiz := map[courseKey]map[string]bool{}
	for ck, lines := range sectionLines {
		quiz[ck] = quizPeriods(lines)
	}

	var order []dayKey
	byDay := map[dayKey]*classlistDay{}
	nextSlot := map[sectionKey]int{}
	for _, r := range rows {
		if isExcludedCourse(r.TitleEN) {
			continue
		}
		section, _ := strconv.Atoi(r.SectionNo)
		schedule := withoutPeriods(labSchedule(r.Credits, r.Schedule), quiz[courseKey{r.SubjectCode, r.Semester, r.AcademicYear}])
		if schedule == "" {
			continue // only the lecture and quiz: no lab day to staff
		}
		for _, block := range SplitScheduleDays(schedule) {
			day := block
			if m := enLineRe.FindStringSubmatch(strings.TrimSpace(block)); m != nil {
				day = m[1]
			}
			k := dayKey{r.SubjectCode, section, r.Semester, r.AcademicYear, day}
			d, ok := byDay[k]
			if !ok {
				sk := sectionKey{r.SubjectCode, section, r.Semester, r.AcademicYear}
				d = &classlistDay{
					AcademicYear: r.AcademicYear, Semester: r.Semester, Section: section, Slot: nextSlot[sk],
					SubjectCode: r.SubjectCode, Title: r.TitleTH, TitleEN: r.TitleEN, Credits: r.Credits,
					Instructors: r.Instructors,
				}
				nextSlot[sk]++
				byDay[k] = d
				order = append(order, k)
			}
			// 9999 is the classlist's "no limit" capacity; summing it would be
			// meaningless, so an unlimited group keeps the class unlimited.
			if d.Capacity >= unlimitedCapacity || r.Capacity >= unlimitedCapacity {
				d.Capacity = unlimitedCapacity
			} else {
				d.Capacity += r.Capacity
			}
			d.Enrolled += r.Enrolled
			d.groups++
			for _, line := range strings.Split(block, "\n") {
				if line = strings.TrimSpace(line); line != "" && !slices.Contains(d.lines, line) {
					d.lines = append(d.lines, line)
				}
			}
		}
	}

	out := make([]classlistDay, 0, len(order))
	for _, k := range order {
		d := byDay[k]
		sort.Strings(d.lines)
		d.Schedule = strings.Join(d.lines, "\n")
		// The Thai title carries a per-group note on its second line
		// ("(ล.คอมปี3ขึ้นไป ...)"); once groups are merged that note only
		// describes one of them, so keep just the course name.
		if d.groups > 1 {
			d.Title = strings.TrimSpace(strings.SplitN(d.Title, "\n", 2)[0])
		}
		out = append(out, *d)
	}
	return out
}

// excludedTitleMarkers mark the courses that never need Lab Boys: research
// projects (RESEARCH PROJECT I/II, PREPARATION OF RESEARCH PROJECT …) and
// cooperative education are supervised work with no lab sessions, and the
// department does not hire Lab Boys for selected topics courses.
var excludedTitleMarkers = []string{"RESEARCH PROJECT", "COOPERATIVE EDUCATION", "SELECTED TOPICS IN"}

// isExcludedCourse reports whether a classlist course is left out of the
// system, judged by its English title.
func isExcludedCourse(titleEN string) bool {
	upper := strings.ToUpper(titleEN)
	for _, m := range excludedTitleMarkers {
		if strings.Contains(upper, m) {
			return true
		}
	}
	return false
}

// removeExcludedCourses deletes the excluded courses that databases seeded
// before the exclusion still hold. A course with activity attached is kept.
func removeExcludedCourses() error {
	removed := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var courses []models.Course
		if err := tx.Select("id", "english_title").Order("id").Find(&courses).Error; err != nil {
			return err
		}
		for _, c := range courses {
			if !isExcludedCourse(c.EnglishTitle) {
				continue
			}
			if err := deleteEmptyCourseTx(tx, c.ID); err != nil {
				if errors.Is(err, ErrConflict) {
					continue
				}
				return err
			}
			removed++
		}
		return nil
	})
	if err != nil {
		return err
	}
	if removed > 0 {
		log.Printf("Removed %d excluded courses (%s)", removed, strings.Join(excludedTitleMarkers, ", "))
	}
	return nil
}

// removeQuizDayCourses strips the quiz period (see quizPeriods) from the
// courses that databases seeded before it was dropped still hold: a day
// left with no lab period is deleted, any other day keeps its lab periods.
// A course with activity attached is left as it is.
func removeQuizDayCourses() error {
	var courses []models.Course
	if err := DB.Select("id", "code", "section", "semester", "academic_year", "schedule").
		Order("id").Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses: %w", err)
	}
	type courseKey struct {
		code, semester string
		year           int
	}
	sectionLines := map[courseKey]map[int][]string{}
	for _, c := range courses {
		k := courseKey{c.Code, c.Semester, c.AcademicYear}
		if sectionLines[k] == nil {
			sectionLines[k] = map[int][]string{}
		}
		for _, line := range strings.Split(c.Schedule, "\n") {
			if line = strings.TrimSpace(line); line != "" {
				sectionLines[k][c.Section] = append(sectionLines[k][c.Section], line)
			}
		}
	}

	removed, trimmed := 0, 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, c := range courses {
			quiz := quizPeriods(sectionLines[courseKey{c.Code, c.Semester, c.AcademicYear}])
			schedule := withoutPeriods(c.Schedule, quiz)
			switch {
			case schedule == strings.TrimSpace(c.Schedule):
			case schedule == "":
				if err := deleteEmptyCourseTx(tx, c.ID); err != nil {
					if errors.Is(err, ErrConflict) {
						continue
					}
					return err
				}
				removed++
			case !courseReferenced(tx, c.ID):
				if err := tx.Model(&models.Course{}).Where("id = ?", c.ID).Update("schedule", schedule).Error; err != nil {
					return err
				}
				trimmed++
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if removed+trimmed > 0 {
		log.Printf("Removed the quiz period: %d quiz-only days deleted, %d days trimmed", removed, trimmed)
	}
	return nil
}

// courseRefTables are the tables whose course_id points at a course. A
// duplicate course referenced from any of them has real activity attached and
// is never merged away.
var courseRefTables = []string{
	"applications", "application_history", "blacklists", "labboy_reports",
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
	if err := DB.Where("slot = 0 AND (schedule LIKE ? OR schedule LIKE ?)", "%\n%", "%,%").Order("id ASC").Find(&courses).Error; err != nil {
		return fmt.Errorf("load courses: %w", err)
	}

	split := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, c := range courses {
			lines := SplitScheduleDays(c.Schedule)
			if len(lines) < 2 {
				continue
			}

			var sourcePosting models.Posting
			hasSourcePosting := tx.Where("course_id = ? AND is_active = true", c.ID).First(&sourcePosting).Error == nil

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
				if hasSourcePosting {
					newPosting := sourcePosting
					newPosting.ID = 0
					newPosting.CourseID = nc.ID
					newPosting.LabBoyAccepted = 0
					if err := tx.Create(&newPosting).Error; err != nil {
						return err
					}
				} else if err := syncPostingTx(tx, nc); err != nil {
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
