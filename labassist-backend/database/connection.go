package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"labassist/config"
	"labassist/models"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// gormLogger logs slow/failed queries but treats a plain "record not found"
// as routine, not an error — callers like UserByID/CourseByID hit this
// constantly for lookups that are expected to miss (bad login, 404 course,
// InstructorID=0 placeholder on unmatched imports).
var gormLogger = logger.New(
	log.New(os.Stdout, "\r\n", log.LstdFlags),
	logger.Config{
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
	},
)

//go:embed Docker/user.sql
var userSeedSQL string

// DB is the MySQL connection backing all persistent application data.
var DB *gorm.DB

// Connect opens the MySQL connection, migrates the users and courses
// tables, and seeds users from user.sql the first time the table is empty.
func Connect(cfg *config.Config) error {
	dsnConfig := mysqldriver.NewConfig()
	dsnConfig.User = cfg.DBUser
	dsnConfig.Passwd = cfg.DBPassword
	dsnConfig.Net = "tcp"
	dsnConfig.Addr = net.JoinHostPort(cfg.DBHost, cfg.DBPort)
	dsnConfig.DBName = cfg.DBName
	dsnConfig.ParseTime = true
	dsnConfig.Loc = time.UTC
	dsnConfig.Params = map[string]string{"charset": "utf8mb4"}
	dsn := dsnConfig.FormatDSN()
	// docker compose up -d db returns before MySQL is actually accepting
	// connections yet, so a run right after starting the container (or right
	// after a codespace resume) would otherwise fail on the first attempt.
	// Retry with backoff instead of failing immediately.
	const maxAttempts = 15
	const retryDelay = 2 * time.Second

	var db *gorm.DB
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
			Logger: gormLogger,
			// Imported courses may have InstructorID=0 (no matching instructor
			// account found in the spreadsheet) — a real FK constraint would
			// reject that placeholder value, so constraints are left to the
			// application layer instead of the database here.
			DisableForeignKeyConstraintWhenMigrating: true,
		})
		if err == nil {
			var sqlDB *sql.DB
			if sqlDB, err = db.DB(); err == nil {
				err = sqlDB.Ping()
			}
		}
		if err == nil {
			break
		}
		if attempt == maxAttempts {
			return fmt.Errorf("connect to mysql after %d attempts: %w", maxAttempts, err)
		}
		log.Printf("mysql not ready yet (attempt %d/%d), retrying in %s: %v", attempt, maxAttempts, retryDelay, err)
		time.Sleep(retryDelay)
	}

	if err := db.AutoMigrate(&models.User{}); err != nil {
		return fmt.Errorf("migrate users table: %w", err)
	}
	if err := db.AutoMigrate(&models.Course{}); err != nil {
		return fmt.Errorf("migrate courses table: %w", err)
	}
	if err := db.AutoMigrate(&models.Transcript{}); err != nil {
		return fmt.Errorf("migrate transcripts table: %w", err)
	}
	// core_courses used to be unique on code alone. The same course can be in
	// both the IT and CS curricula (e.g. 517121), so the key is now
	// (program, code) — drop the old index first or AutoMigrate keeps it and
	// the second program's copy fails to insert.
	if db.Migrator().HasIndex(&models.CoreCourse{}, "idx_core_courses_code") {
		if err := db.Migrator().DropIndex(&models.CoreCourse{}, "idx_core_courses_code"); err != nil {
			return fmt.Errorf("drop legacy core_courses code index: %w", err)
		}
	}
	if err := db.AutoMigrate(&models.CoreCourse{}); err != nil {
		return fmt.Errorf("migrate core_courses table: %w", err)
	}

	// Admin-created accounts start with a blank email (filled in later via
	// Google sign-in), so multiple blank emails must be allowed — a plain
	// unique index would reject the second such account.
	if !db.Migrator().HasIndex(&models.User{}, "idx_users_email_unique") {
		if err := db.Exec(`CREATE UNIQUE INDEX idx_users_email_unique ON users ((NULLIF(email, '')))`).Error; err != nil {
			return fmt.Errorf("create users email unique index: %w", err)
		}
	}

	if err := migrateApplicationData(db); err != nil {
		return fmt.Errorf("migrate application data: %w", err)
	}
	DB = db

	if err := seedCoreCourses(); err != nil {
		return fmt.Errorf("seed core courses: %w", err)
	}

	// Classlist instructors and courses are real production data — seed them
	// regardless of SEED_DEMO_DATA so the system works out of the box.
	if err := seedClasslistInstructors(); err != nil {
		return fmt.Errorf("seed classlist instructors: %w", err)
	}

	if err := seedCoursesFromClasslist(); err != nil {
		return fmt.Errorf("seed courses from classlist: %w", err)
	}

	if !cfg.SeedDemoData {
		return nil
	}
	log.Println("SEED_DEMO_DATA enabled: populating demo accounts and applications")

	var count int64
	if err := DB.Model(&models.User{}).Count(&count).Error; err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count == 0 {
		if err := DB.Exec(userSeedSQL).Error; err != nil {
			return fmt.Errorf("seed users from user.sql: %w", err)
		}
		log.Println("Seeded users table from database/user.sql")
	}

	if err := seedMockApplicants(); err != nil {
		return fmt.Errorf("seed mock applicants: %w", err)
	}

	return nil
}
