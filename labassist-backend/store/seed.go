package store

import (
	"time"

	"labassist/models"
)

// seed populates the mock store with the same fixtures the old
// database/migrations/seed.sql used, so logins and demo data match.
func seed() {
	const pwHash = "$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO" // password123
	now := time.Now()

	str := func(s string) *string { return &s }
	f64 := func(f float64) *float64 { return &f }
	i8 := func(i int8) *int8 { return &i }
	date := func(s string) *time.Time {
		t, _ := time.Parse("2006-01-02", s)
		return &t
	}

	addStaffUser := func(username, fullName, email string, role models.UserRole) *models.User {
		u := &models.User{
			ID: nextUserID, Username: str(username), PasswordHash: str(pwHash),
			FullName: fullName, Email: email, Role: role,
			IsActive: true, CreatedAt: now, UpdatedAt: now,
		}
		users = append(users, u)
		nextUserID++
		return u
	}

	addStudent := func(username, fullName, email, studentID string, gpa float64, faculty string, year int8, googleSub string) *models.User {
		u := &models.User{
			ID: nextUserID, Username: str(username), PasswordHash: str(pwHash),
			FullName: fullName, Email: email, Role: models.RoleStudent,
			StudentID: str(studentID), GPA: f64(gpa), Faculty: str(faculty), Year: i8(year),
			GoogleSub: str(googleSub), IsActive: true, CreatedAt: now, UpdatedAt: now,
		}
		users = append(users, u)
		nextUserID++
		return u
	}

	somchai := addStaffUser("somchai", "ผศ.ดร. สมชาย ใจดี", "somchai@cp.su.ac.th", models.RoleInstructor)
	malee := addStaffUser("malee", "รศ.ดร. มาลี ศรีสุข", "malee@cp.su.ac.th", models.RoleInstructor)
	thanakorn := addStaffUser("thanakorn", "อ. ธนากร แสงอรุณ", "thanakorn@cp.su.ac.th", models.RoleInstructor)
	addStaffUser("parinya", "ปริญญา สุภาวดี", "parinya@cp.su.ac.th", models.RoleStaff)
	addStaffUser("admin", "วิทยา ผู้ดูแลระบบ", "admin@cp.su.ac.th", models.RoleAdmin)

	pakpong := addStudent("pakpong", "ปกป้อง วงศ์ไทย", "pakpong@gmail.com", "650710245", 3.45, "วิทยาศาสตร์", 3, "google_sub_001")
	napatsara := addStudent("napatsara", "นภัสรา จันทรเดช", "napatsara@gmail.com", "650710102", 3.12, "วิทยาศาสตร์", 3, "google_sub_002")
	phumipath := addStudent("phumipath", "ภูมิพัฒน์ สีเขียว", "phumipath@gmail.com", "650710318", 3.78, "วิทยาศาสตร์", 3, "google_sub_003")
	warissara := addStudent("warissara", "วริศรา ทองดี", "warissara@gmail.com", "650710421", 2.95, "วิทยาศาสตร์", 2, "google_sub_004")
	nathapol := addStudent("nathapol", "ณัฐพล มีสุข", "nathapol@gmail.com", "650710533", 3.62, "วิทยาศาสตร์", 3, "google_sub_005")

	addCourse := func(code, title string, instructorID uint, taSlots, labboySlots int, status models.CourseStatus, deadline *time.Time) *models.Course {
		c := &models.Course{
			ID: nextCourseID, Code: code, Title: title, InstructorID: instructorID,
			Semester: "1", AcademicYear: 2567, TASlots: taSlots, LabBoySlots: labboySlots,
			Status: status, Deadline: deadline, CreatedAt: now, UpdatedAt: now,
		}
		courses = append(courses, c)
		nextCourseID++
		return c
	}

	cs101 := addCourse("CS101", "การโปรแกรมคอมพิวเตอร์เบื้องต้น", somchai.ID, 3, 2, models.StatusOpen, date("2024-09-30"))
	cs221 := addCourse("CS221", "โครงสร้างข้อมูลและอัลกอริทึม", somchai.ID, 2, 1, models.StatusOpen, date("2024-09-25"))
	addCourse("CS305", "เครือข่ายคอมพิวเตอร์", malee.ID, 2, 1, models.StatusClosed, nil)
	addCourse("CS312", "ระบบฐานข้อมูล", malee.ID, 2, 2, models.StatusClosed, nil)
	addCourse("CS340", "ปัญญาประดิษฐ์", thanakorn.ID, 2, 1, models.StatusClosingSoon, date("2024-09-20"))
	cs405 := addCourse("CS405", "วิศวกรรมซอฟต์แวร์", thanakorn.ID, 3, 1, models.StatusOpen, date("2024-10-05"))

	addApp := func(studentID, courseID uint, role models.RoleApplied, status models.AppStatus, motivation string) {
		a := &models.Application{
			ID: nextAppID, StudentID: studentID, CourseID: courseID, RoleApplied: role,
			Status: status, Motivation: str(motivation), AppliedAt: now,
		}
		applications = append(applications, a)
		nextAppID++
	}

	addApp(pakpong.ID, cs101.ID, models.RoleTA, models.AppAccepted, "สนใจสอนการโปรแกรมให้น้องปี 1 ครับ")
	addApp(napatsara.ID, cs101.ID, models.RoleLabBoy, models.AppPending, "อยากช่วยดูแลห้องแลปครับ")
	addApp(phumipath.ID, cs221.ID, models.RoleTA, models.AppAccepted, "เรียน CS221 ได้ A มาครับ")
	addApp(warissara.ID, cs405.ID, models.RoleTA, models.AppPending, "ต้องการประสบการณ์ด้าน SE")
	addApp(nathapol.ID, cs101.ID, models.RoleTA, models.AppPending, "มีประสบการณ์สอน Python มาก่อน")

	cs101.TAAccepted = 1
	cs221.TAAccepted = 1
}
