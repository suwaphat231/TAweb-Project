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
// The section meets Tue and Thu, so it is two courses (one per day); the
// applicants are on the Tuesday one.
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

	// A section meeting on several days is one course per day (slot 0, 1, …),
	// matching the classlist import. Each day is opened on its own; the
	// pre-applied students apply to the first day.
	var course models.Course
	for slot, schedule := range SplitScheduleDays(mockDemoSection.Schedule) {
		dayCourse, err := seedDemoCourseSlot(instructor.ID, slot, schedule)
		if err != nil {
			return err
		}
		if slot == 0 {
			course = dayCourse
		}
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

	if err := seedMockReports(); err != nil {
		return err
	}

	return nil
}

// seedDemoCourseSlot creates (or initializes, if still an untouched draft) the
// demo course for one meeting day and links its instructor.
func seedDemoCourseSlot(instructorID uint, slot int, schedule string) (models.Course, error) {
	course, found := FindCourseSlot(mockDemoCourseBase.Code, mockDemoCourseBase.Semester, mockDemoCourseBase.AcademicYear, mockDemoSection.Section, slot)
	if !found {
		deadline := time.Now().AddDate(0, 0, 21)
		newCourse := mockDemoCourseBase
		newCourse.InstructorID = &instructorID
		newCourse.Section = mockDemoSection.Section
		newCourse.Slot = slot
		newCourse.Schedule = schedule
		newCourse.Deadline = &deadline
		course = CreateCourse(newCourse)
		if course.ID == 0 {
			return course, fmt.Errorf("create demo course slot %d", slot)
		}
	} else {
		// Seed only an untouched draft; retain existing recruitment decisions.
		course = courseWithInstructor(course)
		if course.Status == models.StatusDraft {
			var saved bool
			course, saved = UpdateCourse(course.ID, func(c *models.Course) {
				c.InstructorID = &instructorID
				c.Status = models.StatusOpen
				c.LabBoySlots = mockDemoCourseBase.LabBoySlots
			})
			if !saved {
				return course, fmt.Errorf("initialize demo posting slot %d", slot)
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

// seedMockReports sets up realistic dummy data for testing the blacklist
// and performance report system across all roles (instructor, staff, student).
func seedMockReports() error {
	staff, ok := UserByUsername(mockDemoStaff.Username)
	if !ok {
		return nil
	}
	instructor, ok := UserByUsername(mockDemoInstructor.Username)
	if !ok {
		return nil
	}

	// Course in a past semester (2/2568) where Lab Boy served
	pastCourse, found := FindCourseSlot("517121", "2", 2568, 1, 0)
	if !found {
		pastDeadline := time.Now().AddDate(-1, 0, 0)
		pastCourse = CreateCourse(models.Course{
			Code:         "517121",
			Title:        "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 1",
			EnglishTitle: "COMPUTER PROGRAMMING SKILL 1",
			Semester:     "2",
			AcademicYear: 2568,
			Section:      1,
			Slot:         0,
			Schedule:     "จ 09:00-12:00",
			InstructorID: &instructor.ID,
			LabBoySlots:  4,
			Status:       models.StatusClosed,
			Deadline:     &pastDeadline,
		})
		if pastCourse.ID == 0 {
			return fmt.Errorf("create past demo course for reports")
		}
	}

	DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.CourseInstructor{
		CourseID:     pastCourse.ID,
		InstructorID: instructor.ID,
		Source:       models.CourseInstructorImported,
	})

	// Case 1: demo_std03 (กิตติภูมิ ทองสุข) -> Confirmed Report (Blacklist History)
	// When instructor puriwat reviews applicants for 517122 in 1/2569, this applicant
	// will clearly display a red badge "มีประวัติที่ยืนยันแล้ว 1 รายการ"
	if std03, ok := UserByUsername("demo_std03"); ok {
		var existingApp models.Application
		if err := DB.Where("student_id = ? AND course_id = ?", std03.ID, pastCourse.ID).First(&existingApp).Error; err != nil {
			existingApp, _ = CreateApplication(models.Application{
				StudentID:   std03.ID,
				CourseID:    pastCourse.ID,
				RoleApplied: models.RoleLabBoy,
				Status:      models.AppAccepted,
			})
		}
		if existingApp.ID > 0 {
			var repCount int64
			DB.Model(&models.LabBoyReport{}).Where("application_id = ? AND category = ?", existingApp.ID, models.CategoryAbsence).Count(&repCount)
			if repCount == 0 {
				incidentDate := time.Now().AddDate(0, -2, -10)
				submittedAt := incidentDate.AddDate(0, 0, 1)
				confirmedAt := incidentDate.AddDate(0, 0, 3)

				report := models.LabBoyReport{
					ApplicationID: existingApp.ID,
					StudentID:     std03.ID,
					CourseID:      pastCourse.ID,
					ReporterID:    instructor.ID,
					IncidentDate:  incidentDate,
					Category:      models.CategoryAbsence,
					Description:   "ไม่มาปฏิบัติหน้าที่คุมปฏิบัติการประจำสัปดาห์ที่ 5 โดยไม่แจ้งล่วงหน้า และไม่สามารถติดต่อได้ ทำให้นักศึกษาในแล็บไม่มีผู้ช่วยสอนคอยดูแล",
					Impact:        "อาจารย์ผู้สอนต้องตรวจแล็บและแก้ไขปัญหาเครื่องคอมพิวเตอร์ด้วยตนเองทั้งหมด",
					Status:        models.ReportConfirmed,
					SubmittedAt:   &submittedAt,
					CreatedAt:     submittedAt,
					UpdatedAt:     confirmedAt,
				}
				if err := DB.Create(&report).Error; err == nil {
					fromStatus := models.ReportUnderReview
					reason := "ตรวจสอบหลักฐานการลงเวลาและบันทึกการสอนแล้ว พบว่าขาดแล็บจริงโดยไม่มีการลา จึงยืนยันรายงานเพื่อเป็นประวัติประกอบการพิจารณาในอนาคต"
					DB.Create(&models.LabBoyReportStatusHistory{
						ReportID:   report.ID,
						FromStatus: &fromStatus,
						ToStatus:   models.ReportConfirmed,
						ActorID:    staff.ID,
						Reason:     reason,
						CreatedAt:  confirmedAt,
					})
					DB.Create(&models.LabBoyReportReview{
						ReportID:   report.ID,
						ReviewerID: staff.ID,
						Decision:   models.DecisionConfirm,
						Reason:     reason,
						CreatedAt:  confirmedAt,
					})
					// Also seed into legacy blacklists table for full compatibility
					DB.Create(&models.Blacklist{
						StudentID:     std03.ID,
						ApplicationID: &existingApp.ID,
						CourseID:      &pastCourse.ID,
						ReportedByID:  instructor.ID,
						Reason:        report.Description,
						CreatedAt:     confirmedAt,
					})
				}
			}
		}
	}

	// Case 2: demo_std01 (ธนภัทร ศรีวิไล) -> Awaiting Student Response
	// When logging in with dev-login "นักศึกษา" and navigating to /student/reports,
	// the student can view the report and test submitting an explanation.
	if std01, ok := UserByUsername("demo_std01"); ok {
		var existingApp models.Application
		if err := DB.Where("student_id = ? AND course_id = ?", std01.ID, pastCourse.ID).First(&existingApp).Error; err != nil {
			existingApp, _ = CreateApplication(models.Application{
				StudentID:   std01.ID,
				CourseID:    pastCourse.ID,
				RoleApplied: models.RoleLabBoy,
				Status:      models.AppAccepted,
			})
		}
		if existingApp.ID > 0 {
			var repCount int64
			DB.Model(&models.LabBoyReport{}).Where("application_id = ? AND category = ?", existingApp.ID, models.CategoryDutyNeglect).Count(&repCount)
			if repCount == 0 {
				incidentDate := time.Now().AddDate(0, 0, -4)
				submittedAt := incidentDate.AddDate(0, 0, 1)

				report := models.LabBoyReport{
					ApplicationID: existingApp.ID,
					StudentID:     std01.ID,
					CourseID:      pastCourse.ID,
					ReporterID:    instructor.ID,
					IncidentDate:  incidentDate,
					Category:      models.CategoryDutyNeglect,
					Description:   "ออกจากห้องปฏิบัติการก่อนเวลาเลิกแล็บ 45 นาที และไม่ได้ช่วยจัดเก็บอุปกรณ์คอมพิวเตอร์หลังเลิกคาบ",
					Impact:        "เพื่อนผู้ช่วยสอนอีกคนต้องอยู่เก็บอุปกรณ์คอมพิวเตอร์เพียงคนเดียว",
					Status:        models.ReportAwaitingResponse,
					SubmittedAt:   &submittedAt,
					CreatedAt:     submittedAt,
					UpdatedAt:     submittedAt,
				}
				if err := DB.Create(&report).Error; err == nil {
					fromStatus := models.ReportSubmitted
					DB.Create(&models.LabBoyReportStatusHistory{
						ReportID:   report.ID,
						FromStatus: &fromStatus,
						ToStatus:   models.ReportAwaitingResponse,
						ActorID:    staff.ID,
						Reason:     "ขอให้นักศึกษาชี้แจงเหตุผลที่ออกจากห้องแล็บก่อนเวลาเลิกเรียน",
						CreatedAt:  submittedAt,
					})
				}
			}
		}
	}

	// Case 3: demo_std05 (อดิศร แก้วมณี) -> Submitted / Pending Staff Review
	// When logging in with dev-login "เจ้าหน้าที่" and navigating to /staff/reports,
	// staff can test reviewing, requesting response, confirming, or rejecting the report.
	if std05, ok := UserByUsername("demo_std05"); ok {
		var existingApp models.Application
		if err := DB.Where("student_id = ? AND course_id = ?", std05.ID, pastCourse.ID).First(&existingApp).Error; err != nil {
			existingApp, _ = CreateApplication(models.Application{
				StudentID:   std05.ID,
				CourseID:    pastCourse.ID,
				RoleApplied: models.RoleLabBoy,
				Status:      models.AppAccepted,
			})
		}
		if existingApp.ID > 0 {
			var repCount int64
			DB.Model(&models.LabBoyReport{}).Where("application_id = ? AND category = ?", existingApp.ID, models.CategoryLateNotice).Count(&repCount)
			if repCount == 0 {
				incidentDate := time.Now().AddDate(0, 0, -2)
				submittedAt := incidentDate.AddDate(0, 0, 1)

				report := models.LabBoyReport{
					ApplicationID: existingApp.ID,
					StudentID:     std05.ID,
					CourseID:      pastCourse.ID,
					ReporterID:    instructor.ID,
					IncidentDate:  incidentDate,
					Category:      models.CategoryLateNotice,
					Description:   "แจ้งลาการปฏิบัติหน้าที่ล่วงหน้าเพียง 10 นาทีก่อนเริ่มคาบเรียน โดยแจ้งว่าตื่นสาย",
					Impact:        "ผู้สอนต้องประสานงานหาผู้ช่วยสอนคนอื่นมาช่วยดูแลแทนอย่างกะทันหัน",
					Status:        models.ReportSubmitted,
					SubmittedAt:   &submittedAt,
					CreatedAt:     submittedAt,
					UpdatedAt:     submittedAt,
				}
				if err := DB.Create(&report).Error; err == nil {
					fromStatus := models.ReportDraft
					DB.Create(&models.LabBoyReportStatusHistory{
						ReportID:   report.ID,
						FromStatus: &fromStatus,
						ToStatus:   models.ReportSubmitted,
						ActorID:    instructor.ID,
						Reason:     "ส่งรายงานพฤติกรรมเพื่อให้เจ้าหน้าที่ภาควิชาพิจารณาตรวจสอบ",
						CreatedAt:  submittedAt,
					})
				}
			}
		}
	}

	return nil
}

