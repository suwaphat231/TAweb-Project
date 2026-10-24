package database

import (
	"fmt"
	"labassist/models"
	"time"

	"gorm.io/gorm"
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

type mockDemoStudent struct {
	Username  string
	FullName  string
	Email     string
	StudentID string
	GPA       float64
	Faculty   string
	Year      int8
	Grade     string
	Prefix    string
}

// 12 demo student accounts, used by the Lab Boy report demo below
var mockDemoStudents = []mockDemoStudent{
	{"demo_std01", "ธนภัทร ศรีวิไล", "demo_std01@example.com", "6410123456", 3.85, "เทคโนโลยีสารสนเทศ", 3, "A", models.NamePrefixMr},
	{"demo_std02", "ปวีณ์นุช อินทรสุวรรณ", "demo_std02@example.com", "6410123457", 3.42, "วิทยาการคอมพิวเตอร์", 3, "B+", models.NamePrefixMiss},
	{"demo_std03", "กิตติภูมิ ทองสุข", "demo_std03@example.com", "6410123458", 3.15, "วิทยาการคอมพิวเตอร์", 2, "B", models.NamePrefixMr},
	{"demo_std04", "ศศิวิมล บุญมาก", "demo_std04@example.com", "6410123459", 3.67, "เทคโนโลยีสารสนเทศ", 3, "A", models.NamePrefixMiss},
	{"demo_std05", "อดิศร แก้วมณี", "demo_std05@example.com", "6410123460", 2.89, "วิทยาการคอมพิวเตอร์", 3, "B+", models.NamePrefixMr},
	{"demo_std06", "ณัฐพล ทดสอบระบบ", "demo_std06@example.com", "6410123461", 3.50, "วิทยาการคอมพิวเตอร์", 3, "A", models.NamePrefixMr},
	{"demo_std07", "วรัญญู สุขเกษม", "demo_std07@example.com", "6410123462", 3.75, "วิทยาการคอมพิวเตอร์", 3, "A", models.NamePrefixMr},
	{"demo_std08", "ชลธิชา พงษ์สวัสดิ์", "demo_std08@example.com", "6410123463", 3.30, "เทคโนโลยีสารสนเทศ", 2, "B+", models.NamePrefixMiss},
	{"demo_std09", "รัฐศาสตร์ รุ่งเรือง", "demo_std09@example.com", "6410123464", 3.10, "วิทยาการคอมพิวเตอร์", 3, "B", models.NamePrefixMr},
	{"demo_std10", "กัลยารัตน์ บุญสิริ", "demo_std10@example.com", "6410123465", 3.90, "เทคโนโลยีสารสนเทศ", 4, "A", models.NamePrefixMiss},
	{"demo_std11", "ภาณุพงศ์ เจริญผล", "demo_std11@example.com", "6410123466", 3.25, "วิทยาการคอมพิวเตอร์", 2, "B+", models.NamePrefixMr},
	{"demo_std12", "สุจิตรา รัตนวงษ์", "demo_std12@example.com", "6410123467", 3.60, "วิทยาการคอมพิวเตอร์", 3, "A", models.NamePrefixMiss},
}

// seedMockApplicants sets up the debug demo accounts, the Lab Boy report
// demo and applicants for postings an instructor has already opened. It never
// opens a posting itself — that is the instructor's call.
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

	if _, ok := UserByUsername(mockDemoInstructor.Username); !ok {
		created, err := CreateUser(models.User{
			Username: &mockDemoInstructor.Username,
			FullName: mockDemoInstructor.FullName,
			Email:    mockDemoInstructor.Email,
			Role:     models.RoleInstructor,
		})
		if err != nil {
			return err
		}
		if err := setPassword(created.ID); err != nil {
			return err
		}
	}

	for _, s := range mockDemoStudents {
		if _, err := ensureDemoStudent(s); err != nil {
			return err
		}
	}

	if err := seedMockReports(); err != nil {
		return err
	}

	if err := seedDemo517121Applicants(); err != nil {
		return err
	}

	return nil
}

// mockDemo517121Applicants are 5 applicants per section for the open
// 517121 (1/2569) postings, kept separate from the 517122 demo students so
// nobody's lab times clash between the two courses.
var mockDemo517121Applicants = map[int][]mockDemoStudent{
	1: {
		{"demo_std13", "พิชญาภา วงศ์ทอง", "demo_std13@example.com", "6510123468", 3.72, "วิทยาการคอมพิวเตอร์", 2, "A", models.NamePrefixMiss},
		{"demo_std14", "ธีรภัทร มั่นคง", "demo_std14@example.com", "6510123469", 3.18, "วิทยาการคอมพิวเตอร์", 2, "B+", models.NamePrefixMr},
		{"demo_std15", "ณิชาภัทร แสงจันทร์", "demo_std15@example.com", "6510123470", 3.55, "เทคโนโลยีสารสนเทศ", 2, "A", models.NamePrefixMiss},
		{"demo_std16", "กฤตเมธ พรหมวงศ์", "demo_std16@example.com", "6410123468", 2.95, "วิทยาการคอมพิวเตอร์", 3, "B", models.NamePrefixMr},
		{"demo_std17", "สุพิชชา นาคสวัสดิ์", "demo_std17@example.com", "6410123469", 3.40, "เทคโนโลยีสารสนเทศ", 3, "B+", models.NamePrefixMiss},
	},
	2: {
		{"demo_std18", "ปัณณวัฒน์ ศรีสุข", "demo_std18@example.com", "6510123471", 3.81, "เทคโนโลยีสารสนเทศ", 2, "A", models.NamePrefixMr},
		{"demo_std19", "ชนิกานต์ ทองดี", "demo_std19@example.com", "6510123472", 3.27, "วิทยาการคอมพิวเตอร์", 2, "B+", models.NamePrefixMiss},
		{"demo_std20", "วชิรวิทย์ บุญเรือง", "demo_std20@example.com", "6410123470", 3.05, "วิทยาการคอมพิวเตอร์", 3, "B", models.NamePrefixMr},
		{"demo_std21", "อรปรียา จันทร์หอม", "demo_std21@example.com", "6410123471", 3.63, "เทคโนโลยีสารสนเทศ", 3, "A", models.NamePrefixMiss},
		{"demo_std22", "ศุภวิชญ์ เกษมสันต์", "demo_std22@example.com", "6310123456", 3.12, "วิทยาการคอมพิวเตอร์", 4, "B+", models.NamePrefixMr},
	},
}

