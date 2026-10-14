package database

import (
	"fmt"
	"labassist/models"
	"time"

	"gorm.io/gorm/clause"
)

// mockDemoInstructor uses the classlist instructor account "puriwat"
// (อาจารย์ ดร.ภูริวัจน์ วรวิชัยพัฒน์) so the dev-login "อาจารย์" button
// lands on the same account that owns the demo course.
var mockDemoInstructor = struct {
	Username string
	FullName string
	Email    string
}{"puriwat", "อาจารย์ ดร.ภูริวัจน์ วรวิชัยพัฒน์", "puriwat@cp.su.ac.th"}

// mockDemoStaff is the เจ้าหน้าที่ account behind the dev-login staff button.
// user.sql also defines it, but that file only runs on an empty users table,
// which never happens because classlist instructors are seeded first.
var mockDemoStaff = struct {
	Username string
	FullName string
	Email    string
}{"parinya", "ปริญญา สุภาวดี", "parinya@cp.su.ac.th"}

// mockDemoCourseBase is the primary debug course: open, split into two
// sections of 3 Lab Boy slots each, with 5 pre-applied students — the 6th
// slot is left for a real student to fill.
var mockDemoCourseBase = models.Course{
	Code:         "517122",
	Title:        "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2",
	EnglishTitle: "COMPUTER PROGRAMMING SKILL 2",
	Semester:     "1",
	AcademicYear: 2569,
	Status:       models.StatusOpen,
}

type mockDemoSection struct {
	Section     int
	Schedule    string
	LabBoySlots int
}

// Each section meets on a single day: a multi-day schedule would be split
// into one course row per day by splitMultiTimeCourses, each copying the
// section's full slot count.
var mockDemoSections = []mockDemoSection{
	{1, "อ 13:00-16:00", 3},
	{2, "พฤ 13:00-16:00", 3},
}

// mockDemoLegacySlots is the slot count the old single-section seed gave
// section 1; a posting still at that value has never been edited by hand.
const mockDemoLegacySlots = 6

type mockDemoStudent struct {
	Username  string
	FullName  string
	Email     string
	StudentID string
	GPA       float64
	Faculty   string
	Year      int8
	Grade     string
	Section   int // section applied to; 0 = applies manually
}

// demo_std01 is the student dev-login account and applies manually.
// The other five accounts are pre-seeded applicants for instructor puriwat.
var mockDemoStudents = []mockDemoStudent{
	{"demo_std01", "ธนภัทร ศรีวิไล", "demo_std01@example.com", "6410123456", 3.85, "เทคโนโลยีสารสนเทศ", 3, "A", 0},
	{"demo_std02", "ปวีณ์นุช อินทรสุวรรณ", "demo_std02@example.com", "6410123457", 3.42, "วิทยาการคอมพิวเตอร์", 3, "B+", 1},
	{"demo_std03", "กิตติภูมิ ทองสุข", "demo_std03@example.com", "6410123458", 3.15, "วิทยาการคอมพิวเตอร์", 2, "B", 1},
	{"demo_std04", "ศศิวิมล บุญมาก", "demo_std04@example.com", "6410123459", 3.67, "เทคโนโลยีสารสนเทศ", 3, "A", 1},
	{"demo_std05", "อดิศร แก้วมณี", "demo_std05@example.com", "6410123460", 2.89, "วิทยาการคอมพิวเตอร์", 3, "B+", 2},
	{"demo_std06", "ณัฐพล ทดสอบระบบ", "demo_std06@example.com", "6410123461", 3.50, "วิทยาการคอมพิวเตอร์", 3, "A", 2},
}

