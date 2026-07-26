// Code generated from classlist2569_1_clean.xlsx (Silpakorn University, AY2569/1). DO NOT EDIT BY HAND.
package database

import (
	"time"

	"labassist/models"
)

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

// seedRealClasslist creates one instructor account per unique instructor
// named in the classlist so an admin's later course import (via
// AdminHandler.ImportCourses) has real instructors to match against.
// It intentionally does not create any Course records — courses only
// appear once an admin imports them from a spreadsheet.
func seedRealClasslist(now time.Time) {
	for _, ins := range classlistInstructors {
		users = append(users, &models.User{
			ID: nextUserID, Username: strPtr(ins.Username), PasswordHash: strPtr(pwHash),
			FullName: ins.FullName, Email: ins.Email, Role: models.RoleInstructor,
			IsActive: true, CreatedAt: now, UpdatedAt: now,
		})
		nextUserID++
	}
}