// seedDemo517121Applicants adds pending applications to whichever 517121
// sections of 1/2569 are open for recruitment; closed or draft sections are
// left alone.
func seedDemo517121Applicants() error {
	for section, students := range mockDemo517121Applicants {
		course, found := FindCourseSlot("517121", "1", 2569, section, 0)
		if !found {
			continue
		}
		posting, ok := ActivePostingForCourse(course.ID)
		if !ok || (posting.Status != models.StatusOpen && posting.Status != models.StatusClosingSoon) {
			continue
		}
		for _, s := range students {
			student, err := ensureDemoStudent(s)
			if err != nil {
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
	}
	return nil
}

// relocateLegacyMockReports undoes an older seed that wrongly linked puriwat to
// 517121 (2/2568), which he never taught: the demo applications, reports and
// blacklist rows move to the 517122 past course and the bogus link is dropped.
func relocateLegacyMockReports(instructorID, pastCourseID uint) error {
	legacy, found := FindCourseSlot("517121", "2", 2568, 1, 0)
	if !found {
		return nil
	}
	var linked int64
	DB.Model(&models.CourseInstructor{}).
		Where("course_id = ? AND instructor_id = ?", legacy.ID, instructorID).Count(&linked)
	if linked == 0 {
		return nil
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		var appIDs []uint
		tx.Model(&models.Application{}).
			Joins("JOIN users ON users.id = applications.student_id").
			Where("applications.course_id = ? AND users.username LIKE ?", legacy.ID, "demo_std%").
			Pluck("applications.id", &appIDs)
		if len(appIDs) > 0 {
			// A trigger requires applications.course_id to match its posting.
			var posting models.Posting
			if err := tx.Where("course_id = ? AND is_active = true", pastCourseID).First(&posting).Error; err != nil {
				return fmt.Errorf("find posting for course %d: %w", pastCourseID, err)
			}
			if err := tx.Model(&models.Application{}).Where("id IN ?", appIDs).
				Updates(map[string]any{"course_id": pastCourseID, "posting_id": posting.ID}).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.LabBoyReport{}).Where("application_id IN ?", appIDs).
				Update("course_id", pastCourseID).Error; err != nil {
				return err
			}
		}
		// Older seeds also wrote blacklist rows without an application_id.
		if err := tx.Model(&models.Blacklist{}).
			Where("course_id = ? AND reported_by_id = ?", legacy.ID, instructorID).
			Update("course_id", pastCourseID).Error; err != nil {
			return err
		}
		return tx.Where("course_id = ? AND instructor_id = ?", legacy.ID, instructorID).
			Delete(&models.CourseInstructor{}).Error
	})
}

// ensureDemoStudent returns the demo student's account, creating it on first
// run. Accounts seeded before titles existed get their นาย/นางสาว filled in.
func ensureDemoStudent(s mockDemoStudent) (models.User, error) {
	if student, ok := UserByUsername(s.Username); ok {
		if student.NamePrefix == "" {
			if updated, saved := UpdateUser(student.ID, func(u *models.User) { u.NamePrefix = s.Prefix }); saved {
				student = updated
			}
		}
		return student, nil
	}
	gpa, year := s.GPA, s.Year
	created, err := CreateUser(models.User{
		Username:   &s.Username,
		NamePrefix: s.Prefix,
		FullName:   s.FullName,
		Email:      s.Email,
		Role:       models.RoleStudent,
		StudentID:  &s.StudentID,
		GPA:        &gpa,
		Faculty:    &s.Faculty,
		Year:       &year,
	})
	if err != nil {
		return created, err
	}
	return created, setPassword(created.ID)
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

	// Course in a past semester (2/2568) where Lab Boy served. puriwat really
	// taught 517122 that term (per classlist2568_2IT), not 517121.
	pastCourse, found := FindCourseSlot("517122", "2", 2568, 1, 0)
	if !found {
		pastDeadline := time.Now().AddDate(-1, 0, 0)
		pastCourse = CreateCourse(models.Course{
			Code:         "517122",
			Title:        "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2",
			EnglishTitle: "COMPUTER PROGRAMMING SKILL II",
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

	if err := relocateLegacyMockReports(instructor.ID, pastCourse.ID); err != nil {
		return err
	}

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