// seedMockApplicants sets up the debug demo:
// one instructor with an open Lab Boy posting split into sections 1 and 2
// (3 slots each) and 5 pre-applied students — leaving the 6th slot open for
// manual testing.
// Duplicate accounts/applications are skipped so restarting is safe.
func seedMockApplicants() error {
	if _, ok := UserByUsername(mockDemoStaff.Username); !ok {
		staff, err := CreateUser(models.User{
			Username: &mockDemoStaff.Username,
			FullName: mockDemoStaff.FullName,
			Email:    mockDemoStaff.Email,
			Role:     models.RoleStaff,
		})
		if err != nil {
			return err
		}
		if err := setPassword(staff.ID); err != nil {
			return err
		}
	}

	instructor, ok := UserByUsername(mockDemoInstructor.Username)
	if !ok {
		created, err := CreateUser(models.User{
			Username: &mockDemoInstructor.Username,
			FullName: mockDemoInstructor.FullName,
			Email:    mockDemoInstructor.Email,
			Role:     models.RoleInstructor,
		})
		if err != nil {
			return err
		}
		instructor = created
		if err := setPassword(instructor.ID); err != nil {
			return err
		}
	}

	courses := make(map[int]models.Course, len(mockDemoSections))
	for _, sec := range mockDemoSections {
		course, err := ensureMockDemoSection(sec, instructor.ID)
		if err != nil {
			return err
		}
		courses[sec.Section] = course
	}

	for _, s := range mockDemoStudents {
		student, ok := UserByUsername(s.Username)
		if !ok {
			gpa := s.GPA
			year := s.Year
			created, err := CreateUser(models.User{
				Username:  &s.Username,
				FullName:  s.FullName,
				Email:     s.Email,
				Role:      models.RoleStudent,
				StudentID: &s.StudentID,
				GPA:       &gpa,
				Faculty:   &s.Faculty,
				Year:      &year,
			})
			if err != nil {
				return err
			}
			student = created
			if err := setPassword(student.ID); err != nil {
				return err
			}
		}

		if s.Section == 0 {
			continue
		}
		course := courses[s.Section]
		if err := moveLegacyMockApplication(student.ID, courses[1].ID, course.ID); err != nil {
			return err
		}

		grade := s.Grade
		if _, err := CreateApplication(models.Application{
			StudentID:   student.ID,
			CourseID:    course.ID,
			RoleApplied: models.RoleLabBoy,
			Status:      models.AppPending,
			Grade:       &grade,
		}); err != nil && err != ErrConflict {
			return err
		}
	}

	return nil
}

// ensureMockDemoSection creates one section of the demo course, or brings an
// existing one in line with the seed without touching instructor edits.
func ensureMockDemoSection(sec mockDemoSection, instructorID uint) (models.Course, error) {
	course, found := FindCourseSlot(mockDemoCourseBase.Code, mockDemoCourseBase.Semester, mockDemoCourseBase.AcademicYear, sec.Section, 0)
	if !found {
		deadline := time.Now().AddDate(0, 0, 21)
		newCourse := mockDemoCourseBase
		newCourse.InstructorID = &instructorID
		newCourse.Section = sec.Section
		newCourse.Schedule = sec.Schedule
		newCourse.LabBoySlots = sec.LabBoySlots
		newCourse.Deadline = &deadline
		course = CreateCourse(newCourse)
		if course.ID == 0 {
			return models.Course{}, fmt.Errorf("create demo course section %d", sec.Section)
		}
	} else {
		// Seed only an untouched draft, or shrink section 1 from the old
		// single-section seed; retain existing recruitment decisions.
		course = courseWithInstructor(course)
		if course.Status == models.StatusDraft || course.LabBoySlots == mockDemoLegacySlots {
			var saved bool
			course, saved = UpdateCourse(course.ID, func(c *models.Course) {
				c.InstructorID = &instructorID
				if c.Status == models.StatusDraft {
					c.Status = models.StatusOpen
				}
				c.LabBoySlots = sec.LabBoySlots
			})
			if !saved {
				return models.Course{}, fmt.Errorf("initialize demo posting section %d", sec.Section)
			}
		}
	}

	// Guarantee the instructor has a course_instructors row so InstructorCourses
	// (which JOINs on that table) can find this course regardless of whether
	// backfillCourseInstructors ran before or after the demo course was created.
	DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.CourseInstructor{
		CourseID:     course.ID,
		InstructorID: instructorID,
		Source:       models.CourseInstructorImported,
	})
	return course, nil
}

// moveLegacyMockApplication moves a demo student's still-pending application
// from section 1 (where the old single-section seed put everyone) to the
// section the student now belongs to.
func moveLegacyMockApplication(studentID, fromCourseID, toCourseID uint) error {
	if fromCourseID == toCourseID {
		return nil
	}
	from, ok := ActivePostingForCourse(fromCourseID)
	if !ok {
		return nil
	}
	to, ok := ActivePostingForCourse(toCourseID)
	if !ok {
		return nil
	}
	return DB.Model(&models.Application{}).
		Where("student_id = ? AND posting_id = ? AND status = ?", studentID, from.ID, models.AppPending).
		Updates(map[string]any{"course_id": toCourseID, "posting_id": to.ID}).Error
}

// setPassword gives a freshly-created demo account the same login password
// ("password123") every other seeded account uses, since CreateUser doesn't
// set one on its own (real signups go through Google OAuth instead).
func setPassword(userID uint) error {
	bcryptHash := "$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO"
	_, ok := UpdateUser(userID, func(u *models.User) {
		u.PasswordHash = &bcryptHash
	})
	if !ok {
		return ErrConflict
	}
	return nil
}
