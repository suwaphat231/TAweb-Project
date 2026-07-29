package store

import (
	"log"
	"time"

	"labassist/models"
)

// pwHash is the bcrypt hash of "password123", used for every seeded login.
const pwHash = "$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO"

func strPtr(s string) *string { return &s }

// Seed populates the database with demo fixtures on first startup.
// It is a no-op if any user already exists.
func Seed() {
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return
	}

	now := time.Now()
	f64 := func(f float64) *float64 { return &f }
	i8 := func(i int8) *int8 { return &i }

	addUser := func(u models.User) models.User {
		if err := db.Create(&u).Error; err != nil {
			log.Printf("seed: create user %q: %v", u.FullName, err)
		}
		return u
	}

	addStaffUser := func(username, fullName, email string, role models.UserRole) {
		addUser(models.User{
			Username: strPtr(username), PasswordHash: strPtr(pwHash),
			FullName: fullName, Email: email, Role: role,
			IsActive: true, CreatedAt: now, UpdatedAt: now,
		})
	}

	addStudent := func(username, fullName, email, studentID string, gpa float64, faculty string, year int8, googleSub string) {
		addUser(models.User{
			Username: strPtr(username), PasswordHash: strPtr(pwHash),
			FullName: fullName, Email: email, Role: models.RoleStudent,
			StudentID: strPtr(studentID), GPA: f64(gpa), Faculty: strPtr(faculty), Year: i8(year),
			GoogleSub: strPtr(googleSub), IsActive: true, CreatedAt: now, UpdatedAt: now,
		})
	}

	addStaffUser("somchai", "ผศ.ดร. สมชาย ใจดี", "somchai@cp.su.ac.th", models.RoleInstructor)
	addStaffUser("malee", "รศ.ดร. มาลี ศรีสุข", "malee@cp.su.ac.th", models.RoleInstructor)
	addStaffUser("thanakorn", "อ. ธนากร แสงอรุณ", "thanakorn@cp.su.ac.th", models.RoleInstructor)
	addStaffUser("parinya", "ปริญญา สุภาวดี", "parinya@cp.su.ac.th", models.RoleStaff)
	addStaffUser("admin", "วิทยา ผู้ดูแลระบบ", "admin@cp.su.ac.th", models.RoleAdmin)

	addStudent("pakpong", "ปกป้อง วงศ์ไทย", "pakpong@gmail.com", "650710245", 3.45, "วิทยาศาสตร์", 3, "google_sub_001")
	addStudent("napatsara", "นภัสรา จันทรเดช", "napatsara@gmail.com", "650710102", 3.12, "วิทยาศาสตร์", 3, "google_sub_002")
	addStudent("phumipath", "ภูมิพัฒน์ สีเขียว", "phumipath@gmail.com", "650710318", 3.78, "วิทยาศาสตร์", 3, "google_sub_003")
	addStudent("warissara", "วริศรา ทองดี", "warissara@gmail.com", "650710421", 2.95, "วิทยาศาสตร์", 2, "google_sub_004")
	addStudent("nathapol", "ณัฐพล มีสุข", "nathapol@gmail.com", "650710533", 3.62, "วิทยาศาสตร์", 3, "google_sub_005")

	seedRealClasslist(now)
}
