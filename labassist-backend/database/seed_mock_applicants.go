package database

import (
	"labassist/models"
	"time"
)

// mockDemoInstructor reuses the existing seeded instructor account ("somchai"
// from database/Docker/user.sql, password123) rather than a separate demo
// login, so testing this scenario doesn't require remembering a new account.
// If that account isn't present yet (e.g. a fresh DB that hasn't run
// user.sql), it's created here with the same identity so the seed still works.
var mockDemoInstructor = struct {
	Username string
	FullName string
	Email    string
}{"somchai", "ผศ.ดร. ภูริวัจน์ วรวิชัยพัฒน์", "somchai@cp.su.ac.th"}

// mockDemoCourseBase holds the fields shared by every section of the demo
// posting; Section/Schedule vary per mockDemoSections entry below. The
// department only recruits Lab Boy positions — no TA slots.
var mockDemoCourseBase = models.Course{
	Code:         "204223",
	Title:        "การพัฒนาโปรแกรมประยุกต์บนเว็บ",
	EnglishTitle: "WEB APPLICATION DEVELOPMENT",
	Semester:     "1",
	AcademicYear: 2568,
	LabBoySlots:  4,
	Status:       models.StatusOpen,
}

// mockDemoSections is this course's two teaching sections/time slots — the
// same posting, two different times, so students can each apply to whichever
// suits them (see the multi-section posting feature this mirrors).
var mockDemoSections = []struct {
	Section  int
	Schedule string
}{
	{1, "จ,พ,ศ 09:00-12:00"},
	{2, "อ,พฤ 13:00-16:00"},
}

type mockDemoStudent struct {
	Username  string
	FullName  string
	Email     string
	StudentID string
	GPA       float64
	Faculty   string
	Year      int8
	Section   int // which of mockDemoSections this student applied to
	Grade     string
}

var mockDemoStudents = []mockDemoStudent{
	{"demo_std01", "ธนภัทร ศรีวิไล", "demo_std01@example.com", "6410123456", 3.85, "เทคโนโลยีสารสนเทศ", 3, 1, "A"},
	{"demo_std02", "ปวีณ์นุช อินทรสุวรรณ", "demo_std02@example.com", "6410123457", 3.42, "วิทยาการคอมพิวเตอร์", 3, 1, "B+"},
	{"demo_std03", "กิตติภูมิ ทองสุข", "demo_std03@example.com", "6410123458", 3.15, "วิทยาการคอมพิวเตอร์", 2, 2, "B"},
	{"demo_std04", "ศศิวิมล บุญมาก", "demo_std04@example.com", "6410123459", 3.67, "เทคโนโลยีสารสนเทศ", 3, 1, "A"},
	{"demo_std05", "อดิศร แก้วมณี", "demo_std05@example.com", "6410123460", 2.89, "วิทยาการคอมพิวเตอร์", 3, 2, "B+"},
	{"demo_std06", "จิรัชญา หอมสุคนธ์", "demo_std06@example.com", "6410123461", 3.91, "วิทยาการคอมพิวเตอร์", 4, 1, "A"},
	{"demo_std07", "ณัฐวุฒิ ประเสริฐสุข", "demo_std07@example.com", "6410123462", 3.05, "เทคโนโลยีสารสนเทศ", 2, 2, "C+"},
	{"demo_std08", "พิมพ์ชนก รุ่งเรือง", "demo_std08@example.com", "6410123463", 3.55, "วิทยาการคอมพิวเตอร์", 3, 2, "B+"},
	{"demo_std09", "เอกภพ ศรีสุวรรณ", "demo_std09@example.com", "6410123464", 2.76, "วิทยาการคอมพิวเตอร์", 3, 1, "C"},
	{"demo_std10", "ชนิสรา วัฒนกุล", "demo_std10@example.com", "6410123465", 3.30, "เทคโนโลยีสารสนเทศ", 3, 1, "B"},
}

// seedMockApplicants sets up a small end-to-end demo: one instructor with an
// open Lab Boy posting across 2 sections/time slots, and 10 students who've
// each applied to whichever section suits them, with the grade they got when
// they previously took the course — enough to try accepting/rejecting
// applicants and reviewing what each one submitted. The instructor/course/
// students are DB-backed and idempotent (safe on every startup); the
// applications themselves are the in-memory application layer (see
// database.go), so they are re-seeded fresh every time the process starts.
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

	coursesBySection := make(map[int]models.Course, len(mockDemoSections))
	for _, sec := range mockDemoSections {
		var course models.Course
		err := DB.Where("code = ? AND instructor_id = ? AND semester = ? AND academic_year = ? AND section = ?",
			mockDemoCourseBase.Code, instructor.ID, mockDemoCourseBase.Semester, mockDemoCourseBase.AcademicYear, sec.Section).
			First(&course).Error
		if err != nil {
			deadline := time.Now().AddDate(0, 0, 21)
			newCourse := mockDemoCourseBase
			newCourse.InstructorID = instructor.ID
			newCourse.Section = sec.Section
			newCourse.Schedule = sec.Schedule
			newCourse.Deadline = &deadline
			desc := "รับสมัครผู้ดูแลห้องปฏิบัติการ (Lab Boy) ประจำภาคการศึกษา"
			newCourse.Description = &desc
			course = CreateCourse(newCourse)
		}
		coursesBySection[sec.Section] = course
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

		course := coursesBySection[s.Section]
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
