package database

import (
	"labassist/models"
	"time"
)

// mockDemoInstructor reuses the existing seeded instructor account
// (username "ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์" from database/Docker/user.sql,
// password123) rather than a separate demo login, so testing this scenario
// doesn't require remembering a new account. If that account isn't present yet
// (e.g. a fresh DB that hasn't run user.sql), it's created here with the same
// identity so the seed still works.
var mockDemoInstructor = struct {
	Username string
	FullName string
	Email    string
}{"ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์", "ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์", "somchai@cp.su.ac.th"}

// mockDemoCourseBase holds the fields shared by the demo posting.
// The department only recruits Lab Boy positions — 6 slots, 1 section,
// leaving 1 slot open for a real student to apply during end-to-end testing.
var mockDemoCourseBase = models.Course{
	Code:         "204223",
	Title:        "การพัฒนาโปรแกรมประยุกต์บนเว็บ",
	EnglishTitle: "WEB APPLICATION DEVELOPMENT",
	Semester:     "1",
	AcademicYear: 2568,
	LabBoySlots:  6,
	Status:       models.StatusOpen,
}

// mockDemoSection is the single teaching section for the demo course.
var mockDemoSection = struct {
	Section  int
	Schedule string
}{1, "จ,พ,ศ 09:00-12:00"}

// mockDemoCourse2Base is a second course the instructor can use to create a
// Lab Boy posting — kept in draft so the instructor opens it themselves.
var mockDemoCourse2Base = models.Course{
	Code:         "517122",
	Title:        "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2",
	EnglishTitle: "COMPUTER PROGRAMMING SKILL 2",
	Semester:     "1",
	AcademicYear: 2569,
	LabBoySlots:  0,
	Status:       models.StatusDraft,
}

var mockDemoCourse2Section = struct {
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

// mockDemoStudents are 5 pre-seeded applicants (pending) — the 6th slot is
// intentionally left open for a real student to fill during manual testing.
// Flow: real student applies → instructor (somchai) accepts all 6 →
// staff (parinya) verifies form → staff creates payroll documents.
var mockDemoStudents = []mockDemoStudent{
	{"demo_std01", "ธนภัทร ศรีวิไล", "demo_std01@example.com", "6410123456", 3.85, "เทคโนโลยีสารสนเทศ", 3, "A"},
	{"demo_std02", "ปวีณ์นุช อินทรสุวรรณ", "demo_std02@example.com", "6410123457", 3.42, "วิทยาการคอมพิวเตอร์", 3, "B+"},
	{"demo_std03", "กิตติภูมิ ทองสุข", "demo_std03@example.com", "6410123458", 3.15, "วิทยาการคอมพิวเตอร์", 2, "B"},
	{"demo_std04", "ศศิวิมล บุญมาก", "demo_std04@example.com", "6410123459", 3.67, "เทคโนโลยีสารสนเทศ", 3, "A"},
	{"demo_std05", "อดิศร แก้วมณี", "demo_std05@example.com", "6410123460", 2.89, "วิทยาการคอมพิวเตอร์", 3, "B+"},
}

// seedMockApplicants sets up the staff-document end-to-end demo:
// one instructor with an open Lab Boy posting (6 slots, section 1) and
// 5 pre-applied students — leaving the 6th slot open for manual testing.
// The instructor/course/students and applications are DB-backed.
// Duplicate applications are skipped so restarting does not overwrite
// existing reviews or grade proofs.
func seedMockApplicants() error {
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

	var course models.Course
	err := DB.Where("code = ? AND instructor_id = ? AND semester = ? AND academic_year = ? AND section = ?",
		mockDemoCourseBase.Code, instructor.ID, mockDemoCourseBase.Semester, mockDemoCourseBase.AcademicYear, mockDemoSection.Section).
		First(&course).Error
	if err != nil {
		deadline := time.Now().AddDate(0, 0, 21)
		newCourse := mockDemoCourseBase
		newCourse.InstructorID = instructor.ID
		newCourse.Section = mockDemoSection.Section
		newCourse.Schedule = mockDemoSection.Schedule
		newCourse.Deadline = &deadline
		desc := "รับสมัครผู้ดูแลห้องปฏิบัติการ (Lab Boy) ประจำภาคการศึกษา"
		newCourse.Description = &desc
		course = CreateCourse(newCourse)
	} else if course.LabBoySlots != mockDemoCourseBase.LabBoySlots {
		// Migrate existing course to the correct slot count.
		DB.Model(&course).Update("lab_boy_slots", mockDemoCourseBase.LabBoySlots)
		course.LabBoySlots = mockDemoCourseBase.LabBoySlots
	}

	// Second course (draft) — instructor can open it for Lab Boy applications.
	var course2 models.Course
	if err := DB.Where("code = ? AND instructor_id = ? AND semester = ? AND academic_year = ? AND section = ?",
		mockDemoCourse2Base.Code, instructor.ID, mockDemoCourse2Base.Semester, mockDemoCourse2Base.AcademicYear, mockDemoCourse2Section.Section).
		First(&course2).Error; err != nil {
		newCourse2 := mockDemoCourse2Base
		newCourse2.InstructorID = instructor.ID
		newCourse2.Section = mockDemoCourse2Section.Section
		newCourse2.Schedule = mockDemoCourse2Section.Schedule
		CreateCourse(newCourse2)
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
