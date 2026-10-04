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

// mockDemoCourseBase is the primary debug course: open, 6 Lab Boy slots,
// 5 pre-applied students — the 6th slot is left for a real student to fill.
var mockDemoCourseBase = models.Course{
	Code:         "517122",
	Title:        "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2",
	EnglishTitle: "COMPUTER PROGRAMMING SKILL 2",
	Semester:     "1",
	AcademicYear: 2569,
	LabBoySlots:  6,
	Status:       models.StatusOpen,
}

var mockDemoSection = struct {
	Section  int
	Schedule string
}{1, "อ,พฤ 13:00-16:00"}

type mockDemoStudent struct {
	Username  string
	FullName  string
	Email     string
	StudentID string
	GPA       float64
	Faculty   string
	Year      int8
	Grade     string
}

// demo_std01 is the student dev-login account and applies manually.
// The other five accounts are pre-seeded applicants for instructor puriwat.
var mockDemoStudents = []mockDemoStudent{
	{"demo_std01", "ธนภัทร ศรีวิไล", "demo_std01@example.com", "6410123456", 3.85, "เทคโนโลยีสารสนเทศ", 3, "A"},
	{"demo_std02", "ปวีณ์นุช อินทรสุวรรณ", "demo_std02@example.com", "6410123457", 3.42, "วิทยาการคอมพิวเตอร์", 3, "B+"},
	{"demo_std03", "กิตติภูมิ ทองสุข", "demo_std03@example.com", "6410123458", 3.15, "วิทยาการคอมพิวเตอร์", 2, "B"},
	{"demo_std04", "ศศิวิมล บุญมาก", "demo_std04@example.com", "6410123459", 3.67, "เทคโนโลยีสารสนเทศ", 3, "A"},
	{"demo_std05", "อดิศร แก้วมณี", "demo_std05@example.com", "6410123460", 2.89, "วิทยาการคอมพิวเตอร์", 3, "B+"},
	{"demo_std06", "ณัฐพล ทดสอบระบบ", "demo_std06@example.com", "6410123461", 3.50, "วิทยาการคอมพิวเตอร์", 3, "A"},
}

// seedMockApplicants sets up the debug demo:
// one instructor with an open Lab Boy posting (6 slots, section 1) and
// 5 pre-applied students — leaving the 6th slot open for manual testing.
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

	course, found := FindCourseByKey(mockDemoCourseBase.Code, mockDemoCourseBase.Semester, mockDemoCourseBase.AcademicYear, mockDemoSection.Section)
	if !found {
		deadline := time.Now().AddDate(0, 0, 21)
		newCourse := mockDemoCourseBase
		newCourse.InstructorID = &instructor.ID
		newCourse.Section = mockDemoSection.Section
		newCourse.Schedule = mockDemoSection.Schedule
		newCourse.Deadline = &deadline
		course = CreateCourse(newCourse)
		if course.ID == 0 {
			return fmt.Errorf("create demo course")
		}
	} else {
		// Seed only an untouched draft; retain existing recruitment decisions.
		course = courseWithInstructor(course)
		if course.Status == models.StatusDraft {
			var saved bool
			course, saved = UpdateCourse(course.ID, func(c *models.Course) {
				c.InstructorID = &instructor.ID
				c.Status = models.StatusOpen
				c.LabBoySlots = mockDemoCourseBase.LabBoySlots
			})
			if !saved {
				return fmt.Errorf("initialize demo posting")
			}
		}
	}

	// Guarantee the instructor has a course_instructors row so InstructorCourses
	// (which JOINs on that table) can find this course regardless of whether
	// backfillCourseInstructors ran before or after the demo course was created.
	DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.CourseInstructor{
		CourseID:     course.ID,
		InstructorID: instructor.ID,
		Source:       models.CourseInstructorImported,
	})

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

		if s.Username == "demo_std01" {
			continue
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
