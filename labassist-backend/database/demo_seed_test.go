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

// The demo seed leaves every posting as a draft, and every seeded course is
// one row per meeting day, the way the classlist import splits courses.
func TestDemoSeedOpensNoPostingsAndSplitsDays(t *testing.T) {
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

	// The demo seed must never open a recruitment round itself — only an
	// instructor does that.
	var opened int64
	if err := DB.Model(&models.Posting{}).Where("is_active = true AND status <> ?", models.StatusDraft).Count(&opened).Error; err != nil {
		t.Fatal(err)
	}
	if opened != 0 {
		t.Fatalf("demo seed opened %d postings, want 0", opened)
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
