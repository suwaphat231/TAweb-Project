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

// openResetTestDB creates an empty database on the configured test server and
// returns a single-connection handle to it plus its parsed DSN.
func openResetTestDB(t *testing.T) (*gorm.DB, *mysqldriver.Config) {
	t.Helper()
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to a disposable MySQL server")
	}
	cfg, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	root, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("labassist_reset_test_%d", time.Now().UnixNano())
	if err := root.Exec("CREATE DATABASE `" + name + "`").Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Exec("DROP DATABASE `" + name + "`"); conn, _ := root.DB(); conn.Close() })
	cfg.DBName = name
	db, err := gorm.Open(mysql.Open(cfg.FormatDSN()), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	conn.SetMaxOpenConns(1)
	t.Cleanup(func() { conn.Close() })
	return db, cfg
}

func countTables(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var n int64
	if err := db.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()").Scan(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func TestResetSchemaDropsTablesWithForeignKeys(t *testing.T) {
	db, _ := openResetTestDB(t)
	for _, stmt := range []string{
		"CREATE TABLE parent (id INT PRIMARY KEY)",
		"CREATE TABLE child (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES parent(id))",
		"INSERT INTO parent VALUES (1)",
		"INSERT INTO child VALUES (1, 1)",
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := resetSchema(db); err != nil {
		t.Fatal(err)
	}
	if n := countTables(t, db); n != 0 {
		t.Fatalf("%d tables remain after reset", n)
	}
	var checks int
	if err := db.Raw("SELECT @@FOREIGN_KEY_CHECKS").Scan(&checks).Error; err != nil {
		t.Fatal(err)
	}
	if checks != 1 {
		t.Fatal("foreign key checks left disabled on the pooled connection")
	}
}

func TestResetSchemaOnEmptyDatabase(t *testing.T) {
	db, _ := openResetTestDB(t)
	if err := resetSchema(db); err != nil {
		t.Fatal(err)
	}
}

func TestConnectWithResetRebuildsDemoData(t *testing.T) {
	_, dsn := openResetTestDB(t)
	host, port, err := net.SplitHostPort(dsn.Addr)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		DBHost: host, DBPort: port, DBUser: dsn.User, DBPassword: dsn.Passwd, DBName: dsn.DBName,
		SeedDemoData: true, DevLogin: true, ResetDBOnStart: true,
	}
	old := DB
	t.Cleanup(func() { DB = old })
	connect := func() {
		t.Helper()
		if err := Connect(cfg); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn, _ := DB.DB(); conn.Close() })
	}
	countUsers := func() int64 {
		t.Helper()
		var n int64
		if err := DB.Model(&models.User{}).Count(&n).Error; err != nil {
			t.Fatal(err)
		}
		return n
	}

	connect()
	seeded := countUsers()
	if seeded == 0 {
		t.Fatal("demo users were not seeded")
	}
	probe := "reset_probe"
	if err := DB.Create(&models.User{Username: &probe, FullName: "Reset Probe", Email: "reset_probe@example.com", Role: models.RoleStudent}).Error; err != nil {
		t.Fatal(err)
	}

	connect()
	var probes int64
	if err := DB.Model(&models.User{}).Where("username = ?", probe).Count(&probes).Error; err != nil {
		t.Fatal(err)
	}
	if probes != 0 {
		t.Fatal("data created before restart survived the reset")
	}
	if n := countUsers(); n != seeded {
		t.Fatalf("users after reset = %d, want %d", n, seeded)
	}
}
