// Code generated from classlist2569_1_clean.xlsx (Silpakorn University, AY2569/1). DO NOT EDIT BY HAND.
package store

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

type classlistCourseRow struct {
	Code               string
	ThaiTitle          string
	GroupNote          string
	EnglishTitle       string
	Credits            string
	Section            int
	Capacity           int
	Enrolled           int
	Schedule           string
	InstructorUsername string
	CoInstructors      string
}

var classlistCourses = []classlistCourseRow{
	{"520101-165", "พื้นฐานคอมพิวเตอร์และวิทยาการสารสนเทศ", "บ.สนเทศปี1", "FOUNDATION OF COMPUTER AND INFORMATICS", "3 (2-2-5)", 1, 101, 101, "Fr 08:30 - 10:15 ร.วท.2; Fr 13:00 - 14:45 1227/1,1227/2 ว.1", "kanraya", "อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต"},
	{"520213-165", "โครงสร้างข้อมูลพื้นฐานและการประยุกต์", "บ.สนเทศปี2-4", "FUNDAMENTAL OF DATA STRUCTURES AND APPLICATIONS", "3 (2-2-5)", 1, 135, 132, "Mo 08:30 - 10:15 1227/1,1227/2 ว.1; Tu 13:55 - 16:35 4203 ว.4", "kritsana", ""},
	{"520213-2560", "โครงสร้างข้อมูลพื้นฐานและการประยุกต์", "บ.สนเทศปี6-8", "FUNDAMENTALS OF DATA STRUCTURES AND APPLICATIONS", "4 (3-2-7)", 1, 20, 0, "Mo 08:30 - 10:15 1227/1,1227/2 ว.1; Tu 13:55 - 16:35 4203 ว.4", "kritsana", ""},
	{"520214-1651", "ดิจิทัลแพลตฟอร์มและโครงสร้างพื้นฐาน", "บ.สนเทศปี2-5", "DIGITAL PLATFORM AND INFRASTRUCTURE", "3 (2-2-5)", 1, 100, 65, "Tu 08:30 - 10:15 1239 ว.1; Tu 10:20 - 12:05 1227/1,1227/2 ว.1", "natchote", "ผู้ช่วยศาสตราจารย์ ดร.คทา  ประดิษฐวงศ์"},
	{"520215-160", "พื้นฐานการเรียนรู้ของเครื่องเชิงสถิติ", "บ.คอมปี6-8", "FUNDAMENTALS OF STATISTICAL MACHINE LEARNING", "3 (2-2-5)", 1, 20, 6, "Th 10:20 - 12:05 1239 ว.1; Th 14:50 - 16:35 1227/1,1227/2 ว.1", "sunee", "นายบูชาภัทร  ป้านศรี"},
	{"520231-165", "การวิเคราะห์ข้อมูล", "บ.คอมปี2-5", "DATA ANALYTICS", "3 (2-2-5)", 1, 87, 86, "Th 10:20 - 12:05 1239 ว.1; Th 14:50 - 16:35 1227/1,1227/2 ว.1", "sunee", "นายบูชาภัทร  ป้านศรี"},
	{"520321-165", "การบริหารจัดการระบบฐานข้อมูล", "บ.สนเทศปี3ขึ้นไป", "DATABASE SYSTEM ADMINISTRATION", "3 (2-2-5)", 1, 123, 108, "Fr 13:00 - 14:45 ไววิทย์พุทธารี; Fr 14:50 - 16:35 1227/1,1227/2 ว.1", "orawan", ""},
	{"520321-2560", "การบริหารจัดการระบบฐานข้อมูล", "บ.สนเทศปี6-8", "DATABASE SYSTEM ADMINISTRATION", "3 (2-2-5)", 1, 10, 0, "Fr 13:00 - 14:45 ไววิทย์พุทธารี; Fr 14:50 - 16:35 1227/1,1227/2 ว.1", "orawan", ""},
	{"520331-165", "ปัญญาประดิษฐ์สำหรับเทคโนโลยีสารสนเทศ", "บ.สนเทศปี3ขึ้นไป", "ARTIFICIAL INTELLIGENCE FOR INFORMATION TECHNOLOGY", "3 (2-2-5)", 1, 94, 85, "Th 13:00 - 14:45 410A-410B; Th 14:50 - 16:35 410A-410B", "natchote", ""},
	{"520331-2560", "ปัญญาประดิษฐ์สำหรับเทคโนโลยีสารสนเทศ", "บ.สนเทศปี6-8 ตามรายชื่อ", "ARTFICIAL INTELLIGENCE FOR INFORMATION TECHNOLOGY", "3 (2-2-5)", 1, 0, 0, "Th 13:00 - 14:45 410A-410B; Th 14:50 - 16:35 410A-410B", "natchote", ""},
	{"520333-165", "การทำเหมืองข้อมูล", "ล.คอม สนเทศปี3-5", "DATA MINING", "3 (2-2-5)", 1, 40, 6, "We 08:30 - 12:05 1334 ว.1", "opas", ""},
	{"520335-165", "วิทยาการข้อมูลและเครื่องมือ", "ล.สนเทศปี3 *ปิด*", "DATA SCIENCE AND TOOLS", "3 (2-2-5)", 1, 0, 0, "We 13:00 - 14:45 410A-410B; We 14:50 - 16:35 410A-410B", "natchote", ""},
	{"520341-165", "การเขียนโปรแกรมแบบเว็บฝั่งไคลเอนต์", "บ.สนเทศปี3-5", "CLIENT SIDE WEB PROGRAMMING", "3 (2-2-5)", 1, 104, 102, "Th 08:30 - 10:15 410A-410B; Th 10:20 - 12:05 410A-410B", "sajjaporn", ""},
	{"520341-2560", "เทคโนโลยีและการเขียนโปรแกรมบนเครือข่ายอินเทอร์เน็ตและเวิลด์ไวด์เว็บ", "บ.สนเทศ ล.คอม ปี6-8", "INTERNET AND WORLD WIDE WEB TECHNOLOGY AND PROGRAMMING", "3 (2-2-5)", 1, 9999, 19, "Mo 13:00 - 14:45 1239 ว.1; Mo 14:50 - 16:35 1227/2 ว.1", "setthalath", ""},
	{"520342-165", "การเขียนโปรแกรมแบบเว็บฝั่งเซิร์ฟเวอร์", "บ.สนเทศปี3-5", "SERVER SIDE WEB PROGRAMMING", "3 (2-2-5)", 1, 104, 102, "We 08:30 - 10:15 410A-410B; We 10:20 - 12:05 410A-410B", "sajjaporn", "ผู้ช่วยศาสตราจารย์ ดร.ณัฐโชติ  พรหมฤทธิ์"},
	{"520342-2560", "สถาปัตยกรรมและเทคโนโลยีเครือข่ายคอมพิวเตอร์", "บ.สนเทศปี6-8", "COMPUTER NETWORK ARCHITECTURE AND TECHNOLOGY", "3 (2-2-5)", 1, 9999, 15, "Th 08:30 - 10:15 1227/2 ว.1; Th 10:20 - 12:05 1227/2 ว.1", "setthalath", ""},
	{"520346-165", "การพัฒนาโปรแกรมประยุกต์บนอุปกรณ์เคลื่อนที่สำหรับธุรกิจ", "บ.สนเทศปี3-4", "MOBILE APPLICATION DEVELOPMENT FOR BUSINESS", "3 (2-2-5)", 1, 80, 41, "Sa 08:30 - 10:15 1227/1,1227/2 ว.1; Sa 10:20 - 12:05 1227/1,1227/2 ว.1", "orawan", ""},
	{"520354-165", "ระบบปฏิบัติการหุ่นยนต์และการควบคุม", "ล.สารสนเทศ ปี 3-5", "ROBOT OPERATING SYSTEM AND CONTROL", "3 (2-2-5)", 1, 10, 0, "We 08:30 - 12:05 1639 ว.1", "kritsana", ""},
	{"520393-165", "การเตรียมโครงงานวิจัย", "บ.คอมปี3ขึ้นไป", "RESEARCH PROJECT PREPARATION", "1 (0-2-1)", 1, 20, 1, "Mo 12:10 - 13:50 1639 ว.1", "weenawadee", "ผู้ช่วยศาสตราจารย์ ดร.ปัญญนัท  อ้นพงษ์; อาจารย์อภิเษก  หงษ์วิทยากร; ผู้ช่วยศาสตราจารย์โอภาส  วงษ์ทวีทรัพย์; อาจารย์ ดร.เสาวลักษณ์  อร่ามพงศานุวัต; อาจารย์ ดร.วัสรา  รอดเหตุภัย"},
	{"520484-165", "เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 4", "บ.สนเทศปี3ขึ้นไป", "SELECTED TOPICS IN INFORMATION TECHNOLOGY IV", "3 (2-2-5)", 1, 10, 0, "Mo 14:50 - 16:35 1240 ว.1; We 16:40 - 18:25 1227/2 ว.1", "panyanat", ""},
	{"520486-165", "เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 6", "ล.สารสนเทศปี4ขึ้นไป", "SELECTED TOPICS IN INFORMATION TECHNOLOGY VI", "3 (2-2-5)", 1, 30, 3, "Tu 13:00 - 15:40 1639 ว.1", "panjai", ""},
	{"520487-2560", "เรื่องคัดเฉพาะทางเทคโนโลยีสารสนเทศ 7", "ล.สนเทศปี6-8", "SELECTED TOPICS IN INFORMATION TECHNOLOGY VII", "3 (2-2-5)", 1, 30, 9, "Tu 13:00 - 15:40 1639 ว.1", "panjai", ""},
}

