package database

import (
	"fmt"
	"net"
	"os"
	"testing"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"labassist/config"
	"labassist/models"
)

func TestIsDemoReportCourse(t *testing.T) {
	demo := demoReportCourse
	cases := []struct {
		name string
		edit func(c *models.Course)
		want bool
	}{
		{"seed row as created", func(*models.Course) {}, true},
		{"renamed by curriculum backfill, moved slot", func(c *models.Course) { c.Code = "517122-165, -2560"; c.Slot = 2 }, true},
		{"real classlist row: has instructor text", func(c *models.Course) { c.InstructorsRaw = "ภูริวัจน์ วรวิชัยพัฒน์" }, false},
		{"real classlist time", func(c *models.Course) { c.Code = "517122-165, -2560"; c.Schedule = "Tu 14:50 - 16:35 1227/1" }, false},
		{"same code, other term", func(c *models.Course) { c.AcademicYear = 2569 }, false},
		{"same code, other semester", func(c *models.Course) { c.Semester = "1" }, false},
		{"same code, other section", func(c *models.Course) { c.Section = 2 }, false},
		{"other subject, same slot", func(c *models.Course) { c.Code = "517121" }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := demo
			tc.edit(&c)
			if got := isDemoReportCourse(c); got != tc.want {
				t.Fatalf("isDemoReportCourse(%+v) = %v, want %v", c, got, tc.want)
			}
		})
	}
}

// The demo report course must stay out of the demo instructor's "วิชาของฉัน"
// (and away from the real 517122-165, -2560 sections) across restarts and on
// databases seeded by the old code, while its report history stays intact.
func TestDemoReportCourseStaysOutOfMyCourses(t *testing.T) {
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to a disposable MySQL server")
	}
	parsed, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	root, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("labassist_demo_course_test_%d", time.Now().UnixNano())
	if err := root.Exec("CREATE DATABASE `" + name + "`").Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP DATABASE `" + name + "`"); conn, _ := root.DB(); conn.Close() })
	host, port, err := net.SplitHostPort(parsed.Addr)
	if err != nil {
		t.Fatal(err)
	}
	old := DB
	t.Cleanup(func() { DB = old })
	cfg := &config.Config{
		DBHost: host, DBPort: port, DBUser: parsed.User, DBPassword: parsed.Passwd, DBName: name,
		SeedDemoData: true,
	}
	connect := func() {
		t.Helper()
		if DB != nil && DB != old {
			conn, _ := DB.DB()
			conn.Close()
		}
		if err := Connect(cfg); err != nil {
			t.Fatal(err)
		}
	}
	connect()
	t.Cleanup(func() { conn, _ := DB.DB(); conn.Close() })

	instructor, ok := UserByUsername(mockDemoInstructor.Username)
	if !ok {
		t.Fatal("demo instructor not seeded")
	}
	demo, found := FindCourseSlot(demoReportCourse.Code, demoReportCourse.Semester,
		demoReportCourse.AcademicYear, demoReportCourse.Section, demoReportCourse.Slot)
	if !found {
		t.Fatal("demo report course not seeded")
	}

	check := func(stage string) {
		t.Helper()
		rels, err := MyCourseRelations(instructor.ID)
		if err != nil {
			t.Fatal(err)
		}
		realSections := map[int]bool{}
		for _, r := range rels {
			if isDemoReportCourse(r.Course) {
				t.Fatalf("%s: demo course %d (%q %q) listed in my courses", stage, r.Course.ID, r.Course.Code, r.Course.Schedule)
			}
			if r.Course.Code == "517122-165, -2560" && r.Course.Semester == "2" && r.Course.AcademicYear == 2568 {
				if r.Source != models.CourseInstructorImported {
					t.Fatalf("%s: real section %d has source %q", stage, r.Course.Section, r.Source)
				}
				realSections[r.Course.Section] = true
			}
		}
		if !realSections[1] || !realSections[2] {
			t.Fatalf("%s: real 517122-165, -2560 sections = %v, want 1 and 2", stage, realSections)
		}

		var c models.Course
		if err := DB.First(&c, demo.ID).Error; err != nil {
			t.Fatalf("%s: demo course row gone: %v", stage, err)
		}
		if c.Code != demoReportCourse.Code || c.Schedule != demoReportCourse.Schedule {
			t.Fatalf("%s: demo course changed to %q %q", stage, c.Code, c.Schedule)
		}
		if c.InstructorID != nil {
			t.Fatalf("%s: demo course still owned by instructor %d", stage, *c.InstructorID)
		}
		var live int64
		DB.Model(&models.CourseInstructor{}).Where("course_id = ? AND archived_at IS NULL", demo.ID).Count(&live)
		if live != 0 {
			t.Fatalf("%s: demo course has %d live instructor links", stage, live)
		}
		// Report history is reached through its reporter, not the course link.
		var reports int64
		DB.Model(&models.LabBoyReport{}).Where("course_id = ? AND reporter_id = ?", demo.ID, instructor.ID).Count(&reports)
		if reports == 0 {
			t.Fatalf("%s: demo report history missing", stage)
		}
	}
	check("fresh seed")

	connect()
	check("restart")

	// A database seeded by the old code: the demo course owned by the
	// instructor and linked as imported.
	if err := DB.Model(&models.Course{}).Where("id = ?", demo.ID).Update("instructor_id", instructor.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := DB.Create(&models.CourseInstructor{CourseID: demo.ID, InstructorID: instructor.ID, Source: models.CourseInstructorImported}).Error; err != nil {
		t.Fatal(err)
	}
	connect()
	check("legacy link cleaned up")
	var archived int64
	DB.Model(&models.CourseInstructor{}).Where("course_id = ? AND archived_at IS NOT NULL", demo.ID).Count(&archived)
	if archived != 1 {
		t.Fatalf("archived demo links = %d, want 1 kept for audit", archived)
	}
}
