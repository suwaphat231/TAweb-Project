// Code generated from classlist2569_1_clean.xlsx (Silpakorn University, AY2569/1). DO NOT EDIT BY HAND.
package database

import (
	"labassist/models"
)

// pwHash is the bcrypt hash of "password123", used for every seeded login.
const pwHash = "$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO"

func strPtr(s string) *string { return &s }

type classlistInstructor struct {
	Username string
	FullName string
	Email    string
}

var classlistInstructors = []classlistInstructor{
	{"kanraya", "ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน", ""},
	{"saowaluck", "อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต", ""},
	{"kritsana", "ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน", ""},
	{"natchote", "ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์", ""},
	{"katha", "ผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์", ""},
	{"sunee", "ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ", ""},
	{"buchapat", "นายบูชาภัทร  ป้านศรี", ""},
	{"orawan", "ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต", ""},
	{"opas", "ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์", ""},
	{"sajjaporn", "ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา", ""},
	{"setthalath", "อาจารย์เสฐลัทธ์  รอดเหตุภัย", ""},
	{"aphisek", "อาจารย์อภิเษก  หงษ์วิทยากร", ""},
	{"panjai", "รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์", ""},
	{"weenawadee", "ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น", ""},
	{"panyanat", "ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์", ""},
	{"watsara", "อาจารย์ ดร.วัสรา  รอดเหตุภัย", ""},
	{"ratchadaporn", "ผู้ช่วยศาสตราจารย์ ดร.รัชดาพร  คณาวงษ์", ""},
	{"puriwat", "อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์", ""},
}

// seedClasslistInstructors creates one Postgres user record per unique
// instructor named in the classlist so an admin's later course import (via
// AdminHandler.ImportCourses) has real instructors to match against. It
// intentionally does not create any Course records — courses only appear
// once an admin imports them from a spreadsheet. Safe to call on every
// startup: existing usernames are skipped.
func seedClasslistInstructors() error {
	for _, ins := range classlistInstructors {
		var count int64
		if err := DB.Model(&models.User{}).Where("username = ?", ins.Username).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}

		email := ins.Email
		if email == "" {
			// The classlist doesn't carry instructor emails; synthesize one
			// so the column's NOT NULL + unique constraints are satisfied.
			email = ins.Username + "@cp.su.ac.th"
		}
		username := ins.Username
		u := models.User{
			Username:     &username,
			PasswordHash: strPtr(pwHash),
			FullName:     ins.FullName,
			Email:        email,
			Role:         models.RoleInstructor,
			IsActive:     true,
		}
		if err := DB.Create(&u).Error; err != nil {
			return err
		}
	}
	return nil
}