// seedRealClasslist creates one instructor account per unique instructor
// named in the classlist, then one Course record per section row.
func seedRealClasslist(now time.Time) {
	instructorIDByUsername := make(map[string]uint, len(classlistInstructors))
	for _, ins := range classlistInstructors {
		u := &models.User{
			ID: nextUserID, Username: strPtr(ins.Username), PasswordHash: strPtr(pwHash),
			FullName: ins.FullName, Email: ins.Email, Role: models.RoleInstructor,
			IsActive: true, CreatedAt: now, UpdatedAt: now,
		}
		users = append(users, u)
		instructorIDByUsername[ins.Username] = u.ID
		nextUserID++
	}

	for _, row := range classlistCourses {
		c := &models.Course{
			ID:           nextCourseID,
			Code:         row.Code,
			Title:        row.ThaiTitle,
			EnglishTitle: row.EnglishTitle,
			GroupNote:    row.GroupNote,
			Credits:      row.Credits,
			Section:      row.Section,
			Capacity:     row.Capacity,
			Enrolled:     row.Enrolled,
			Schedule:     row.Schedule,
			InstructorID: instructorIDByUsername[row.InstructorUsername],
			CoInstructors: row.CoInstructors,
			Semester:     "1",
			AcademicYear: 2569,
			Status:       models.StatusDraft,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		courses = append(courses, c)
		nextCourseID++
	}
}
