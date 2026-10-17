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

// A section that meets on several days is one course row per day, so the demo
// course must be seeded the same way the classlist import splits courses.
func TestDemoSeedSplitsMultiDayCourseIntoOneRowPerDay(t *testing.T) {
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
	name := fmt.Sprintf("labassist_demo_seed_test_%d", time.Now().UnixNano())
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
	if err := Connect(&config.Config{
		DBHost: host, DBPort: port, DBUser: parsed.User, DBPassword: parsed.Passwd, DBName: name,
		SeedDemoData: true,
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn, _ := DB.DB(); conn.Close() })

	var demo []models.Course
	if err := DB.Where("code = ? AND section = ?", "517122", 1).Order("slot").Find(&demo).Error; err != nil {
		t.Fatal(err)
	}
	if len(demo) != 2 {
		t.Fatalf("demo course rows = %d, want 2 (one per day)", len(demo))
	}
	for i, want := range []string{"อ 13:00-16:00", "พฤ 13:00-16:00"} {
		if demo[i].Slot != i || demo[i].Schedule != want {
			t.Fatalf("row %d = slot %d %q, want slot %d %q", i, demo[i].Slot, demo[i].Schedule, i, want)
		}
		posting, ok := ActivePostingForCourse(demo[i].ID)
		if !ok || posting.Status != models.StatusOpen || posting.LabBoySlots != 6 {
			t.Fatalf("row %d posting = %+v, want open with 6 slots", i, posting)
		}
	}

	var onTuesday, onThursday int64
	DB.Model(&models.Application{}).Where("course_id = ?", demo[0].ID).Count(&onTuesday)
	DB.Model(&models.Application{}).Where("course_id = ?", demo[1].ID).Count(&onThursday)
	if onTuesday != 5 || onThursday != 0 {
		t.Fatalf("applications tue=%d thu=%d, want 5 and 0", onTuesday, onThursday)
	}

	var all []models.Course
	if err := DB.Find(&all).Error; err != nil {
		t.Fatal(err)
	}
	for _, c := range all {
		if days := SplitScheduleDays(c.Schedule); len(days) > 1 {
			t.Errorf("course %d (%s sec %d slot %d) spans %d days: %q", c.ID, c.Code, c.Section, c.Slot, len(days), c.Schedule)
		}
	}
}
