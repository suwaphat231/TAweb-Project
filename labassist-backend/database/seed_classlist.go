// Code generated from classlist2569_1_clean.xlsx (Silpakorn University, AY2569/1). DO NOT EDIT BY HAND.
package database

import (
	"labassist/models"
)

// pwHash is the bcrypt hash of "password123", used for every seeded login.
const pwHash = "$2a$10$Ws/75uKsYag.vd9tiCiAwuW143PDyh7.3n7dMYXmv6F2.fT5H6PBO"

func strPtr(s string) *string { return &s }

type classlistInstructor struct {
	Username   string
	FullName   string
	FullNameEn string
	Email      string
}

var classlistInstructors = []classlistInstructor{
	{"kanraya", "ผู้ช่วยศาสตราจารย์ ดร.กรัญญา  สิทธิสงวน", "Karanya Sitdhisanguan", ""},
	{"saowaluck", "อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต", "Saowalak Arampongsanuwat", ""},
	{"kritsana", "ผู้ช่วยศาสตราจารย์ ดร.กฤษณะ  สีพนมวัน", "Kristsana Seepanomwan", ""},
	{"natchote", "ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์", "Nuttachot Promrit", ""},
	{"katha", "ผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์", "Kata Praditwong", ""},
	{"sunee", "ผู้ช่วยศาสตราจารย์ ดร.สุนีย์  พงษ์พินิจภิญโญ", "Sunee Pongpinigpinyo", ""},
	{"buchapat", "นายบูชาภัทร  ป้านศรี", "Buchaputara Pansri", ""},
	{"orawan", "ผู้ช่วยศาสตราจารย์ ดร.อรวรรณ  เชาวลิต", "Orawan Chaowalit", ""},
	{"opas", "ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์", "Opas Wongtaweesap", ""},
	{"sajjaporn", "ผู้ช่วยศาสตราจารย์ ดร.สัจจาภรณ์  ไวจรรยา", "Sajjaporn Waijanya", ""},
	{"setthalath", "อาจารย์เสฐลัทธ์  รอดเหตุภัย", "Sethalat Rodhetbhai", ""},
	{"aphisek", "อาจารย์อภิเษก  หงษ์วิทยากร", "Apisake Hongwitayakorn", ""},
	{"panjai", "รองศาสตราจารย์ ดร.ปานใจ  ธารทัศนวงศ์", "Panjai Tantatsanawong", ""},
	{"weenawadee", "ผู้ช่วยศาสตราจารย์ ดร.วีณาวดี  ม่วงอ้น", "Weenawadee Muangon", ""},
	{"panyanat", "ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์", "Panyanat Aonpong", ""},
	{"watsara", "อาจารย์ ดร.วัสรา  รอดเหตุภัย", "Wasara Rodhetbhai", ""},
	{"ratchadaporn", "ผู้ช่วยศาสตราจารย์ ดร.รัชดาพร  คณาวงษ์", "Ratchadaporn Kanawong", ""},
	{"puriwat", "อาจารย์ ดร.ภูริวัจน์  วรวิชัยพัฒน์", "Phuriwat Worrawichaipat", ""},
	{"sirak", "ผศ.ดร.สิรักข์ แก้วจำนงค์", "Sirak Kaewjamnong", ""},
	{"nattapong", "อ.ดร.ณัฐพงศ์ จิวมั่งมี", "Nattapong Jewmungme", ""},
	{"tasanawan", "ผศ.ดร.ทัศนวรรณ ศูนย์กลาง", "Tasanawan Soonklang", ""},
}

// seedClasslistInstructors creates one MySQL user record per unique
// instructor named in the classlist so an admin's later course import (via
// AdminHandler.ImportCourses) has real instructors to match against. It
// intentionally does not create any Course records — courses only appear
// once an admin imports them from a spreadsheet. Safe to call on every
// startup: existing usernames are skipped, except that a blank English name
// is backfilled (one an admin already set is left alone).
func seedClasslistInstructors() error {
	for _, ins := range classlistInstructors {
		var count int64
		if err := DB.Model(&models.User{}).Where("username = ?", ins.Username).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			if err := DB.Model(&models.User{}).
				Where("username = ? AND full_name_en = ''", ins.Username).
				Update("full_name_en", ins.FullNameEn).Error; err != nil {
				return err
			}
			continue
		}

		email := ins.Email
		// if email == "" {
		// 	// The classlist doesn't carry instructor emails; synthesize one
		// 	// so the column's NOT NULL + unique constraints are satisfied.
		// 	email = ins.Username + "@cp.su.ac.th"
		// }
		username := ins.Username
		u := models.User{
			Username:     &username,
			PasswordHash: strPtr(pwHash),
			FullName:     ins.FullName,
			FullNameEn:   ins.FullNameEn,
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

// seedAdminAccount makes sure at least one admin login exists. The demo
// user.sql also carries an admin, but it only runs on an empty users table
// with SEED_DEMO_DATA=true — and the classlist instructors above are always
// seeded first, so without this the system would have no admin at all.
func seedAdminAccount() error {
	var count int64
	if err := DB.Model(&models.User{}).Where("role = ? OR username = ?", models.RoleAdmin, "admin").Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	username := "admin"
	u := models.User{
		Username:     &username,
		PasswordHash: strPtr(pwHash),
		FullName:     "ผู้ดูแลระบบ",
		Email:        "admin@cp.su.ac.th",
		Role:         models.RoleAdmin,
		IsActive:     true,
	}
	return DB.Create(&u).Error
}
